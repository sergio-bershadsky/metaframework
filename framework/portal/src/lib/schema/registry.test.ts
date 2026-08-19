import { describe, expect, it } from 'vitest'
import {
  buildSchemaBundle,
  buildSchemaRegistry,
  effectiveModel,
  nodeKey,
  resolveSchema,
  schemaValidator,
  type SchemaNode,
  type SchemaRegistry,
} from './registry'
import type { Catalog, Entity } from '../catalog/types'
import { formatSrn, parseSrn } from '../srn/srn'

/**
 * The fixture is in-memory: the registry only ever sees a loaded Catalog, so
 * these tests must not depend on a filesystem walk. Cases follow the worked
 * example and the composition patterns in framework/spec/kinds/datamodel.md.
 *
 * Every `$ref` below is a relative file path to another `schema.json`, exactly
 * as a stock generator would resolve it, and no document carries `$id`
 * (decision-record 2026-08-19-b).
 */

const DIALECT = 'https://json-schema.org/draft/2020-12/schema'

function datamodel(relDir: string, source: SchemaNode | null, extra: Record<string, unknown> = {}): Entity {
  const parsed = parseSrn(`srn://${relDir}`)
  const srn = formatSrn({ ...parsed, version: null })
  const name = parsed.name as string
  // x-srn is provenance, so the helper writes the true one and every fixture
  // document looks like a shipped schema.json; a case that wants drift or a
  // stray $id declares it itself and wins the spread.
  const document = source === null ? null : { 'x-srn': srn, ...source }
  const raw = document ? `${JSON.stringify(document, null, 2)}\n` : ''

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
    artifacts: document ? [{ file: 'schema.json', extension: '.json', data: document, raw }] : [],
    relations: [],
    parent: null,
    children: [],
  }
}

function catalogOf(entities: Entity[]): Catalog {
  return {
    entities: new Map(entities.map((entity) => [entity.srn, entity])),
    solutions: ['srn://acme'],
    diagnostics: [],
    inbound: new Map(),
  }
}

const baseRecord: SchemaNode = {
  $schema: DIALECT,
  title: 'Base record',
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid', description: 'Stable identity.' },
    'created-at': { type: 'string', format: 'date-time' },
  },
  required: ['id', 'created-at'],
}

const money: SchemaNode = {
  $schema: DIALECT,
  title: 'Money',
  type: 'object',
  properties: {
    amount: { type: 'string', pattern: '^-?[0-9]+\\.[0-9]{2}$' },
    currency: { type: 'string', minLength: 3, maxLength: 3 },
  },
  required: ['amount', 'currency'],
}

const order: SchemaNode = {
  $schema: DIALECT,
  title: 'Order',
  type: 'object',
  // Eight `..` — the order sits eight directories below its solution root, and
  // a kind bucket is a directory like any other.
  allOf: [{ $ref: '../../../../../../../../datamodel/base-record/schema.json' }],
  properties: {
    total: { $ref: '../../../../../../../../datamodel/money/schema.json', description: 'Gross amount payable.' },
    discount: { $ref: '../../../../../../../../datamodel/money/schema.json' },
    status: { enum: ['placed', 'paid', 'refunded'] },
    'line-count': { $ref: '#/$defs/positive-int' },
    refund: { $ref: '../refund/schema.json' },
  },
  required: ['total'],
  $defs: { 'positive-int': { type: 'integer', minimum: 1 } },
}

const refund: SchemaNode = {
  $schema: DIALECT,
  title: 'Refund',
  type: 'object',
  properties: { reason: { type: 'string' } },
}

const paymentMethod: SchemaNode = {
  $schema: DIALECT,
  title: 'Payment method',
  oneOf: [{ $ref: '../card-payment/schema.json' }, { $ref: '../sepa-payment/schema.json' }],
}

const cardPayment: SchemaNode = {
  $schema: DIALECT,
  title: 'Card payment',
  type: 'object',
  properties: { method: { const: 'card' }, 'pan-last4': { type: 'string' } },
  required: ['method', 'pan-last4'],
}

const sepaPayment: SchemaNode = {
  $schema: DIALECT,
  title: 'SEPA payment',
  type: 'object',
  // Inherits the tag property through allOf, which the flattener must see.
  allOf: [{ $ref: '../sepa-tag/schema.json' }],
  properties: { iban: { type: 'string' } },
  required: ['iban'],
}

const sepaTag: SchemaNode = {
  $schema: DIALECT,
  title: 'SEPA tag',
  type: 'object',
  properties: { method: { const: 'sepa' } },
  required: ['method'],
}

const broken: SchemaNode = {
  $schema: DIALECT,
  title: 'Broken',
  type: 'object',
  allOf: [{ $ref: '../nope/schema.json' }],
  properties: { loose: { $ref: '../../../../datamodel/money/schema.json' } },
}

const loopA: SchemaNode = {
  $schema: DIALECT,
  title: 'Loop A',
  type: 'object',
  allOf: [{ $ref: '../loop-b/schema.json' }],
  properties: { a: { type: 'string' } },
}

const loopB: SchemaNode = {
  $schema: DIALECT,
  title: 'Loop B',
  type: 'object',
  allOf: [{ $ref: '../loop-a/schema.json' }],
  properties: { b: { type: 'string' } },
}

function fixture(): SchemaRegistry {
  return buildSchemaRegistry(
    catalogOf([
      datamodel('acme/datamodel/base-record', baseRecord, { abstract: true }),
      datamodel('acme/datamodel/money', money),
      datamodel('acme/product/shop/component/checkout/component/payment/datamodel/order', order, { version: 3 }),
      datamodel('acme/product/shop/component/checkout/component/payment/datamodel/refund', refund),
      datamodel('acme/product/shop/datamodel/payment-method', paymentMethod),
      datamodel('acme/product/shop/datamodel/card-payment', cardPayment),
      datamodel('acme/product/shop/datamodel/sepa-payment', sepaPayment),
      datamodel('acme/product/shop/datamodel/sepa-tag', sepaTag),
      datamodel('acme/product/shop/datamodel/broken', broken),
      datamodel('acme/product/shop/datamodel/loop-a', loopA),
      datamodel('acme/product/shop/datamodel/loop-b', loopB),
      datamodel('acme/product/shop/datamodel/prose-only', null),
    ]),
  )
}

const ORDER = 'acme/product/shop/component/checkout/component/payment/datamodel/order/schema.json'
const BASE = 'acme/datamodel/base-record/schema.json'
const MONEY = 'acme/datamodel/money/schema.json'
const LOOP_A = 'acme/product/shop/datamodel/loop-a/schema.json'
const LOOP_B = 'acme/product/shop/datamodel/loop-b/schema.json'

const MONEY_FROM_ORDER = '../../../../../../../../datamodel/money/schema.json'

function codes(registry: SchemaRegistry, srn: string): string[] {
  return registry.diagnostics.filter((diagnostic) => diagnostic.srn === srn).map((diagnostic) => diagnostic.code)
}

const ORDER_SRN = 'srn://acme/product/shop/component/checkout/component/payment/datamodel/order'

describe('buildSchemaRegistry — keying', () => {
  it('keys each document by its catalog-relative path and aliases both SRN forms', () => {
    const registry = fixture()
    expect(resolveSchema(registry, ORDER)?.id).toBe(ORDER)
    expect(resolveSchema(registry, ORDER_SRN)?.id).toBe(ORDER)
    expect(resolveSchema(registry, `${ORDER_SRN}@3`)?.id).toBe(ORDER)
  })

  it('derives the owning entity SRN from the path', () => {
    const registry = fixture()
    expect(resolveSchema(registry, ORDER)?.srn).toBe(ORDER_SRN)
    expect(resolveSchema(registry, BASE)?.srn).toBe('srn://acme/datamodel/base-record')
  })

  it('resolves a relative file path against the referring schema', () => {
    const registry = fixture()
    expect(resolveSchema(registry, MONEY_FROM_ORDER, ORDER)?.id).toBe(MONEY)
    expect(resolveSchema(registry, '../refund/schema.json', ORDER)?.srn).toBe(
      'srn://acme/product/shop/component/checkout/component/payment/datamodel/refund',
    )
  })

  it('reports a datamodel entity with no schema.json', () => {
    const registry = fixture()
    expect(codes(registry, 'srn://acme/product/shop/datamodel/prose-only')).toContain('E_DM_SCHEMA_MISSING')
  })
})

describe('stock JSON Schema resolution', () => {
  it('validates through ajv with every $ref shape resolved by the registry', () => {
    const registry = fixture()
    const validate = schemaValidator(registry, ORDER)
    expect(validate).not.toBeNull()

    const instance = {
      id: '0f6f0f2a-1a6b-4a0e-9c3a-6a2f4a0c1d55',
      'created-at': '2026-08-19T09:41:00Z',
      total: { amount: '49.90', currency: 'EUR' },
      'line-count': 2,
    }
    expect(validate?.(instance)).toBe(true)
    // The inherited `required` comes from base-record via allOf + $ref.
    expect(validate?.({ total: { amount: '49.90', currency: 'EUR' } })).toBe(false)
    // The nested value object comes from an eight-levels-up relative file path.
    expect(validate?.({ ...instance, total: { amount: '49.90' } })).toBe(false)
    // The local $defs pointer is entity-private but still enforced.
    expect(validate?.({ ...instance, 'line-count': 0 })).toBe(false)
  })
})

describe('inheritance graph', () => {
  it('derives child → base edges from root allOf only', () => {
    const registry = fixture()
    expect(registry.inheritance.bases.get(ORDER)).toEqual([BASE])
    expect(registry.inheritance.derived.get(BASE)).toContain(ORDER)
    // `total` refs money from a property, which is composition, not inheritance.
    expect(registry.inheritance.derived.get(MONEY) ?? []).not.toContain(ORDER)
  })
})

describe('effective fields', () => {
  it('annotates every property with the ancestor that contributed it', () => {
    const registry = fixture()
    const model = effectiveModel(registry, ORDER)
    const byName = new Map(model?.properties.map((property) => [property.name, property]))

    expect(byName.get('id')?.origin).toBe(BASE)
    expect(byName.get('id')?.own).toBe(false)
    expect(byName.get('total')?.origin).toBe(ORDER)
    expect(byName.get('total')?.own).toBe(true)
    // Own fields lead; inherited ones follow in expansion order.
    expect(model?.properties.map((property) => property.name).slice(0, 5)).toEqual([
      'total',
      'discount',
      'status',
      'line-count',
      'refund',
    ])
  })

  it('unions required across every branch', () => {
    const registry = fixture()
    const model = effectiveModel(registry, ORDER)
    expect(model?.required).toEqual(['created-at', 'id', 'total'])
    expect(model?.properties.find((property) => property.name === 'id')?.required).toBe(true)
  })

  it('reports the lineage as a chain with the model at depth 0', () => {
    const registry = fixture()
    const model = effectiveModel(registry, ORDER)
    expect(model?.lineage.map((node) => [node.id, node.depth, node.status])).toEqual([
      [ORDER, 0, 'ok'],
      [BASE, 1, 'ok'],
    ])
    expect(model?.lineage[1].contributes).toBe(2)
  })

  it('marks a name contributed twice as restricted and flags disjoint types', () => {
    const registry = buildSchemaRegistry(
      catalogOf([
        datamodel('acme/datamodel/base-record', {
          $schema: DIALECT,
          type: 'object',
          properties: { id: { type: 'string' }, note: { type: 'string' } },
        }),
        datamodel('acme/product/shop/datamodel/narrow', {
          $schema: DIALECT,
          type: 'object',
          allOf: [{ $ref: '../../../../datamodel/base-record/schema.json' }],
          properties: { id: { type: 'integer' }, note: { minLength: 8 } },
        }),
      ]),
    )
    const model = effectiveModel(registry, 'acme/product/shop/datamodel/narrow/schema.json')
    const id = model?.properties.find((property) => property.name === 'id')
    const note = model?.properties.find((property) => property.name === 'note')

    expect(id?.restricted).toBe(true)
    expect(id?.contradiction).toBe(true)
    expect(note?.restricted).toBe(true)
    expect(note?.contradiction).toBe(false)
    expect(model?.diagnostics.map((diagnostic) => diagnostic.code)).toContain('W_DM_CONTRADICTION')
  })
})

describe('discriminated unions', () => {
  it('derives a variant map from oneOf with a shared const tag', () => {
    const registry = fixture()
    const bundle = buildSchemaBundle(registry, 'acme/product/shop/datamodel/payment-method/schema.json')
    const union = bundle?.unions[nodeKey('acme/product/shop/datamodel/payment-method/schema.json', '')]

    expect(union?.derivable).toBe(true)
    expect(union?.tag).toBe('method')
    // sepa-payment carries its tag through allOf, so the flattener must find it.
    expect(union?.variants.map((variant) => variant.tag)).toEqual(['card', 'sepa'])
    expect(union?.variants.map((variant) => variant.srn)).toEqual([
      'srn://acme/product/shop/datamodel/card-payment',
      'srn://acme/product/shop/datamodel/sepa-payment',
    ])
  })

  it('falls back to an opaque union when no shared tag exists', () => {
    const registry = buildSchemaRegistry(
      catalogOf([
        datamodel('acme/product/shop/datamodel/untagged', {
          $schema: DIALECT,
          oneOf: [
            { type: 'object', required: ['pan-last4'], properties: { 'pan-last4': { type: 'string' } } },
            { type: 'object', required: ['iban'], properties: { iban: { type: 'string' } } },
          ],
        }),
      ]),
    )
    const id = 'acme/product/shop/datamodel/untagged/schema.json'
    const bundle = buildSchemaBundle(registry, id)
    const union = bundle?.unions[nodeKey(id, '')]

    expect(union?.derivable).toBe(false)
    expect(union?.tag).toBeNull()
    expect(union?.variants).toHaveLength(2)
    expect(bundle?.diagnostics.map((diagnostic) => diagnostic.code)).toContain('W_DM_UNION_TAG')
  })
})

describe('unresolvable references', () => {
  it('records a dangling $ref as an error instead of dropping it', () => {
    const registry = fixture()
    const dangling = registry.resolutions
      .get('acme/product/shop/datamodel/broken/schema.json')
      ?.get('../nope/schema.json')

    expect(dangling?.targetId).toBeNull()
    // The path is still a legal entity address, so the author is told which one.
    expect(dangling?.targetSrn).toBe('srn://acme/product/shop/datamodel/nope')
    expect(dangling?.error?.code).toBe('E_SRN_DANGLING')
    expect(codes(registry, 'srn://acme/product/shop/datamodel/broken')).toContain('E_SRN_DANGLING')
  })

  it('surfaces an unresolvable base in the lineage rather than silently skipping it', () => {
    const registry = fixture()
    const model = effectiveModel(registry, 'acme/product/shop/datamodel/broken/schema.json')
    const unresolved = model?.lineage.find((node) => node.status === 'unresolved')

    expect(unresolved?.ref).toBe('../nope/schema.json')
    expect(unresolved?.error?.code).toBe('E_SRN_DANGLING')
    expect(model?.diagnostics.map((diagnostic) => diagnostic.code)).toContain('E_SRN_DANGLING')
  })

  it('flags a $ref into another entity’s $defs', () => {
    const registry = buildSchemaRegistry(
      catalogOf([
        datamodel('acme/datamodel/money', money),
        datamodel('acme/product/shop/datamodel/nosy', {
          $schema: DIALECT,
          type: 'object',
          properties: { c: { $ref: '../../../../datamodel/money/schema.json#/$defs/currency' } },
        }),
      ]),
    )
    expect(codes(registry, 'srn://acme/product/shop/datamodel/nosy')).toContain('E_DM_FOREIGN_DEFS')
  })
})

describe('reference form', () => {
  /** Each case is a single datamodel whose only defect is the `$ref` under test. */
  function refCodes(ref: string): string[] {
    const registry = buildSchemaRegistry(
      catalogOf([
        datamodel('acme/datamodel/money', money),
        datamodel('acme/product/shop/datamodel/probe', {
          $schema: DIALECT,
          type: 'object',
          properties: { value: { $ref: ref } },
        }),
      ]),
    )
    return codes(registry, 'srn://acme/product/shop/datamodel/probe')
  }

  it('rejects a $ref that climbs above the catalog root', () => {
    expect(refCodes('../../../../../../elsewhere/schema.json')).toContain('E_DM_REF_ESCAPE')
  })

  it('rejects a $ref that lands in another solution', () => {
    expect(refCodes('../../../../../globex/datamodel/money/schema.json')).toContain('E_SRN_CROSS_SOLUTION')
  })

  it('rejects a $ref that does not name a schema.json', () => {
    expect(refCodes('../../../../datamodel/money')).toContain('E_DM_REF_TARGET')
  })

  it('rejects an SRN $ref — stock tooling cannot open a private URI scheme', () => {
    expect(refCodes('srn://acme/datamodel/money@1')).toContain('E_DM_REF_TARGET')
  })

  it('rejects a root-absolute $ref, which has no base without $id', () => {
    expect(refCodes('/acme/datamodel/money/schema.json')).toContain('E_DM_REF_TARGET')
  })

  it('accepts the relative file path a generator would follow', () => {
    expect(refCodes('../../../../datamodel/money/schema.json')).toEqual([])
  })
})

describe('provenance and identity', () => {
  it('accepts an x-srn that agrees with the file’s path', () => {
    const registry = fixture()
    expect(codes(registry, 'srn://acme/datamodel/money')).toEqual([])
  })

  it('reports an x-srn that disagrees with the file’s path', () => {
    const registry = buildSchemaRegistry(
      catalogOf([datamodel('acme/datamodel/money', { ...money, 'x-srn': 'srn://acme/product/shop/datamodel/money' })]),
    )
    expect(codes(registry, 'srn://acme/datamodel/money')).toContain('E_DM_SRN_MISMATCH')
  })

  it('reports a versioned x-srn — the annotation is the entity, not a pin', () => {
    const registry = buildSchemaRegistry(
      catalogOf([datamodel('acme/datamodel/money', { ...money, 'x-srn': 'srn://acme/datamodel/money@1' })]),
    )
    expect(codes(registry, 'srn://acme/datamodel/money')).toContain('E_DM_SRN_MISMATCH')
  })

  it('reports $id anywhere in the document', () => {
    const registry = buildSchemaRegistry(
      catalogOf([
        datamodel('acme/datamodel/money', { ...money, $id: 'srn://acme/datamodel/money@1' }),
        datamodel('acme/product/shop/datamodel/nested-id', {
          $schema: DIALECT,
          type: 'object',
          $defs: { thing: { $id: 'thing.json', type: 'string' } },
        }),
      ]),
    )
    expect(codes(registry, 'srn://acme/datamodel/money')).toContain('E_DM_ID_FORBIDDEN')
    expect(codes(registry, 'srn://acme/product/shop/datamodel/nested-id')).toContain('E_DM_ID_FORBIDDEN')
  })
})

describe('cycles', () => {
  it('detects a root-allOf inheritance cycle', () => {
    const registry = fixture()
    expect(registry.inheritance.cyclic).toContain(LOOP_A)
    expect(registry.inheritance.cyclic).toContain(LOOP_B)
    expect(codes(registry, 'srn://acme/product/shop/datamodel/loop-a')).toContain('E_DM_INHERIT_CYCLE')
  })

  it('flattens a cyclic model without hanging', () => {
    const registry = fixture()
    const model = effectiveModel(registry, LOOP_A)

    expect(model?.properties.map((property) => property.name)).toEqual(['a', 'b'])
    expect(model?.lineage.map((node) => node.status)).toEqual(['ok', 'ok', 'cyclic'])
  })

  it('bounds the reachable document closure of a cyclic bundle', () => {
    const registry = fixture()
    const bundle = buildSchemaBundle(registry, LOOP_A)
    expect(Object.keys(bundle?.documents ?? {}).sort()).toEqual([LOOP_A, LOOP_B])
  })

  it('tolerates a property-level self reference', () => {
    const registry = buildSchemaRegistry(
      catalogOf([
        datamodel('acme/product/shop/datamodel/category', {
          $schema: DIALECT,
          type: 'object',
          properties: { children: { type: 'array', items: { $ref: '../category/schema.json' } } },
        }),
      ]),
    )
    const id = 'acme/product/shop/datamodel/category/schema.json'
    const validate = schemaValidator(registry, id)
    expect(validate?.({ children: [{ children: [] }] })).toBe(true)
    expect(effectiveModel(registry, id)?.lineage).toHaveLength(1)
  })
})

describe('buildSchemaBundle', () => {
  it('carries the transitive document closure and every ref resolution', () => {
    const registry = fixture()
    const bundle = buildSchemaBundle(registry, ORDER)

    expect(bundle?.documents[MONEY]).toBeDefined()
    expect(bundle?.documents[BASE]).toBeDefined()
    // Local $defs land in the closure under a pointer key, ready to expand.
    expect(bundle?.documents[nodeKey(ORDER, '/$defs/positive-int')]).toEqual({ type: 'integer', minimum: 1 })
    expect(bundle?.refs[ORDER][MONEY_FROM_ORDER].targetSrn).toBe('srn://acme/datamodel/money')
    // The chip shows which version the ref lands on today; refs carry no pin.
    expect(bundle?.refs[ORDER][MONEY_FROM_ORDER].version).toBe(1)
    expect(bundle?.meta[BASE].abstract).toBe(true)
    expect(bundle?.raw).toContain('"x-srn"')
    expect(bundle?.raw).not.toContain('"$id"')
  })

  it('flattens every reachable document so a nested $ref expands to effective fields', () => {
    const registry = fixture()
    const bundle = buildSchemaBundle(registry, 'acme/product/shop/datamodel/payment-method/schema.json')
    const sepa = bundle?.flat['acme/product/shop/datamodel/sepa-payment/schema.json']

    expect(sepa?.map((property) => property.name)).toEqual(['iban', 'method'])
    expect(sepa?.find((property) => property.name === 'method')?.own).toBe(false)
  })

  it('locates each contribution by pointer inside its contributing document', () => {
    const registry = fixture()
    const model = effectiveModel(registry, ORDER)
    expect(model?.properties.find((property) => property.name === 'line-count')?.contributions[0].pointer).toBe(
      '/properties/line-count',
    )
    expect(model?.properties.find((property) => property.name === 'created-at')?.contributions[0]).toMatchObject({
      origin: BASE,
      pointer: '/properties/created-at',
    })
  })

  it('lists the models that extend a base', () => {
    const registry = fixture()
    const bundle = buildSchemaBundle(registry, BASE)
    expect(bundle?.descendants.map((descendant) => descendant.id)).toEqual([ORDER])
  })

  it('returns null for an SRN with no schema', () => {
    expect(buildSchemaBundle(fixture(), 'srn://acme/product/shop/datamodel/ghost')).toBeNull()
  })
})
