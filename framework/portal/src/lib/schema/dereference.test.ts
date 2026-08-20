import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadCatalog } from '../catalog/load'
import type { Catalog, Entity } from '../catalog/types'
import { bundleSchema } from './dereference'

/**
 * Bundling runs against the *shipped* catalog, because the property under test
 * is exactly the one a hermetic fixture would hide: every cross-entity `$ref` is
 * a canonical `https://schemas.metaframework.dev/…` URL, and the bundler must
 * satisfy it from disk. If the catalog resolver ever stops matching, these tests
 * do not fail with a wrong shape — they fail by trying to reach the network,
 * which is the point.
 */

const CATALOG = path.resolve(process.cwd(), '../../solutions')

let catalog: Catalog

beforeAll(async () => {
  catalog = await loadCatalog({ catalogDir: CATALOG })
})

function entity(srn: string): Entity {
  const found = catalog.entities.get(srn)
  if (!found) throw new Error(`fixture entity ${srn} is missing`)
  return found
}

/** Every object in a document, with the JSON Pointer it sits at. */
function* nodesOf(
  node: unknown,
  pointer = '',
): Generator<{ pointer: string; node: Record<string, unknown> }> {
  if (Array.isArray(node)) {
    for (const [index, item] of node.entries()) yield* nodesOf(item, `${pointer}/${index}`)
    return
  }
  if (typeof node !== 'object' || node === null) return
  yield { pointer, node: node as Record<string, unknown> }
  for (const [key, value] of Object.entries(node)) {
    yield* nodesOf(value, `${pointer}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`)
  }
}

/** RFC 6901 evaluation, so the test resolves pointers the way a reader does. */
function resolvePointer(document: unknown, pointer: string): unknown {
  if (pointer === '') return document
  let cursor = document
  for (const raw of pointer.split('/').slice(1)) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~')
    if (typeof cursor !== 'object' || cursor === null) return undefined
    cursor = Array.isArray(cursor) ? cursor[Number(key)] : (cursor as Record<string, unknown>)[key]
  }
  return cursor
}

describe('bundleSchema', () => {
  it('resolves canonical $id references off the filesystem, with no network access', async () => {
    const order = entity('srn://acme/product/shop/component/checkout/component/payment/datamodel/order')
    const { schema, error } = await bundleSchema(order, CATALOG)

    expect(error).toBeNull()
    const document = schema as Record<string, unknown>
    // The inherited base arrived as a real subschema, not as a left-over $ref.
    const allOf = document.allOf as Array<Record<string, unknown>>
    const inherited = allOf.flatMap((branch) => Object.keys((branch.properties ?? {}) as object))
    expect(inherited).toContain('id')
    expect(inherited).toContain('created-at')
    expect(inherited).toContain('change-reason')
  })

  it('names every document it pulled in, in catalog terms rather than URLs', async () => {
    const order = entity('srn://acme/product/shop/component/checkout/component/payment/datamodel/order')
    const { sources } = await bundleSchema(order, CATALOG)

    // Direct bases and property targets, plus what those pull in transitively.
    expect(sources).toContain('acme/datamodel/base-record/schema.json')
    expect(sources).toContain('acme/datamodel/auditable/schema.json')
    expect(sources).toContain('acme/datamodel/money/schema.json')
    expect(sources).toContain('acme/product/shop/datamodel/order-line/schema.json')
    // Its own file is never listed as a source of itself.
    expect(sources).not.toContain(
      'acme/product/shop/component/checkout/component/payment/datamodel/order/schema.json',
    )
  })

  it('bundles a union without expanding either branch twice', async () => {
    const method = entity('srn://acme/product/shop/datamodel/payment-method')
    const { schema, sources, error } = await bundleSchema(method, CATALOG)

    expect(error).toBeNull()
    expect((schema as { oneOf: unknown[] }).oneOf).toHaveLength(2)
    expect(sources).toEqual([
      'acme/product/shop/datamodel/card-payment/schema.json',
      'acme/product/shop/datamodel/sepa-payment/schema.json',
    ])
  })

  /**
   * The property the schema viewer depends on, and the one the entity prose
   * claims of the *served* document: one resource, reachable end to end.
   *
   * `bundle` on its own does not deliver it. It inlines each external document
   * with its `$id` intact, and a nested `$id` re-bases every reference beneath
   * it — so the bundler writes cross-boundary pointers as full URLs (which the
   * viewer's tree builder rejects as external) and leaves an inlined document's
   * private `#/$defs/…` pointers pointing at the *root's* `$defs`, where they
   * either miss or, worse, hit a same-named shape that means something else.
   *
   * Measured before the flattening pass existed: 50 full-URL refs across 14
   * datamodels, plus 34 stranded local pointers across 10 — 84 rows in all that
   * a reader saw as a raw `$ref` instead of the field it stands for, and one
   * (`order`'s `lines/items/quantity` → `#/$defs/positive-int`) that silently
   * resolved against the wrong document because both happened to define it.
   */
  it('leaves every schema in the catalog as one resource with only local, resolvable refs', async () => {
    const datamodels = [...catalog.entities.values()].filter((it) => it.kind === 'datamodel')
    expect(datamodels.length).toBeGreaterThan(50)

    const nested: string[] = []
    const unreachable: string[] = []

    for (const datamodel of datamodels) {
      const { schema, error } = await bundleSchema(datamodel, CATALOG)
      expect(error, datamodel.srn).toBeNull()

      for (const { pointer, node } of nodesOf(schema)) {
        if (pointer !== '' && typeof node.$id === 'string') nested.push(`${datamodel.srn} ${pointer}`)
        if (typeof node.$ref !== 'string') continue
        // Local, and it lands on something. Exactly the two conditions the
        // viewer's `_resolveRef` imposes before it will follow a reference.
        if (!node.$ref.startsWith('#') || resolvePointer(schema, node.$ref.slice(1)) === undefined) {
          unreachable.push(`${datamodel.srn} ${pointer} -> ${node.$ref}`)
        }
      }
    }

    expect(nested).toEqual([])
    expect(unreachable).toEqual([])
  })

  it('rewrites an inlined document’s private pointers to where it was inlined', async () => {
    const order = entity('srn://acme/product/shop/component/checkout/component/payment/datamodel/order')
    const { schema } = await bundleSchema(order, CATALOG)

    const line = resolvePointer(schema, '/properties/lines/items') as Record<string, unknown>
    const properties = line.properties as Record<string, { $ref?: string }>

    // `order-line` says `#/$defs/line-tax`, meaning *its own* `$defs`. Read
    // against the root that pointer misses, because the root's `$defs` holds
    // only `positive-int` — so it must now name the place order-line landed.
    expect(properties.tax.$ref).toBe('#/properties/lines/items/$defs/line-tax')
    // And this one is the dangerous case: the name exists in both documents.
    expect(properties.quantity.$ref).toBe('#/properties/lines/items/$defs/positive-int')
    // The root's own private pointer is untouched — it was already correct.
    const own = (schema as { properties: Record<string, { $ref?: string }> }).properties
    expect(own['line-count'].$ref).toBe('#/$defs/positive-int')
    // A cross-document reference the bundler had to spell as a full URL.
    expect(properties['unit-price'].$ref).toBe('#/properties/total')
  })

  it('reports an unreadable reference instead of throwing', async () => {
    const money = entity('srn://acme/datamodel/money')
    const { schema, error } = await bundleSchema({ ...money, dir: '/nowhere/at/all' }, CATALOG)

    expect(schema).toBeNull()
    expect(error).toBeTruthy()
  })
})
