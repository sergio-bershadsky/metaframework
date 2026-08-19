import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_SCHEMA_BASE_URL,
  isSchemaUrl,
  schemaBaseUrl,
  schemaUrlToPath,
  schemaUrlToSrn,
  srnToSchemaUrl,
} from './url'

/**
 * The URL layer is small on purpose, and every one of these cases exists because
 * something downstream breaks without it: a hand-typed host, a version pin
 * leaking into an `$id`, or a `$ref` that looks like ours and is not.
 */

const original = process.env.SCHEMA_BASE_URL

afterEach(() => {
  if (original === undefined) delete process.env.SCHEMA_BASE_URL
  else process.env.SCHEMA_BASE_URL = original
})

describe('schemaBaseUrl', () => {
  it('falls back to the portal’s own dev origin', () => {
    delete process.env.SCHEMA_BASE_URL
    expect(schemaBaseUrl()).toBe(DEFAULT_SCHEMA_BASE_URL)
  })

  it('takes the origin from SCHEMA_BASE_URL, trailing slash and all', () => {
    process.env.SCHEMA_BASE_URL = 'https://catalog.acme.example/'
    expect(schemaBaseUrl()).toBe('https://catalog.acme.example')
    expect(srnToSchemaUrl('srn://acme/datamodel/money')).toBe(
      'https://catalog.acme.example/schemas/acme/datamodel/money',
    )
  })

  it('ignores an empty variable rather than producing "/schemas/…"', () => {
    process.env.SCHEMA_BASE_URL = '   '
    expect(schemaBaseUrl()).toBe(DEFAULT_SCHEMA_BASE_URL)
  })
})

describe('srnToSchemaUrl', () => {
  it('maps the SRN path through verbatim — buckets included', () => {
    expect(srnToSchemaUrl('srn://acme/product/shop/component/checkout/datamodel/cart')).toBe(
      'http://localhost:3000/schemas/acme/product/shop/component/checkout/datamodel/cart',
    )
  })

  it('drops a version pin — the URL addresses the current schema', () => {
    expect(srnToSchemaUrl('srn://acme/datamodel/money@7')).toBe('http://localhost:3000/schemas/acme/datamodel/money')
  })

  it('refuses a malformed SRN instead of inventing a URL for it', () => {
    expect(() => srnToSchemaUrl('srn://acme/datamodel')).toThrow()
  })
})

describe('schemaUrlToSrn', () => {
  it('round-trips every SRN it is given', () => {
    for (const srn of [
      'srn://acme/datamodel/money',
      'srn://acme/product/shop/datamodel/order-line',
      'srn://acme/product/shop/component/checkout/component/payment/datamodel/order',
    ]) {
      expect(schemaUrlToSrn(srnToSchemaUrl(srn))).toBe(srn)
    }
  })

  it('rejects a foreign origin — solutions are served by the portal that owns them', () => {
    expect(schemaUrlToSrn('https://elsewhere.example/schemas/acme/datamodel/money')).toBeNull()
    expect(isSchemaUrl('https://elsewhere.example/schemas/acme/datamodel/money')).toBe(false)
  })

  it('rejects a path outside the /schemas/ namespace', () => {
    expect(schemaUrlToPath('http://localhost:3000/api/history/acme')).toBeNull()
    expect(schemaUrlToPath('http://localhost:3000/schemas/')).toBeNull()
  })

  it('rejects a path that is not a legal entity address', () => {
    // A bucket with nothing in it, and a bucket in a position no bucket may hold.
    expect(schemaUrlToSrn('http://localhost:3000/schemas/acme/datamodel')).toBeNull()
    expect(schemaUrlToSrn('http://localhost:3000/schemas/acme/actor/customer/datamodel/x')).toBeNull()
  })

  it('rejects a version pin smuggled into the URL', () => {
    expect(schemaUrlToSrn('http://localhost:3000/schemas/acme/datamodel/money@1')).toBeNull()
  })

  it('rejects a query or fragment — an address, not a request', () => {
    expect(schemaUrlToPath('http://localhost:3000/schemas/acme/datamodel/money?v=1')).toBeNull()
    expect(schemaUrlToPath('http://localhost:3000/schemas/acme/datamodel/money#/$defs/x')).toBeNull()
  })
})
