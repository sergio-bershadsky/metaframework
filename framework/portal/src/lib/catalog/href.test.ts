import { describe, expect, it } from 'vitest'
import { entityHref } from './href'

/**
 * The route is the entity's identity, so it never carries a `@version` pin.
 * References do carry one — the workflow mini-language says a `payload` SHOULD
 * pin — and those references are what the diagrams hand to `entityHref`.
 */
describe('entityHref', () => {
  it('maps an SRN onto the catalog route', () => {
    expect(entityHref('srn://acme/product/shop/datamodel/order')).toBe('/catalog/acme/product/shop/datamodel/order')
  })

  it('drops the @version pin, which the route does not carry', () => {
    expect(entityHref('srn://acme/product/shop/datamodel/order@1')).toBe('/catalog/acme/product/shop/datamodel/order')
    expect(entityHref('srn://acme/product/shop/datamodel/order@12')).toBe('/catalog/acme/product/shop/datamodel/order')
  })

  it('leaves a solution root alone', () => {
    expect(entityHref('srn://acme')).toBe('/catalog/acme')
    expect(entityHref('srn://acme@3')).toBe('/catalog/acme')
  })

  it('keeps an `@` that is not a trailing pin', () => {
    // Not valid SRN, but `entityHref` is total by design: a malformed reference
    // yields a dead link, never a throw during render.
    expect(entityHref('srn://acme/product/a@b/datamodel/order')).toBe('/catalog/acme/product/a@b/datamodel/order')
    expect(entityHref('srn://acme/datamodel/order@0')).toBe('/catalog/acme/datamodel/order@0')
    expect(entityHref('srn://acme/datamodel/order@')).toBe('/catalog/acme/datamodel/order@')
  })

  it('strips the pin from behind an artifact suffix, the one written order', () => {
    expect(entityHref('srn://acme/datamodel/order.schema@2')).toBe('/catalog/acme/datamodel/order.schema')
  })
})
