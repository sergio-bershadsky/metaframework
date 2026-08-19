import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadCatalog } from '../catalog/load'
import type { Catalog, Entity } from '../catalog/types'
import { bundleSchema } from './dereference'

/**
 * Bundling runs against the *shipped* catalog, because the property under test
 * is exactly the one a hermetic fixture would hide: every cross-entity `$ref` is
 * now an `http://` URL, and the bundler must satisfy it from disk. If the
 * catalog resolver ever stops matching, these tests do not fail with a wrong
 * shape — they fail by trying to reach the network, which is the point.
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

describe('bundleSchema', () => {
  it('resolves http $id references off the filesystem, with no network access', async () => {
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

  it('reports an unreadable reference instead of throwing', async () => {
    const money = entity('srn://acme/datamodel/money')
    const { schema, error } = await bundleSchema({ ...money, dir: '/nowhere/at/all' }, CATALOG)

    expect(schema).toBeNull()
    expect(error).toBeTruthy()
  })
})
