import { describe, expect, it } from 'vitest'
import {
  CONTAINER_KINDS,
  RESERVED_KINDS,
  SOLUTION_LEVEL_KINDS,
  SrnError,
  dirToSrn,
  formatSrn,
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
  it('is the closed set of eight buckets, product and component included', () => {
    expect([...RESERVED_KINDS].sort()).toEqual([
      'actor',
      'adr',
      'component',
      'datamodel',
      'environment',
      'product',
      'protocol',
      'requirement',
    ])
  })

  it('names only products and components as containers', () => {
    expect([...CONTAINER_KINDS]).toEqual(['product', 'component'])
  })

  it('names actors and environments as solution-level kinds', () => {
    expect([...SOLUTION_LEVEL_KINDS]).toEqual(['actor', 'environment'])
  })
})

describe('parseSrn — shapes', () => {
  it('parses a solution, whose path is empty and whose kind is null', () => {
    expect(parseSrn('srn://acme')).toEqual({
      solution: 'acme',
      path: [],
      kind: null,
      name: null,
      version: null,
    })
  })

  it('parses a product — one pair, always the first', () => {
    expect(parseSrn('srn://acme/product/shop')).toEqual({
      solution: 'acme',
      path: [{ kind: 'product', name: 'shop' }],
      kind: 'product',
      name: 'shop',
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

  it('passes an already-absolute reference through unchanged', () => {
    expect(resolveRef(base, 'srn://acme/datamodel/money@1')).toBe('srn://acme/datamodel/money@1')
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
