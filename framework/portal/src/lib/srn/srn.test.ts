import { describe, expect, it } from 'vitest'
import {
  CONTAINER_KINDS,
  RESERVED_KINDS,
  SOLUTION_LEVEL_KINDS,
  SrnError,
  dirToSrn,
  formatSrn,
  ownerTrail,
  parentSrn,
  parseSrn,
  resolveRef,
  srnToDir,
  srnToDocument,
  unversioned,
} from './srn'

/**
 * Cases are taken from framework/spec/srn.md. Every "notes pinned by tests"
 * bullet and every row of the validation table there has a case here.
 *
 * The path is a strict alternation of kind bucket and name, so the suite is
 * organised around that pair walk: the shapes it accepts, the two ways the walk
 * can fail (a bucket with no name, a name where a bucket belongs), and the
 * placement rules the walk now enforces by itself.
 */

/** Assert on the error class rather than the message, which is prose. */
function codeOf(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    if (error instanceof SrnError) return error.code
    throw error
  }
  throw new Error('expected an SrnError; nothing was thrown')
}

describe('reserved kinds', () => {
  it('is the closed set of eleven buckets, product and component included', () => {
    expect([...RESERVED_KINDS].sort()).toEqual([
      'actor',
      'adr',
      'capability',
      'component',
      'datamodel',
      'environment',
      'journey',
      'metric',
      'product',
      'protocol',
      'requirement',
    ])
  })

  it('grows by appending — the three additions sit after the original eight', () => {
    // Additive-only evolution: a kind adopted later never displaces one adopted
    // earlier, so the head of the list is frozen and only the tail moves.
    expect([...RESERVED_KINDS].slice(0, 8)).toEqual([
      'product',
      'component',
      'datamodel',
      'protocol',
      'actor',
      'environment',
      'adr',
      'requirement',
    ])
    expect([...RESERVED_KINDS].slice(8)).toEqual(['capability', 'journey', 'metric'])
  })

  it('names only products and components as containers', () => {
    expect([...CONTAINER_KINDS]).toEqual(['product', 'component'])
  })

  it('names actors, environments, capabilities and journeys as solution-level kinds', () => {
    expect([...SOLUTION_LEVEL_KINDS]).toEqual(['actor', 'environment', 'capability', 'journey'])
  })

  it('leaves metric out of the solution-level set — it is owner-scoped, like requirement', () => {
    expect([...SOLUTION_LEVEL_KINDS]).not.toContain('metric')
    expect([...SOLUTION_LEVEL_KINDS]).not.toContain('requirement')
  })
})

describe('parseSrn — shapes', () => {
  it('parses a solution, whose path is empty and whose kind is null', () => {
    expect(parseSrn('srn://acme')).toEqual({
      solution: 'acme',
      path: [],
      kind: null,
      name: null,
      artifact: null,
      version: null,
    })
  })

  it('parses a product — one pair, always the first', () => {
    expect(parseSrn('srn://acme/product/shop')).toEqual({
      solution: 'acme',
      path: [{ kind: 'product', name: 'shop' }],
      kind: 'product',
      name: 'shop',
      artifact: null,
      version: null,
    })
  })

  it('parses a component inside a product', () => {
    expect(parseSrn('srn://acme/product/shop/component/checkout')).toEqual({
      solution: 'acme',
      path: [
        { kind: 'product', name: 'shop' },
        { kind: 'component', name: 'checkout' },
      ],
      kind: 'component',
      name: 'checkout',
      artifact: null,
      version: null,
    })
  })

  it('parses a sub-component — nesting is repeated component pairs, not depth', () => {
    expect(parseSrn('srn://acme/product/shop/component/checkout/component/payment')).toMatchObject({
      path: [
        { kind: 'product', name: 'shop' },
        { kind: 'component', name: 'checkout' },
        { kind: 'component', name: 'payment' },
      ],
      kind: 'component',
      name: 'payment',
    })
  })

  it('parses a component-owned entity with a pinned version', () => {
    expect(parseSrn('srn://acme/product/shop/component/checkout/datamodel/cart@1')).toEqual({
      solution: 'acme',
      path: [
        { kind: 'product', name: 'shop' },
        { kind: 'component', name: 'checkout' },
        { kind: 'datamodel', name: 'cart' },
      ],
      kind: 'datamodel',
      name: 'cart',
      artifact: null,
      version: 1,
    })
  })

  it('parses a product-level protocol', () => {
    expect(parseSrn('srn://acme/product/shop/protocol/order-placement@2')).toMatchObject({
      path: [
        { kind: 'product', name: 'shop' },
        { kind: 'protocol', name: 'order-placement' },
      ],
      kind: 'protocol',
      name: 'order-placement',
      version: 2,
    })
  })

  it('parses a solution-level actor', () => {
    expect(parseSrn('srn://acme/actor/customer')).toMatchObject({
      path: [{ kind: 'actor', name: 'customer' }],
      kind: 'actor',
      name: 'customer',
    })
  })

  it('parses a solution-level datamodel — kind is stated, never inferred from depth', () => {
    expect(parseSrn('srn://acme/datamodel/money@1')).toMatchObject({
      path: [{ kind: 'datamodel', name: 'money' }],
      kind: 'datamodel',
      name: 'money',
      version: 1,
    })
  })

  it('treats an absent version as latest (null)', () => {
    expect(parseSrn('srn://acme/product/shop/datamodel/order-placed').version).toBeNull()
  })

  it('parses a solution-level capability', () => {
    expect(parseSrn('srn://acme/capability/order-fulfilment')).toMatchObject({
      path: [{ kind: 'capability', name: 'order-fulfilment' }],
      kind: 'capability',
      name: 'order-fulfilment',
    })
  })

  it('parses a solution-level journey', () => {
    expect(parseSrn('srn://acme/journey/place-an-order@2')).toMatchObject({
      path: [{ kind: 'journey', name: 'place-an-order' }],
      kind: 'journey',
      name: 'place-an-order',
      version: 2,
    })
  })

  it('parses a metric at each level it may own — solution, product, component', () => {
    expect(parseSrn('srn://acme/metric/order-conversion')).toMatchObject({
      path: [{ kind: 'metric', name: 'order-conversion' }],
      kind: 'metric',
    })
    expect(parseSrn('srn://acme/product/shop/metric/order-conversion')).toMatchObject({
      path: [
        { kind: 'product', name: 'shop' },
        { kind: 'metric', name: 'order-conversion' },
      ],
      kind: 'metric',
    })
    expect(
      parseSrn('srn://acme/product/shop/component/checkout/component/payment/metric/authorization-success'),
    ).toMatchObject({
      path: [
        { kind: 'product', name: 'shop' },
        { kind: 'component', name: 'checkout' },
        { kind: 'component', name: 'payment' },
        { kind: 'metric', name: 'authorization-success' },
      ],
      kind: 'metric',
      name: 'authorization-success',
    })
  })
})

describe('parseSrn — syntax rejections', () => {
  const cases: Array<[string, string, string]> = [
    ['missing scheme', 'acme/product/shop', 'E_SRN_SYNTAX'],
    ['trailing slash', 'srn://acme/product/shop/', 'E_SRN_SYNTAX'],
    ['empty segment', 'srn://acme//product/shop', 'E_SRN_SYNTAX'],
    ['uppercase', 'srn://acme/product/Shop', 'E_SRN_SYNTAX'],
    ['version not on the final segment', 'srn://acme/product/shop@2/component/checkout', 'E_SRN_SYNTAX'],
    ['zero version', 'srn://acme/product/shop/datamodel/order-placed@0', 'E_SRN_SYNTAX'],
    ['leading-zero version', 'srn://acme/product/shop/datamodel/order-placed@01', 'E_SRN_SYNTAX'],
    ['non-integer version', 'srn://acme/product/shop/datamodel/order-placed@1.2', 'E_SRN_SYNTAX'],
    ['query string', 'srn://acme/product/shop?x=1', 'E_SRN_SYNTAX'],
    ['fragment', 'srn://acme/product/shop#top', 'E_SRN_SYNTAX'],
    ['percent-encoding', 'srn://acme/product/sh%6fp', 'E_SRN_SYNTAX'],
  ]

  it.each(cases)('rejects %s', (_label, ref, code) => {
    expect(codeOf(() => parseSrn(ref))).toBe(code)
  })

  it('rejects a segment longer than 64 characters', () => {
    expect(codeOf(() => parseSrn(`srn://acme/product/${'a'.repeat(65)}`))).toBe('E_SRN_SYNTAX')
  })
})

describe('parseSrn — artifact addresses (lexing only)', () => {
  it('splits the artifact off the final segment at the first dot', () => {
    expect(parseSrn('srn://acme/protocol/settlement.transport')).toEqual({
      solution: 'acme',
      path: [{ kind: 'protocol', name: 'settlement' }],
      kind: 'protocol',
      name: 'settlement',
      artifact: 'transport',
      version: null,
    })
  })

  it('strips @version first, then the artifact — the one written order', () => {
    expect(parseSrn('srn://acme/protocol/settlement.transport@1')).toMatchObject({
      name: 'settlement',
      artifact: 'transport',
      version: 1,
    })
  })

  it('keeps deeper dots as role segments — the two-deep families', () => {
    expect(parseSrn('srn://acme/datamodel/money.examples.minimal')).toMatchObject({
      name: 'money',
      artifact: 'examples.minimal',
    })
    expect(parseSrn('srn://acme/protocol/settlement.workflows.settle-order')).toMatchObject({
      name: 'settlement',
      artifact: 'workflows.settle-order',
    })
  })

  it('names the actual mistake when the two suffixes are written backwards', () => {
    expect(codeOf(() => parseSrn('srn://acme/protocol/settlement@1.transport'))).toBe('E_SRN_SYNTAX')
    expect(() => parseSrn('srn://acme/protocol/settlement@1.transport')).toThrow(
      /artifact suffix precedes @version/,
    )
  })

  it('rejects an empty artifact name on the alphabet', () => {
    expect(codeOf(() => parseSrn('srn://acme/protocol/settlement.'))).toBe('E_SRN_SYNTAX')
    expect(() => parseSrn('srn://acme/protocol/settlement.')).toThrow(/bad artifact segment ""/)
  })

  it('rejects an alphabet-illegal role segment, wherever it sits', () => {
    expect(codeOf(() => parseSrn('srn://acme/protocol/settlement.Transport'))).toBe('E_SRN_SYNTAX')
    expect(codeOf(() => parseSrn('srn://acme/protocol/settlement.workflows.'))).toBe('E_SRN_SYNTAX')
  })

  it('knows nothing about roles — an unknown role still lexes; V5 is the table\'s job', () => {
    // srn://acme.anything and actor/customer.profile are E_SRN_ARTIFACT, but
    // by the role table (artifacts.test.ts), not by the parser.
    expect(parseSrn('srn://acme.anything')).toMatchObject({ kind: null, artifact: 'anything' })
    expect(parseSrn('srn://acme/actor/customer.profile')).toMatchObject({
      kind: 'actor',
      artifact: 'profile',
    })
  })
})

describe('parseSrn — the pair walk', () => {
  it('rejects a trailing bucket — a bucket is not addressable', () => {
    expect(codeOf(() => parseSrn('srn://acme/product/shop/datamodel'))).toBe('E_SRN_SYNTAX')
    expect(() => parseSrn('srn://acme/product/shop/datamodel')).toThrow(/not addressable/)
  })

  it('rejects a lone bucket under the solution', () => {
    expect(codeOf(() => parseSrn('srn://acme/product'))).toBe('E_SRN_SYNTAX')
  })

  it('rejects an odd trailing name — an extra segment after a complete pair', () => {
    expect(codeOf(() => parseSrn('srn://acme/product/shop/datamodel/order-placed/extra'))).toBe('E_SRN_SYNTAX')
    expect(() => parseSrn('srn://acme/product/shop/datamodel/order-placed/extra')).toThrow(/must alternate/)
  })

  it('rejects a non-bucket word in a kind position — the pre-bucket flat form no longer parses', () => {
    // Old shape: srn://acme/shop/checkout, where "shop" was a product by depth.
    expect(codeOf(() => parseSrn('srn://acme/shop/checkout'))).toBe('E_SRN_SYNTAX')
    expect(() => parseSrn('srn://acme/shop/checkout')).toThrow(/not a kind bucket/)
  })

  it('rejects a non-bucket word in a kind position deeper in the path', () => {
    expect(codeOf(() => parseSrn('srn://acme/product/shop/checkout/datamodel/cart'))).toBe('E_SRN_SYNTAX')
  })

  it('rejects a reserved keyword as the solution', () => {
    expect(codeOf(() => parseSrn('srn://protocol/product/shop'))).toBe('E_SRN_RESERVED')
  })

  it.each(['srn://acme/product/shop/adr/adr', 'srn://acme/product/component', 'srn://acme/component/product'])(
    'rejects a reserved keyword as an entity name (%s)',
    (ref) => {
      expect(codeOf(() => parseSrn(ref))).toBe('E_SRN_RESERVED')
    },
  )
})

/**
 * A new reserved word is a land grab: every path that already used it as a
 * *name* changes meaning the moment it becomes a bucket. Nothing in the catalog
 * did — `find solutions -type d -name capability -o -name journey -o -name
 * metric` was empty when the three were adopted — so the cases below pin the
 * behaviour rather than record a migration: the three words are now unavailable
 * for naming anything, at every position, in every solution.
 */
describe('parseSrn — the new buckets take their names out of circulation', () => {
  it.each(['srn://capability/product/shop', 'srn://journey/product/shop', 'srn://metric/product/shop'])(
    'rejects it as a solution name (%s)',
    (ref) => {
      expect(codeOf(() => parseSrn(ref))).toBe('E_SRN_RESERVED')
    },
  )

  it.each([
    'srn://acme/product/capability',
    'srn://acme/product/journey',
    'srn://acme/product/metric',
    'srn://acme/product/shop/datamodel/metric',
    'srn://acme/product/shop/component/journey',
    'srn://acme/capability/journey',
  ])('rejects it as an entity name (%s)', (ref) => {
    expect(codeOf(() => parseSrn(ref))).toBe('E_SRN_RESERVED')
  })

  it('rejects each of the three as a bare bucket — a bucket is still not addressable', () => {
    for (const ref of ['srn://acme/capability', 'srn://acme/journey', 'srn://acme/metric']) {
      expect(codeOf(() => parseSrn(ref))).toBe('E_SRN_SYNTAX')
      expect(() => parseSrn(ref)).toThrow(/not addressable/)
    }
  })

  it('reads a would-be collision as a bucket, not as a name — this is the reinterpretation', () => {
    // Before the extension `srn://acme/metric/order-conversion` was
    // E_SRN_SYNTAX ("metric" is not a kind bucket). It now parses, and `metric`
    // is the kind rather than a hypothetical entity called "metric".
    expect(parseSrn('srn://acme/metric/order-conversion').kind).toBe('metric')
  })
})

describe('parseSrn — placement is grammar', () => {
  const cases: Array<[string, string]> = [
    ['a product below the first pair', 'srn://acme/product/shop/product/billing'],
    ['a product under a component', 'srn://acme/product/shop/component/checkout/product/billing'],
    ['a component directly under the solution', 'srn://acme/component/checkout'],
    ['an actor below solution level', 'srn://acme/product/shop/actor/operator'],
    ['an environment below solution level', 'srn://acme/product/shop/component/checkout/environment/production'],
    ['a datamodel owning an entity', 'srn://acme/datamodel/money/datamodel/currency'],
    ['a protocol owning an entity', 'srn://acme/product/shop/protocol/order-placement/requirement/latency'],
    ['an actor owning an entity', 'srn://acme/actor/customer/requirement/gdpr-erasure'],
    ['a capability below solution level', 'srn://acme/product/shop/capability/order-fulfilment'],
    [
      'a capability under a component',
      'srn://acme/product/shop/component/checkout/capability/order-fulfilment',
    ],
    ['a journey below solution level', 'srn://acme/product/shop/journey/place-an-order'],
    ['a journey under a component', 'srn://acme/product/shop/component/checkout/journey/place-an-order'],
    ['a capability owning an entity', 'srn://acme/capability/order-fulfilment/metric/order-conversion'],
    ['a journey owning an entity', 'srn://acme/journey/place-an-order/metric/drop-off'],
    ['a metric owning an entity', 'srn://acme/metric/order-conversion/requirement/accuracy'],
    ['a requirement owning a metric', 'srn://acme/requirement/gdpr-erasure/metric/erasure-latency'],
  ]

  it.each(cases)('rejects %s', (_label, ref) => {
    expect(codeOf(() => parseSrn(ref))).toBe('E_SRN_PLACEMENT')
  })

  it('accepts the placements those rules exist to permit', () => {
    for (const ref of [
      'srn://acme/product/shop',
      'srn://acme/product/shop/component/checkout',
      'srn://acme/product/shop/component/checkout/component/payment',
      'srn://acme/actor/customer',
      'srn://acme/environment/production',
      'srn://acme/datamodel/money',
      'srn://acme/adr/0001-single-currency',
      'srn://acme/requirement/gdpr-erasure',
      'srn://acme/protocol/settlement',
      'srn://acme/product/shop/component/checkout/component/payment/datamodel/order',
    ]) {
      expect(() => parseSrn(ref)).not.toThrow()
    }
  })

  it('accepts capability and journey at solution level, and nowhere else', () => {
    expect(() => parseSrn('srn://acme/capability/order-fulfilment')).not.toThrow()
    expect(() => parseSrn('srn://acme/journey/place-an-order')).not.toThrow()
  })

  it('accepts a metric under every owner a requirement has, up to and including the solution', () => {
    // The two owner-scoped kinds are deliberately indistinguishable to the
    // grammar: wherever a requirement is legal, so is a metric.
    for (const owner of [
      '',
      '/product/shop',
      '/product/shop/component/checkout',
      '/product/shop/component/checkout/component/payment',
    ]) {
      expect(() => parseSrn(`srn://acme${owner}/requirement/some-rule`)).not.toThrow()
      expect(() => parseSrn(`srn://acme${owner}/metric/some-number`)).not.toThrow()
    }
  })
})

describe('formatSrn', () => {
  it('round-trips every shape', () => {
    for (const ref of [
      'srn://acme',
      'srn://acme/product/shop',
      'srn://acme/product/shop/component/checkout',
      'srn://acme/product/shop/component/checkout/component/payment',
      'srn://acme/product/shop/component/checkout/datamodel/cart@1',
      'srn://acme/product/shop/protocol/order-placement@2',
      'srn://acme/actor/customer',
      'srn://acme/datamodel/money@1',
      'srn://acme/capability/order-fulfilment',
      'srn://acme/journey/place-an-order@2',
      'srn://acme/metric/order-conversion',
      'srn://acme/product/shop/metric/checkout-conversion@3',
      'srn://acme/product/shop/component/checkout/metric/p99-latency',
      'srn://acme/protocol/settlement.transport',
      'srn://acme/protocol/settlement.transport@1',
      'srn://acme/protocol/settlement.workflows.settle-order',
      'srn://acme/environment/production.topology',
    ]) {
      expect(formatSrn(parseSrn(ref))).toBe(ref)
    }
  })

  it('drops the pin for the entity identity', () => {
    expect(unversioned(parseSrn('srn://acme/datamodel/money@3'))).toBe('srn://acme/datamodel/money')
  })
})

describe('srnToDir / srnToDocument / dirToSrn', () => {
  const shapes = [
    ['srn://acme', 'solutions/acme'],
    ['srn://acme/product/shop', 'solutions/acme/product/shop'],
    ['srn://acme/product/shop/component/checkout', 'solutions/acme/product/shop/component/checkout'],
    [
      'srn://acme/product/shop/component/checkout/component/payment',
      'solutions/acme/product/shop/component/checkout/component/payment',
    ],
    ['srn://acme/actor/customer', 'solutions/acme/actor/customer'],
    ['srn://acme/capability/order-fulfilment', 'solutions/acme/capability/order-fulfilment'],
    ['srn://acme/journey/place-an-order', 'solutions/acme/journey/place-an-order'],
    ['srn://acme/product/shop/metric/checkout-conversion', 'solutions/acme/product/shop/metric/checkout-conversion'],
  ] as const

  it.each(shapes)('maps %s to %s', (ref, dir) => {
    expect(srnToDir(parseSrn(ref))).toBe(dir)
  })

  it('drops the version suffix — pins never appear on disk', () => {
    expect(srnToDir(parseSrn('srn://acme/product/shop/component/checkout/datamodel/cart@1'))).toBe(
      'solutions/acme/product/shop/component/checkout/datamodel/cart',
    )
  })

  it('addresses the entity document inside the directory', () => {
    expect(srnToDocument(parseSrn('srn://acme/datamodel/money@1'))).toBe('solutions/acme/datamodel/money/index.md')
  })

  it.each(shapes)('recovers %s from its directory', (ref, dir) => {
    expect(formatSrn(dirToSrn(dir))).toBe(ref)
  })

  it('accepts a path already relative to the catalog root', () => {
    expect(formatSrn(dirToSrn('acme/product/shop/datamodel/order-placed'))).toBe(
      'srn://acme/product/shop/datamodel/order-placed',
    )
  })

  it('rejects a directory that is not a legal SRN — SRN ≡ path holds in both directions', () => {
    expect(codeOf(() => dirToSrn('solutions/acme/shop/checkout'))).toBe('E_SRN_SYNTAX')
    expect(codeOf(() => dirToSrn('solutions/acme/product/shop/actor/operator'))).toBe('E_SRN_PLACEMENT')
    expect(codeOf(() => dirToSrn('solutions/acme/product/shop/capability/order-fulfilment'))).toBe('E_SRN_PLACEMENT')
    expect(codeOf(() => dirToSrn('solutions/acme/product/shop/journey/place-an-order'))).toBe('E_SRN_PLACEMENT')
  })

  it('rejects a directory that names an entity after one of the new buckets', () => {
    // The loader walks directories, so the collision surface is a folder on
    // disk before it is ever a reference in prose.
    expect(codeOf(() => dirToSrn('solutions/acme/product/shop/datamodel/metric'))).toBe('E_SRN_RESERVED')
  })
})

describe('parentSrn', () => {
  const cases: Array<[string, string | null]> = [
    ['srn://acme', null],
    ['srn://acme/product/shop', 'srn://acme'],
    ['srn://acme/product/shop/component/checkout', 'srn://acme/product/shop'],
    [
      'srn://acme/product/shop/component/checkout/component/payment',
      'srn://acme/product/shop/component/checkout',
    ],
    ['srn://acme/product/shop/component/checkout/datamodel/cart@1', 'srn://acme/product/shop/component/checkout'],
    ['srn://acme/product/shop/protocol/order-placement@2', 'srn://acme/product/shop'],
    ['srn://acme/actor/customer', 'srn://acme'],
    ['srn://acme/datamodel/money@1', 'srn://acme'],
    ['srn://acme/capability/order-fulfilment', 'srn://acme'],
    ['srn://acme/journey/place-an-order', 'srn://acme'],
    ['srn://acme/metric/order-conversion', 'srn://acme'],
    ['srn://acme/product/shop/metric/checkout-conversion@3', 'srn://acme/product/shop'],
    [
      'srn://acme/product/shop/component/checkout/metric/p99-latency',
      'srn://acme/product/shop/component/checkout',
    ],
  ]

  it.each(cases)('%s → %s', (ref, parent) => {
    expect(parentSrn(parseSrn(ref))).toBe(parent)
  })

  it('drops a whole pair, never a bare bucket', () => {
    // The owner of an entity is the container the bucket sits in, so the bucket
    // itself is never a parent — `srn://acme/product/shop/datamodel` is not an SRN.
    expect(parentSrn(parseSrn('srn://acme/product/shop/datamodel/money'))).toBe('srn://acme/product/shop')
  })
})

describe('ownerTrail', () => {
  it('names the owning product of a solution-level list row', () => {
    // What "Realized by" on a capability needs: `checkout` and `tracking` are
    // two names in one flat list, and which product each belongs to is the
    // whole argument for the capability sitting at solution level.
    expect(ownerTrail('srn://acme/product/shop/component/checkout')).toEqual(['shop'])
    expect(ownerTrail('srn://acme/product/fulfilment/component/tracking')).toEqual(['fulfilment'])
  })

  it('carries every container down to the entity, outermost first', () => {
    expect(
      ownerTrail('srn://acme/product/fulfilment/component/carrier-gateway/component/parcel-carrier'),
    ).toEqual(['fulfilment', 'carrier-gateway'])
    expect(ownerTrail('srn://acme/product/shop/component/checkout/datamodel/cart@1')).toEqual([
      'shop',
      'checkout',
    ])
  })

  it('is empty for a product and for a solution root — they own themselves', () => {
    expect(ownerTrail('srn://acme/product/shop')).toEqual([])
    expect(ownerTrail('srn://acme')).toEqual([])
  })

  it('is relative to a base, which is what the deep-descendants list passes', () => {
    const srn = 'srn://acme/product/shop/component/checkout/component/payment/datamodel/order@3'
    expect(ownerTrail(srn, 'srn://acme/product/shop')).toEqual(['checkout', 'payment'])
    expect(ownerTrail(srn, 'srn://acme/product/shop/component/checkout')).toEqual(['payment'])
  })

  it('yields nothing rather than throwing on an SRN it cannot parse', () => {
    // A list that refuses to render is worse than a row missing its context.
    expect(ownerTrail('not-an-srn')).toEqual([])
  })
})

describe('resolveRef — solution-absolute references', () => {
  const base = 'srn://acme/product/shop/component/checkout'

  it('resolves from the solution root, the form the spec recommends', () => {
    expect(resolveRef(base, '/product/shop/datamodel/order-placed@1')).toBe(
      'srn://acme/product/shop/datamodel/order-placed@1',
    )
  })

  it('reaches a solution-level entity', () => {
    expect(resolveRef(base, '/actor/customer')).toBe('srn://acme/actor/customer')
  })

  it('reaches a capability and a journey, which can only be addressed from the root', () => {
    expect(resolveRef(base, '/capability/order-fulfilment')).toBe('srn://acme/capability/order-fulfilment')
    expect(resolveRef(base, '/journey/place-an-order@2')).toBe('srn://acme/journey/place-an-order@2')
  })

  it('reaches an owning entity\'s own metric with a relative hop', () => {
    // Two ".." pop the checkout pair, landing on the product that owns it.
    expect(resolveRef(base, '../../metric/checkout-conversion')).toBe(
      'srn://acme/product/shop/metric/checkout-conversion',
    )
    expect(resolveRef(base, 'metric/p99-latency')).toBe(
      'srn://acme/product/shop/component/checkout/metric/p99-latency',
    )
  })

  it('rejects a relative hop that lands a capability below the solution', () => {
    expect(codeOf(() => resolveRef(base, '../../capability/order-fulfilment'))).toBe('E_SRN_PLACEMENT')
  })

  it('passes an already-absolute reference through unchanged', () => {
    expect(resolveRef(base, 'srn://acme/datamodel/money@1')).toBe('srn://acme/datamodel/money@1')
  })

  it('carries an artifact suffix on both absolute forms — they are the only two that may', () => {
    expect(resolveRef(base, '/protocol/settlement.transport@2')).toBe(
      'srn://acme/protocol/settlement.transport@2',
    )
    expect(resolveRef(base, 'srn://acme/protocol/settlement.transport')).toBe(
      'srn://acme/protocol/settlement.transport',
    )
  })
})

describe('resolveRef — relative references (RFC 3986, base = the referring entity directory)', () => {
  const base = 'srn://acme/product/shop/component/checkout'

  it('descends into an own bucket — bucket + name is two segments', () => {
    expect(resolveRef(base, 'datamodel/cart')).toBe('srn://acme/product/shop/component/checkout/datamodel/cart')
  })

  it('descends through a sub-component — four segments, two pairs', () => {
    expect(resolveRef(base, 'component/payment/datamodel/order@2')).toBe(
      'srn://acme/product/shop/component/checkout/component/payment/datamodel/order@2',
    )
  })

  it('one ".." pops the name only, landing inside the entity\'s own bucket', () => {
    expect(resolveRef(base, '../inventory')).toBe('srn://acme/product/shop/component/inventory')
  })

  it('two ".." pop the name and its bucket, landing on the owning product', () => {
    expect(resolveRef(base, '../../protocol/order-placement')).toBe('srn://acme/product/shop/protocol/order-placement')
  })

  it('four ".." pop two whole pairs, landing on the solution root', () => {
    expect(resolveRef(base, '../../../../actor/customer')).toBe('srn://acme/actor/customer')
  })

  it('ignores "." the way RFC 3986 does', () => {
    expect(resolveRef(base, './datamodel/cart')).toBe('srn://acme/product/shop/component/checkout/datamodel/cart')
  })

  it('rejects a reference climbing above the solution root', () => {
    expect(codeOf(() => resolveRef(base, '../../../../../datamodel/money'))).toBe('E_SRN_SYNTAX')
  })

  it('rejects arithmetic that lands on an illegal placement — an odd ".." count is the usual cause', () => {
    // Three pops leave `/product/shop/component` + `actor/operator`; two leave
    // `/product/shop` + `actor/operator`. Both put an actor below the solution.
    expect(codeOf(() => resolveRef(base, '../../actor/operator'))).toBe('E_SRN_PLACEMENT')
  })

  it('rejects arithmetic that lands on a half pair', () => {
    expect(codeOf(() => resolveRef(base, '../../../datamodel/money'))).toBe('E_SRN_SYNTAX')
  })

  it('rejects an artifact suffix — dot-suffix lexing stays out of ".." arithmetic', () => {
    for (const ref of ['../settlement.transport', '../../protocol/settlement.transport@1', 'datamodel/cart.schema']) {
      expect(codeOf(() => resolveRef(base, ref))).toBe('E_SRN_SYNTAX')
      expect(() => resolveRef(base, ref)).toThrow(/artifact suffix on a relative reference/)
    }
  })

  it('still reads "." and ".." as dot segments, never as artifact dots', () => {
    expect(resolveRef(base, '../inventory')).toBe('srn://acme/product/shop/component/inventory')
    expect(resolveRef(base, './datamodel/cart')).toBe('srn://acme/product/shop/component/checkout/datamodel/cart')
  })
})

describe('resolveRef — sealed solutions', () => {
  const base = 'srn://acme/product/shop/component/checkout'

  it('rejects an absolute reference into a foreign solution', () => {
    expect(codeOf(() => resolveRef(base, 'srn://globex/product/shop/datamodel/order'))).toBe('E_SRN_CROSS_SOLUTION')
  })

  it('rejects a network-path reference, which would swap the authority', () => {
    expect(codeOf(() => resolveRef(base, '//globex/product/shop/datamodel/order'))).toBe('E_SRN_CROSS_SOLUTION')
  })

  it('rejects an empty reference', () => {
    expect(codeOf(() => resolveRef(base, ''))).toBe('E_SRN_SYNTAX')
  })
})
