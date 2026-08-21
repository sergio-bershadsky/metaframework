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
import { CANONICAL_SCHEMA_HOST, schemaBaseUrl, srnToSchemaUrl } from './url'

/**
 * The fixture is in-memory: the registry only ever sees a loaded Catalog, so
 * these tests must not depend on a filesystem walk. Cases follow the worked
 * example and the composition patterns in framework/spec/kinds/datamodel.md.
 *
 * Every document below carries the two identity keywords — the canonical `$id`
 * and the matching `x-srn` — and every cross-entity `$ref` is another
 * document's `$id`: the form a stock validator dereferences and this registry
 * satisfies from memory (decision-record 2026-08-19-c). `url()` is used instead
 * of a literal host so the test states the *rule* rather than the string, but
 * the host itself is a constant, not configuration — see the SCHEMA_BASE_URL
 * case at the end of the identity block.
 */

const DIALECT = 'https://json-schema.org/draft/2020-12/schema'

/** The canonical schema URL of an entity, by its catalog path. */
function url(relDir: string): string {
  return srnToSchemaUrl(`srn://${relDir}`)
}

function datamodel(relDir: string, source: SchemaNode | null, extra: Record<string, unknown> = {}): Entity {
  const parsed = parseSrn(`srn://${relDir}`)
  const srn = formatSrn({ ...parsed, version: null })
  const name = parsed.name as string
  // Both identity keywords are required, so the helper writes the true ones and
  // every fixture document looks like a shipped schema.json; a case that wants a
  // wrong, missing or nested one declares it itself and wins the spread.
  const document = source === null ? null : { $id: srnToSchemaUrl(srn), 'x-srn': srn, ...source }
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
  // Depth is irrelevant to the reference now: a base eight directories away and
  // a sibling one directory away are addressed the same way.
  allOf: [{ $ref: url('acme/datamodel/base-record') }],
  properties: {
    total: { $ref: url('acme/datamodel/money'), description: 'Gross amount payable.' },
    discount: { $ref: url('acme/datamodel/money') },
    status: { enum: ['placed', 'paid', 'refunded'] },
    'line-count': { $ref: '#/$defs/positive-int' },
    refund: { $ref: url('acme/product/shop/component/checkout/component/payment/datamodel/refund') },
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
  oneOf: [
    { $ref: url('acme/product/shop/datamodel/card-payment') },
    { $ref: url('acme/product/shop/datamodel/sepa-payment') },
  ],
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
  allOf: [{ $ref: url('acme/product/shop/datamodel/sepa-tag') }],
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
  allOf: [{ $ref: url('acme/product/shop/datamodel/nope') }],
  properties: { loose: { $ref: url('acme/datamodel/money') } },
}

const loopA: SchemaNode = {
  $schema: DIALECT,
  title: 'Loop A',
  type: 'object',
  allOf: [{ $ref: url('acme/product/shop/datamodel/loop-b') }],
  properties: { a: { type: 'string' } },
}

const loopB: SchemaNode = {
  $schema: DIALECT,
  title: 'Loop B',
  type: 'object',
  allOf: [{ $ref: url('acme/product/shop/datamodel/loop-a') }],
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

const ORDER = url('acme/product/shop/component/checkout/component/payment/datamodel/order')
const BASE = url('acme/datamodel/base-record')
const MONEY = url('acme/datamodel/money')
const LOOP_A = url('acme/product/shop/datamodel/loop-a')
const LOOP_B = url('acme/product/shop/datamodel/loop-b')

/** The `$ref` order writes for money — now identical to money's own `$id`. */
const MONEY_FROM_ORDER = MONEY

function codes(registry: SchemaRegistry, srn: string): string[] {
  return registry.diagnostics.filter((diagnostic) => diagnostic.srn === srn).map((diagnostic) => diagnostic.code)
}

const ORDER_SRN = 'srn://acme/product/shop/component/checkout/component/payment/datamodel/order'

describe('buildSchemaRegistry — keying', () => {
  it('keys each document by its schema URL and aliases both SRN forms', () => {
    const registry = fixture()
    expect(resolveSchema(registry, ORDER)?.id).toBe(ORDER)
    expect(resolveSchema(registry, ORDER_SRN)?.id).toBe(ORDER)
    expect(resolveSchema(registry, `${ORDER_SRN}@3`)?.id).toBe(ORDER)
  })

  it('keeps the file path as a lookup key — it is what a reviewer has in hand', () => {
    const registry = fixture()
    const entry = resolveSchema(registry, ORDER)
    expect(entry?.file).toBe('acme/product/shop/component/checkout/component/payment/datamodel/order/schema.json')
    expect(resolveSchema(registry, entry?.file as string)?.id).toBe(ORDER)
  })

  it('derives the owning entity SRN from the URL path', () => {
    const registry = fixture()
    expect(resolveSchema(registry, ORDER)?.srn).toBe(ORDER_SRN)
    expect(resolveSchema(registry, BASE)?.srn).toBe('srn://acme/datamodel/base-record')
  })

  it('reports diagnostics against the file on disk, never against the URL', () => {
    const registry = fixture()
    const dangling = registry.diagnostics.find((diagnostic) => diagnostic.code === 'E_SRN_DANGLING')
    expect(dangling?.path).toBe('acme/product/shop/datamodel/broken/schema.json')
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
    // The nested value object arrives through an absolute schema URL that ajv
    // resolves out of the registry — no network, no custom resolver.
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
          allOf: [{ $ref: url('acme/datamodel/base-record') }],
          properties: { id: { type: 'integer' }, note: { minLength: 8 } },
        }),
      ]),
    )
    const model = effectiveModel(registry, url('acme/product/shop/datamodel/narrow'))
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
    const bundle = buildSchemaBundle(registry, url('acme/product/shop/datamodel/payment-method'))
    const union = bundle?.unions[nodeKey(url('acme/product/shop/datamodel/payment-method'), '')]

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
    const id = url('acme/product/shop/datamodel/untagged')
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
      .get(url('acme/product/shop/datamodel/broken'))
      ?.get(url('acme/product/shop/datamodel/nope'))

    expect(dangling?.targetId).toBeNull()
    // The URL is still a legal entity address, so the author is told which one.
    expect(dangling?.targetSrn).toBe('srn://acme/product/shop/datamodel/nope')
    expect(dangling?.error?.code).toBe('E_SRN_DANGLING')
    expect(codes(registry, 'srn://acme/product/shop/datamodel/broken')).toContain('E_SRN_DANGLING')
  })

  it('surfaces an unresolvable base in the lineage rather than silently skipping it', () => {
    const registry = fixture()
    const model = effectiveModel(registry, url('acme/product/shop/datamodel/broken'))
    const unresolved = model?.lineage.find((node) => node.status === 'unresolved')

    expect(unresolved?.ref).toBe(url('acme/product/shop/datamodel/nope'))
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
          properties: { c: { $ref: `${url('acme/datamodel/money')}#/$defs/currency` } },
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

  it('accepts the canonical URL of the target — the one form there is', () => {
    expect(refCodes(url('acme/datamodel/money'))).toEqual([])
  })

  it('rejects a serving address, and names the canonical URL to write instead', () => {
    const serving = `${schemaBaseUrl()}/schemas/acme/datamodel/money`
    expect(refCodes(serving)).toContain('E_DM_REF_TARGET')

    const registry = buildSchemaRegistry(
      catalogOf([
        datamodel('acme/datamodel/money', money),
        datamodel('acme/product/shop/datamodel/probe', {
          $schema: DIALECT,
          type: 'object',
          properties: { value: { $ref: serving } },
        }),
      ]),
    )
    const diagnostic = registry.diagnostics.find((candidate) => candidate.code === 'E_DM_REF_TARGET')
    expect(diagnostic?.message).toContain(url('acme/datamodel/money'))
  })

  it('rejects a $ref on somebody else’s host', () => {
    expect(refCodes('https://elsewhere.example/acme/datamodel/money')).toContain('E_DM_REF_TARGET')
  })

  it('rejects a $ref that lands in another solution', () => {
    expect(refCodes(`${CANONICAL_SCHEMA_HOST}/globex/datamodel/money`)).toContain('E_SRN_CROSS_SOLUTION')
  })

  it('rejects a URL whose path is not an entity address', () => {
    // A kind bucket with no name after it is not addressable.
    expect(refCodes(`${CANONICAL_SCHEMA_HOST}/acme/datamodel`)).toContain('E_DM_REF_TARGET')
  })

  it('rejects a version pin in the URL — it would silently serve the current schema', () => {
    expect(refCodes(`${url('acme/datamodel/money')}@1`)).toContain('E_DM_REF_TARGET')
  })

  it('rejects an artifact address — no `….schema` URL exists on the canonical host', () => {
    const diagnostic = probeDiagnostic(`${url('acme/datamodel/money')}.schema`)
    expect(diagnostic?.code).toBe('E_DM_REF_TARGET')
    expect(diagnostic?.message).toContain('addresses an artifact, not an entity')
  })

  /** The one diagnostic raised on the probe entity, whatever its code. */
  function probeDiagnostic(ref: string) {
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
    return registry.diagnostics.find((candidate) => candidate.srn === 'srn://acme/product/shop/datamodel/probe')
  }

  it('rejects the retired relative file path, and names the canonical form', () => {
    const diagnostic = probeDiagnostic('../../../../datamodel/money/schema.json')
    expect(diagnostic?.code).toBe('E_DM_REF_TARGET')
    // It resolves to `…/datamodel/money/schema.json`, which is not an entity
    // address, so there is no "did you mean" to offer — the message states the
    // rule with a canonical example instead.
    expect(diagnostic?.message).toContain(CANONICAL_SCHEMA_HOST)
  })

  it('hands back the exact URL a resolvable relative $ref meant', () => {
    // `$id` is a base URI, so this *would* resolve under stock JSON Schema. Two
    // spellings of one edge is one too many, so it is still rejected — but the
    // author is handed the replacement rather than a rule.
    const diagnostic = probeDiagnostic('../../../datamodel/money')
    expect(diagnostic?.code).toBe('E_DM_REF_TARGET')
    expect(diagnostic?.message).toContain(`did you mean "${url('acme/datamodel/money')}"`)
  })

  it('rejects an SRN $ref — a validator cannot dereference a private URI scheme', () => {
    expect(refCodes('srn://acme/datamodel/money@1')).toContain('E_DM_REF_TARGET')
  })
})

describe('identity', () => {
  it('accepts the canonical $id and the matching x-srn', () => {
    const registry = fixture()
    expect(codes(registry, 'srn://acme/datamodel/money')).toEqual([])
    expect(resolveSchema(registry, MONEY)?.document.$id).toBe(MONEY)
    expect(resolveSchema(registry, MONEY)?.document['x-srn']).toBe('srn://acme/datamodel/money')
  })

  it('reports a missing $id — identity is not optional any more', () => {
    const registry = buildSchemaRegistry(
      catalogOf([datamodel('acme/datamodel/money', { ...money, $id: undefined })]),
    )
    expect(codes(registry, 'srn://acme/datamodel/money')).toContain('E_DM_ID_MISSING')
  })

  it('reports an $id naming the wrong entity', () => {
    const registry = buildSchemaRegistry(
      catalogOf([datamodel('acme/datamodel/money', { ...money, $id: url('acme/product/shop/datamodel/money') })]),
    )
    expect(codes(registry, 'srn://acme/datamodel/money')).toContain('E_DM_ID_MISMATCH')
  })

  it('reports an $id on a foreign host', () => {
    const registry = buildSchemaRegistry(
      catalogOf([datamodel('acme/datamodel/money', { ...money, $id: 'https://elsewhere.example/acme/datamodel/money' })]),
    )
    expect(codes(registry, 'srn://acme/datamodel/money')).toContain('E_DM_ID_MISMATCH')
  })

  it('reports an $id that states where the portal serves the schema, not what it is', () => {
    const registry = buildSchemaRegistry(
      catalogOf([
        datamodel('acme/datamodel/money', { ...money, $id: `${schemaBaseUrl()}/schemas/acme/datamodel/money` }),
      ]),
    )
    const diagnostic = registry.diagnostics.find((candidate) => candidate.code === 'E_DM_ID_MISMATCH')
    expect(diagnostic).toBeDefined()
    // The message must separate the two ideas by name, or the author "fixes" it
    // by pointing SCHEMA_BASE_URL at the canonical host and breaks retrieval.
    expect(diagnostic?.message).toContain('SCHEMA_BASE_URL')
    expect(diagnostic?.message).toContain(CANONICAL_SCHEMA_HOST)
  })

  it('reports a missing x-srn — the SRN must survive a schema leaving the catalog', () => {
    const registry = buildSchemaRegistry(
      catalogOf([datamodel('acme/datamodel/money', { ...money, 'x-srn': undefined })]),
    )
    expect(codes(registry, 'srn://acme/datamodel/money')).toContain('E_DM_SRN_MISSING')
  })

  it('reports an x-srn that disagrees with the path it sits in', () => {
    const registry = buildSchemaRegistry(
      catalogOf([datamodel('acme/datamodel/money', { ...money, 'x-srn': 'srn://acme/datamodel/currency' })]),
    )
    expect(codes(registry, 'srn://acme/datamodel/money')).toContain('E_DM_SRN_MISMATCH')
  })

  it('reports a pinned x-srn — identity is unversioned, always', () => {
    const registry = buildSchemaRegistry(
      catalogOf([datamodel('acme/datamodel/money', { ...money, 'x-srn': 'srn://acme/datamodel/money@1' })]),
    )
    expect(codes(registry, 'srn://acme/datamodel/money')).toContain('E_DM_SRN_MISMATCH')
  })

  it('reports a nested $id, which would re-base every $ref beneath it', () => {
    const registry = buildSchemaRegistry(
      catalogOf([
        datamodel('acme/product/shop/datamodel/nested-id', {
          $schema: DIALECT,
          type: 'object',
          $defs: { thing: { $id: 'thing.json', type: 'string' } },
        }),
      ]),
    )
    expect(codes(registry, 'srn://acme/product/shop/datamodel/nested-id')).toContain('E_DM_ID_FORBIDDEN')
  })

  it('keeps identity fixed when SCHEMA_BASE_URL moves — a deployment cannot rename a schema', () => {
    // This is the whole reason the host is a constant. If `$id` tracked
    // SCHEMA_BASE_URL, a laptop and production would disagree about what a
    // schema *is*, and every registry and cache keyed on `$id` would split.
    process.env.SCHEMA_BASE_URL = 'https://catalog.acme.example'
    try {
      const registry = buildSchemaRegistry(catalogOf([datamodel('acme/datamodel/money', money)]))
      expect(resolveSchema(registry, 'srn://acme/datamodel/money')?.id).toBe(
        `${CANONICAL_SCHEMA_HOST}/acme/datamodel/money`,
      )
      expect(codes(registry, 'srn://acme/datamodel/money')).toEqual([])
    } finally {
      delete process.env.SCHEMA_BASE_URL
    }
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
          properties: { children: { type: 'array', items: { $ref: url('acme/product/shop/datamodel/category') } } },
        }),
      ]),
    )
    const id = url('acme/product/shop/datamodel/category')
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
    expect(bundle?.raw).toContain('"$id"')
    expect(bundle?.raw).toContain('"x-srn"')
  })

  it('flattens every reachable document so a nested $ref expands to effective fields', () => {
    const registry = fixture()
    const bundle = buildSchemaBundle(registry, url('acme/product/shop/datamodel/payment-method'))
    const sepa = bundle?.flat[url('acme/product/shop/datamodel/sepa-payment')]

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
