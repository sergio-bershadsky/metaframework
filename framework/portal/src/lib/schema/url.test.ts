import { afterEach, describe, expect, it } from 'vitest'
import {
  CANONICAL_SCHEMA_HOST,
  DEFAULT_SCHEMA_BASE_URL,
  isSchemaServingUrl,
  isSchemaUrl,
  schemaBaseUrl,
  schemaServingUrl,
  schemaUrlToPath,
  schemaUrlToSrn,
  srnToSchemaUrl,
} from './url'

/**
 * The URL layer is small on purpose, and every one of these cases exists because
 * something downstream breaks without it: a deployment renaming a schema, a
 * version pin leaking into an `$id`, or a `$ref` that looks like ours and is not.
 *
 * The load-bearing distinction: **identity is canonical and constant, retrieval
 * is per-deployment.** Every case below is about keeping those two apart.
 */

const original = process.env.SCHEMA_BASE_URL

afterEach(() => {
  if (original === undefined) delete process.env.SCHEMA_BASE_URL
  else process.env.SCHEMA_BASE_URL = original
})

describe('srnToSchemaUrl', () => {
  it('maps the SRN path through verbatim — buckets included', () => {
    expect(srnToSchemaUrl('srn://acme/product/shop/component/checkout/datamodel/cart')).toBe(
      `${CANONICAL_SCHEMA_HOST}/acme/product/shop/component/checkout/datamodel/cart`,
    )
  })

  it('drops a version pin — the URL addresses the current schema', () => {
    expect(srnToSchemaUrl('srn://acme/datamodel/money@7')).toBe(`${CANONICAL_SCHEMA_HOST}/acme/datamodel/money`)
  })

  it('refuses a malformed SRN instead of inventing a URL for it', () => {
    expect(() => srnToSchemaUrl('srn://acme/datamodel')).toThrow()
  })

  it('ignores SCHEMA_BASE_URL entirely — identity does not vary by deployment', () => {
    // Registries and caches key on `$id`. If a laptop and production disagreed
    // about a schema's identity, they would hold two schemas, not one.
    process.env.SCHEMA_BASE_URL = 'https://catalog.acme.example/'
    expect(srnToSchemaUrl('srn://acme/datamodel/money')).toBe(`${CANONICAL_SCHEMA_HOST}/acme/datamodel/money`)
  })
})

describe('schemaBaseUrl and schemaServingUrl', () => {
  it('falls back to the portal’s own dev origin', () => {
    delete process.env.SCHEMA_BASE_URL
    expect(schemaBaseUrl()).toBe(DEFAULT_SCHEMA_BASE_URL)
    expect(schemaServingUrl('srn://acme/datamodel/money')).toBe(
      `${DEFAULT_SCHEMA_BASE_URL}/schemas/acme/datamodel/money`,
    )
  })

  it('takes the serving origin from SCHEMA_BASE_URL, trailing slash and all', () => {
    process.env.SCHEMA_BASE_URL = 'https://catalog.acme.example/'
    expect(schemaBaseUrl()).toBe('https://catalog.acme.example')
    expect(schemaServingUrl('srn://acme/datamodel/money')).toBe(
      'https://catalog.acme.example/schemas/acme/datamodel/money',
    )
  })

  it('ignores an empty variable rather than producing "/schemas/…"', () => {
    process.env.SCHEMA_BASE_URL = '   '
    expect(schemaBaseUrl()).toBe(DEFAULT_SCHEMA_BASE_URL)
  })

  it('never confuses a serving address for an identity', () => {
    const serving = schemaServingUrl('srn://acme/datamodel/money')
    expect(isSchemaServingUrl(serving)).toBe(true)
    // A serving address is not a canonical URL and must never resolve as one:
    // that is what stops one from being written into an artifact unnoticed.
    expect(isSchemaUrl(serving)).toBe(false)
    expect(schemaUrlToSrn(serving)).toBeNull()
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

  it('rejects a foreign host — every schema is identified on the one canonical host', () => {
    expect(schemaUrlToSrn('https://elsewhere.example/acme/datamodel/money')).toBeNull()
    expect(isSchemaUrl('https://elsewhere.example/acme/datamodel/money')).toBe(false)
  })

  it('rejects a path that is not a legal entity address', () => {
    // A bucket with nothing in it, and a bucket in a position no bucket may hold.
    expect(schemaUrlToSrn(`${CANONICAL_SCHEMA_HOST}/acme/datamodel`)).toBeNull()
    expect(schemaUrlToSrn(`${CANONICAL_SCHEMA_HOST}/acme/actor/customer/datamodel/x`)).toBeNull()
    expect(schemaUrlToPath(`${CANONICAL_SCHEMA_HOST}/`)).toBeNull()
  })

  it('rejects a version pin smuggled into the URL', () => {
    expect(schemaUrlToSrn(`${CANONICAL_SCHEMA_HOST}/acme/datamodel/money@1`)).toBeNull()
  })

  it('rejects a dotted path — a URL addresses an entity, never an artifact', () => {
    // No `….schema` URL exists on the canonical host: the schema document's
    // canonical URL is the entity's own, and no other role has a projection.
    expect(schemaUrlToSrn(`${CANONICAL_SCHEMA_HOST}/acme/datamodel/money.schema`)).toBeNull()
    expect(schemaUrlToSrn(`${CANONICAL_SCHEMA_HOST}/acme/protocol/settlement.transport`)).toBeNull()
  })

  it('rejects a query or fragment — an address, not a request', () => {
    expect(schemaUrlToPath(`${CANONICAL_SCHEMA_HOST}/acme/datamodel/money?v=1`)).toBeNull()
    expect(schemaUrlToPath(`${CANONICAL_SCHEMA_HOST}/acme/datamodel/money#/$defs/x`)).toBeNull()
  })
})
