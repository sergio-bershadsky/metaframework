import { describe, expect, it } from 'vitest'
import { SrnError, formatSrn, parseSrn, resolveRef, srnToDir } from './srn'

/**
 * Cases are taken from framework/spec/srn.md. Every "notes pinned by tests"
 * bullet and every row of the validation table there has a case here.
 */

describe('parseSrn — shapes', () => {
  it('parses a solution', () => {
    expect(parseSrn('srn://acme')).toEqual({
      solution: 'acme',
      containers: [],
      kind: null,
      name: null,
      version: null,
    })
  })

  it('parses a product', () => {
    expect(parseSrn('srn://acme/shop')).toMatchObject({
      solution: 'acme',
      containers: ['shop'],
      kind: null,
    })
  })

  it('parses a nested component', () => {
    expect(parseSrn('srn://acme/shop/checkout/payment')).toMatchObject({
      containers: ['shop', 'checkout', 'payment'],
      kind: null,
    })
  })

  it('parses an owned entity with a pinned version', () => {
    expect(parseSrn('srn://acme/shop/checkout/payment/datamodel/order@1')).toEqual({
      solution: 'acme',
      containers: ['shop', 'checkout', 'payment'],
      kind: 'datamodel',
      name: 'order',
      version: 1,
    })
  })

  it('parses a product-level protocol', () => {
    expect(parseSrn('srn://acme/shop/protocol/order-events@1')).toMatchObject({
      containers: ['shop'],
      kind: 'protocol',
      name: 'order-events',
      version: 1,
    })
  })

  it('parses a solution-level actor — the keyword scan wins over container position', () => {
    expect(parseSrn('srn://acme/actor/customer@1')).toMatchObject({
      containers: [],
      kind: 'actor',
      name: 'customer',
      version: 1,
    })
  })

  it('treats an absent version as latest (null)', () => {
    expect(parseSrn('srn://acme/shop/datamodel/order').version).toBeNull()
  })
})

describe('parseSrn — rejections', () => {
  const cases: Array<[string, string, string]> = [
    ['missing scheme', 'acme/shop', 'E_SRN_SYNTAX'],
    ['trailing slash', 'srn://acme/shop/', 'E_SRN_SYNTAX'],
    ['empty segment', 'srn://acme//shop', 'E_SRN_SYNTAX'],
    ['uppercase', 'srn://acme/Shop', 'E_SRN_SYNTAX'],
    ['version not on final segment', 'srn://acme/shop@2/checkout', 'E_SRN_SYNTAX'],
    ['zero version', 'srn://acme/shop/datamodel/order@0', 'E_SRN_SYNTAX'],
    ['leading-zero version', 'srn://acme/shop/datamodel/order@01', 'E_SRN_SYNTAX'],
    ['non-integer version', 'srn://acme/shop/datamodel/order@1.2', 'E_SRN_SYNTAX'],
    ['kind bucket is not addressable', 'srn://acme/shop/datamodel', 'E_SRN_SYNTAX'],
    ['more than one segment after kind', 'srn://acme/shop/datamodel/order/extra', 'E_SRN_SYNTAX'],
    ['reserved keyword as solution', 'srn://protocol/shop/datamodel/order', 'E_SRN_RESERVED'],
    ['reserved keyword as entity name', 'srn://acme/shop/adr/adr', 'E_SRN_RESERVED'],
    ['query string', 'srn://acme/shop?x=1', 'E_SRN_SYNTAX'],
    ['fragment', 'srn://acme/shop#top', 'E_SRN_SYNTAX'],
  ]

  it.each(cases)('rejects %s', (_label, ref, code) => {
    expect(() => parseSrn(ref)).toThrow(SrnError)
    try {
      parseSrn(ref)
    } catch (err) {
      expect((err as SrnError).code).toBe(code)
    }
  })

  it('rejects a segment longer than 64 characters', () => {
    expect(() => parseSrn(`srn://acme/${'a'.repeat(65)}`)).toThrow(SrnError)
  })
})

describe('srnToDir', () => {
  it('maps an owned entity to its directory, dropping the version suffix', () => {
    expect(srnToDir(parseSrn('srn://acme/shop/checkout/payment/datamodel/order@1'))).toBe(
      'solutions/acme/shop/checkout/payment/datamodel/order',
    )
  })

  it('maps a container', () => {
    expect(srnToDir(parseSrn('srn://acme/shop/checkout'))).toBe('solutions/acme/shop/checkout')
  })

  it('maps a solution root', () => {
    expect(srnToDir(parseSrn('srn://acme'))).toBe('solutions/acme')
  })
})

describe('formatSrn', () => {
  it('round-trips every shape', () => {
    for (const ref of [
      'srn://acme',
      'srn://acme/shop',
      'srn://acme/shop/checkout/payment',
      'srn://acme/shop/checkout/payment/datamodel/order@1',
      'srn://acme/actor/customer@1',
    ]) {
      expect(formatSrn(parseSrn(ref))).toBe(ref)
    }
  })
})

describe('resolveRef — relative references (RFC 3986, base = referring document)', () => {
  const base = 'srn://acme/shop/checkout'

  it('resolves a child bucket reference', () => {
    expect(resolveRef(base, 'datamodel/cart')).toBe('srn://acme/shop/checkout/datamodel/cart')
  })

  it('resolves through a sub-component', () => {
    expect(resolveRef(base, 'payment/datamodel/order@2')).toBe(
      'srn://acme/shop/checkout/payment/datamodel/order@2',
    )
  })

  it('resolves a parent-relative reference', () => {
    expect(resolveRef(base, '../protocol/order-events')).toBe('srn://acme/shop/protocol/order-events')
  })

  it('resolves a path-absolute reference against the solution root', () => {
    expect(resolveRef(base, '/actor/customer')).toBe('srn://acme/actor/customer')
  })

  it('passes an already-absolute reference through unchanged', () => {
    expect(resolveRef(base, 'srn://acme/shop/datamodel/money@1')).toBe('srn://acme/shop/datamodel/money@1')
  })

  it('rejects a reference climbing above the solution root', () => {
    expect(() => resolveRef(base, '../../../../datamodel/money')).toThrow(
      expect.objectContaining({ code: 'E_SRN_SYNTAX' }),
    )
  })

  it('rejects a network-path reference naming a foreign solution', () => {
    expect(() => resolveRef(base, '//globex/shop/datamodel/order')).toThrow(
      expect.objectContaining({ code: 'E_SRN_CROSS_SOLUTION' }),
    )
  })

  it('rejects an absolute reference into a foreign solution', () => {
    expect(() => resolveRef(base, 'srn://globex/shop/datamodel/order')).toThrow(
      expect.objectContaining({ code: 'E_SRN_CROSS_SOLUTION' }),
    )
  })

})
