---
name: tax-quoting
kind: protocol
version: 2
title: Tax quoting
summary: In-process function calls from checkout into the tax-engine library — no network hop.
status: approved
owner: team-checkout
style: request-response
participants:
  - alias: checkout
    ref: /product/shop/component/checkout
    role: caller
  - alias: tax-engine
    ref: /product/shop/component/checkout/component/tax-engine
    role: responder
tags:
  - tax
  - internal
---

The smallest protocol in the catalog, and the one that proves the ontology does
not depend on a network. [checkout](srn://acme/product/shop/component/checkout) calls
[tax-engine](srn://acme/product/shop/component/checkout/component/tax-engine) through an exported interface
in the same process; there is no wire, no serialization, and no partial failure
mode beyond an exception.

## Why describe an in-process call at all

Because the contract is real and it is crossed by two teams. Tax rules change on
a legislative calendar, not a release calendar, and the library is versioned
independently of the service that embeds it. Writing the surface down here means
a change to the quoting contract is reviewable in the same way a change to
[order-placement](srn://acme/product/shop/protocol/order-placement) is, rather than being
discovered at compile time by whoever upgrades first.

It also fixes the placement question mechanically: both participants sit under
[checkout](srn://acme/product/shop/component/checkout), so their nearest common ancestor is
checkout, and this protocol lives in checkout's own bucket rather than at product
level.

## Contract

One function, `quote`, taking a [cart](srn://acme/product/shop/component/checkout/datamodel/cart@1)
and returning a [money](srn://acme/datamodel/money@1) amount. Jurisdiction is
derived from the cart's delivery address rather than passed separately, so there
is exactly one place where the rule "tax follows the delivery address" is
encoded.

`style: request-response` is honest here: a named caller invokes a named callee
and the protocol contracts a reply. The transport is `in-process`, which is a
different axis — the wire technology, not the addressing shape.
