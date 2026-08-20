import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadCatalog } from '../catalog/load'
import type { Catalog, Entity } from '../catalog/types'
import { formatSrn, parseSrn } from '../srn/srn'
import { buildLineage } from './lineage'
import { buildSchemaRegistry, type SchemaNode, type SchemaRegistry } from './registry'
import { srnToSchemaUrl } from './url'

/**
 * Two suites, deliberately.
 *
 * The hermetic one states the *rules* — deepest-arrival placement, a name
 * contributed twice, a dangling base — on fixtures small enough to read in one
 * screen. The second runs the same derivation over the shipped catalog, because
 * the thing this module exists to answer ("where did `created-at` come from?")
 * is only believable if it is right about the real `base-record → discount →
 * coupon` chain and the real two-base `access-grant`.
 */

const DIALECT = 'https://json-schema.org/draft/2020-12/schema'

function url(relDir: string): string {
  return srnToSchemaUrl(`srn://${relDir}`)
}

function datamodel(relDir: string, source: SchemaNode, extra: Record<string, unknown> = {}): Entity {
  const parsed = parseSrn(`srn://${relDir}`)
  const srn = formatSrn({ ...parsed, version: null })
  const name = parsed.name as string
  const document = { $id: srnToSchemaUrl(srn), 'x-srn': srn, $schema: DIALECT, ...source }

  return {
    srn,
    parsed,
    kind: 'datamodel',
    relDir,
    dir: `/catalog/${relDir}`,
    frontmatter: {
      name,
      kind: 'datamodel',
      version: 1,
      title: name,
      summary: `The ${name} model.`,
      status: 'approved',
      usage: 'both',
      ...extra,
    },
    body: '',
    artifacts: [{ file: 'schema.json', extension: '.json', data: document, raw: JSON.stringify(document) }],
    relations: [],
    parent: null,
    children: [],
  }
}

function registryOf(entities: Entity[]): SchemaRegistry {
  const catalog: Catalog = {
    entities: new Map(entities.map((entity) => [entity.srn, entity])),
    solutions: ['srn://acme'],
    diagnostics: [],
    inbound: new Map(),
  }
  return buildSchemaRegistry(catalog)
}

/** Chain shape as one readable string: `a, b -> c -> d`. */
const chain = (levels: { name: string }[][]) => levels.map((level) => level.map((m) => m.name).join(', ')).join(' -> ')

/** Field names a member contributes. */
const fieldsOf = (view: { members: { name: string; fields: { name: string }[] }[] }, name: string) =>
  view.members.find((member) => member.name === name)?.fields.map((field) => field.name)

describe('buildLineage — composition chain', () => {
  it('orders a linear chain base-first and puts the model last', () => {
    const registry = registryOf([
      datamodel('acme/datamodel/base-record', {
        type: 'object',
        properties: { id: { type: 'string' }, 'created-at': { type: 'string' } },
        required: ['id', 'created-at'],
      }),
      datamodel('acme/datamodel/discount', {
        type: 'object',
        allOf: [{ $ref: url('acme/datamodel/base-record') }],
        properties: { label: { type: 'string' }, currency: { type: 'string' } },
      }),
      datamodel('acme/datamodel/coupon', {
        type: 'object',
        allOf: [{ $ref: url('acme/datamodel/discount') }],
        properties: { code: { type: 'string' } },
      }),
    ])

    const view = buildLineage(registry, 'srn://acme/datamodel/coupon')
    expect(view).not.toBeNull()
    expect(chain((view as NonNullable<typeof view>).levels)).toBe('base-record -> discount -> coupon')
    expect(view?.members.at(-1)?.own).toBe(true)
    expect(view?.inherits).toBe(true)
  })

  it('puts two bases of the same model in one level', () => {
    const registry = registryOf([
      datamodel('acme/datamodel/base-record', { type: 'object', properties: { id: { type: 'string' } } }),
      datamodel('acme/datamodel/auditable', { type: 'object', properties: { 'changed-by': { type: 'string' } } }),
      datamodel('acme/datamodel/access-grant', {
        type: 'object',
        allOf: [{ $ref: url('acme/datamodel/base-record') }, { $ref: url('acme/datamodel/auditable') }],
        properties: { scope: { type: 'string' } },
      }),
    ])

    const view = buildLineage(registry, 'srn://acme/datamodel/access-grant')
    expect(chain((view as NonNullable<typeof view>).levels)).toBe('base-record, auditable -> access-grant')
  })

  it('draws a diamond base behind its longest path, not its first', () => {
    // `wide` reaches `base` directly *and* through `middle`. Placing it at the
    // first arrival would draw a base to the right of its own descendant.
    const registry = registryOf([
      datamodel('acme/datamodel/base', { type: 'object', properties: { id: { type: 'string' } } }),
      datamodel('acme/datamodel/middle', {
        type: 'object',
        allOf: [{ $ref: url('acme/datamodel/base') }],
        properties: { m: { type: 'string' } },
      }),
      datamodel('acme/datamodel/wide', {
        type: 'object',
        allOf: [{ $ref: url('acme/datamodel/base') }, { $ref: url('acme/datamodel/middle') }],
        properties: { w: { type: 'string' } },
      }),
    ])

    const view = buildLineage(registry, 'srn://acme/datamodel/wide')
    expect(chain((view as NonNullable<typeof view>).levels)).toBe('base -> middle -> wide')
  })

  it('keeps an unresolvable base in the chain rather than hiding it', () => {
    const registry = registryOf([
      datamodel('acme/datamodel/orphan', {
        type: 'object',
        allOf: [{ $ref: url('acme/datamodel/does-not-exist') }],
        properties: { a: { type: 'string' } },
      }),
    ])

    const view = buildLineage(registry, 'srn://acme/datamodel/orphan')
    const missing = view?.members[0]
    expect(missing?.status).toBe('unresolved')
    expect(missing?.error?.code).toBe('E_SRN_DANGLING')
    expect(view?.members.at(-1)?.name).toBe('orphan')
  })

  it('terminates on an inheritance cycle and marks the members cyclic', () => {
    const registry = registryOf([
      datamodel('acme/datamodel/a', { type: 'object', allOf: [{ $ref: url('acme/datamodel/b') }] }),
      datamodel('acme/datamodel/b', { type: 'object', allOf: [{ $ref: url('acme/datamodel/a') }] }),
    ])

    const view = buildLineage(registry, 'srn://acme/datamodel/a')
    expect(view?.members.map((member) => member.name).sort()).toEqual(['a', 'b'])
    expect(view?.members.every((member) => member.status === 'cyclic' || member.own)).toBe(true)
  })

  it('lists the models that extend this one, even with no ancestors of its own', () => {
    const registry = registryOf([
      datamodel('acme/datamodel/base-record', { type: 'object', properties: { id: { type: 'string' } } }),
      datamodel('acme/datamodel/role', { type: 'object', allOf: [{ $ref: url('acme/datamodel/base-record') }] }),
      datamodel('acme/datamodel/permission', { type: 'object', allOf: [{ $ref: url('acme/datamodel/base-record') }] }),
    ])

    const view = buildLineage(registry, 'srn://acme/datamodel/base-record')
    expect(view?.inherits).toBe(false)
    expect(view?.descendants.map((relative) => relative.name)).toEqual(['permission', 'role'])
  })

  it('returns null for a ref that names no schema', () => {
    expect(buildLineage(registryOf([]), 'srn://acme/datamodel/nothing')).toBeNull()
  })
})

describe('buildLineage — field attribution', () => {
  it('attributes each name to the schema that contributed it', () => {
    const registry = registryOf([
      datamodel('acme/datamodel/base-record', {
        type: 'object',
        properties: { id: { type: 'string' }, 'created-at': { type: 'string' } },
        required: ['id', 'created-at'],
      }),
      datamodel('acme/datamodel/coupon', {
        type: 'object',
        allOf: [{ $ref: url('acme/datamodel/base-record') }],
        properties: { code: { type: 'string' } },
        required: ['code'],
      }),
    ])

    const view = buildLineage(registry, 'srn://acme/datamodel/coupon')
    expect(fieldsOf(view as NonNullable<typeof view>, 'base-record')).toEqual(['id', 'created-at'])
    expect(fieldsOf(view as NonNullable<typeof view>, 'coupon')).toEqual(['code'])
  })

  it('shows a narrowed name under every schema that constrains it', () => {
    // allOf intersects: the derived model does not replace the base's `label`,
    // it adds a second constraint to it. Both contributors must be visible.
    const registry = registryOf([
      datamodel('acme/datamodel/base-record', {
        type: 'object',
        properties: { label: { type: 'string' } },
      }),
      datamodel('acme/datamodel/coupon', {
        type: 'object',
        allOf: [{ $ref: url('acme/datamodel/base-record') }],
        properties: { label: { maxLength: 20 } },
      }),
    ])

    const view = buildLineage(registry, 'srn://acme/datamodel/coupon')
    const own = view?.members.find((member) => member.own)?.fields.find((field) => field.name === 'label')
    const inherited = view?.members[0]?.fields.find((field) => field.name === 'label')

    expect(own?.narrowed).toBe(true)
    expect(own?.alsoFrom).toEqual(['base-record'])
    expect(inherited?.narrowed).toBe(true)
    expect(inherited?.alsoFrom).toEqual(['coupon'])
  })

  it('flags a name the conjunction constrains to disjoint types', () => {
    const registry = registryOf([
      datamodel('acme/datamodel/base-record', { type: 'object', properties: { id: { type: 'string' } } }),
      datamodel('acme/datamodel/coupon', {
        type: 'object',
        allOf: [{ $ref: url('acme/datamodel/base-record') }],
        properties: { id: { type: 'integer' } },
      }),
    ])

    const view = buildLineage(registry, 'srn://acme/datamodel/coupon')
    expect(view?.members.every((member) => member.fields.every((field) => field.contradiction))).toBe(true)
  })

  it('credits the schema that made an inherited name required, not the one that declared it', () => {
    // Invisible in a flattened document, and exactly the kind of tightening a
    // reviewer needs to find: the base leaves `note` optional, the derived
    // model makes it mandatory without redeclaring its shape.
    const registry = registryOf([
      datamodel('acme/datamodel/base-record', { type: 'object', properties: { note: { type: 'string' } } }),
      datamodel('acme/datamodel/coupon', {
        type: 'object',
        allOf: [{ $ref: url('acme/datamodel/base-record') }],
        required: ['note'],
      }),
    ])

    const view = buildLineage(registry, 'srn://acme/datamodel/coupon')
    expect(view?.members[0]?.fields).toEqual([
      { name: 'note', required: false, deprecated: false, contradiction: false, narrowed: true, alsoFrom: ['coupon'] },
    ])
    expect(view?.members[1]?.fields).toEqual([
      {
        name: 'note',
        required: true,
        deprecated: false,
        contradiction: false,
        narrowed: true,
        alsoFrom: ['base-record'],
      },
    ])
  })

  it('marks required against the schema whose own `required` lists the name', () => {
    const registry = registryOf([
      datamodel('acme/datamodel/base-record', {
        type: 'object',
        properties: { id: { type: 'string' }, hint: { type: 'string' } },
        required: ['id'],
      }),
      datamodel('acme/datamodel/coupon', {
        type: 'object',
        allOf: [{ $ref: url('acme/datamodel/base-record') }],
        properties: { code: { type: 'string' } },
        required: ['code'],
      }),
    ])

    const view = buildLineage(registry, 'srn://acme/datamodel/coupon')
    const required = (name: string) =>
      view?.members.find((member) => member.name === name)?.fields.map((f) => `${f.name}${f.required ? '*' : ''}`)

    expect(required('base-record')).toEqual(['id*', 'hint'])
    expect(required('coupon')).toEqual(['code*'])
  })

  it('attributes a name that is only ever required to whoever required it', () => {
    const registry = registryOf([
      datamodel('acme/datamodel/base-record', { type: 'object', required: ['ghost'] }),
      datamodel('acme/datamodel/coupon', {
        type: 'object',
        allOf: [{ $ref: url('acme/datamodel/base-record') }],
        properties: { code: { type: 'string' } },
      }),
    ])

    const view = buildLineage(registry, 'srn://acme/datamodel/coupon')
    expect(fieldsOf(view as NonNullable<typeof view>, 'base-record')).toEqual(['ghost'])
  })

  it('carries `deprecated` through from the contributing subschema', () => {
    const registry = registryOf([
      datamodel('acme/datamodel/base-record', {
        type: 'object',
        properties: { legacy: { type: 'string', deprecated: true } },
      }),
      datamodel('acme/datamodel/coupon', { type: 'object', allOf: [{ $ref: url('acme/datamodel/base-record') }] }),
    ])

    const view = buildLineage(registry, 'srn://acme/datamodel/coupon')
    expect(view?.members[0]?.fields[0]).toMatchObject({ name: 'legacy', deprecated: true })
  })
})

describe('buildLineage — the shipped catalog', () => {
  let registry: SchemaRegistry

  beforeAll(async () => {
    const catalog = await loadCatalog({ catalogDir: path.resolve(process.cwd(), '../../solutions') })
    registry = buildSchemaRegistry(catalog)
  })

  it('reconstructs base-record → discount → coupon', () => {
    const view = buildLineage(registry, 'srn://acme/product/growth/datamodel/coupon')
    expect(chain((view as NonNullable<typeof view>).levels)).toBe('base-record -> discount -> coupon')

    // The question this module exists to answer.
    expect(fieldsOf(view as NonNullable<typeof view>, 'base-record')).toContain('created-at')
    expect(fieldsOf(view as NonNullable<typeof view>, 'discount')).toContain('currency')
    expect(fieldsOf(view as NonNullable<typeof view>, 'coupon')).toContain('code')
    expect(fieldsOf(view as NonNullable<typeof view>, 'coupon')).not.toContain('created-at')
    expect(view?.members.every((member) => member.status === 'ok')).toBe(true)
  })

  it('shows both bases of access-grant in one level and its two descendants', () => {
    const view = buildLineage(registry, 'srn://acme/product/identity/datamodel/access-grant')
    expect(chain((view as NonNullable<typeof view>).levels)).toBe('base-record, auditable -> access-grant')
    expect(fieldsOf(view as NonNullable<typeof view>, 'auditable')).toEqual(['changed-by', 'change-reason'])
    expect(view?.descendants.map((relative) => relative.name)).toEqual(['permission', 'role'])
  })

  it('reaches four levels for role, whose base is itself doubly composed', () => {
    const view = buildLineage(registry, 'srn://acme/product/identity/datamodel/role')
    expect(chain((view as NonNullable<typeof view>).levels)).toBe('base-record, auditable -> access-grant -> role')
    expect(fieldsOf(view as NonNullable<typeof view>, 'access-grant')).toContain('scope')
  })

  it('reports no lineage for a model that neither extends nor is extended', () => {
    const view = buildLineage(registry, 'srn://acme/datamodel/money')
    expect(view?.inherits).toBe(false)
  })
})
