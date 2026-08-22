---
name: cart
kind: datamodel
version: 2
title: Cart
summary: The mutable basket a customer builds before checkout converts it into an order — stored by checkout, and sent out whole whenever somebody has to price it.
status: approved
owner: team-checkout
usage: both
abstract: false
tags:
  - commerce
  - aggregate
---

The one mutable aggregate in the checkout path. A cart accumulates lines, holds a
currency fixed at creation, and expires. Everything downstream of it is
immutable, which is what makes the conversion point — `submit-order` — the only
place where a race can happen.

`usage: both`. Checkout owns the stored cart, and two protocols carry the whole
record off checkout's own ground: `evaluate-cart` on
[promotion-evaluation](srn://acme/product/growth/protocol/promotion-evaluation)
puts it on the wire to growth over mTLS, and `quote` on
[tax-quoting](srn://acme/product/shop/component/checkout/protocol/tax-quoting)
hands it to the embedded tax engine. Neither pricing question can be asked about
a basket without sending the basket.

This entity read `usage: storage` through v1, on the reasoning that what crosses
a boundary is the
[order-request](srn://acme/product/shop/datamodel/order-request@1) that names a
cart rather than the cart itself. That is true of the *conversion* path and was
never true of the *pricing* path, and the two transports above said so in
writing the whole time — `W_DM_USAGE_MISMATCH` is what read them and asked. The
correction is left visible here rather than quietly applied, because the field
exists precisely to be a claim somebody can be wrong about: it cannot be
inferred, so a model with no protocol reference today may be pure storage or may
be an exchange model whose protocol has not been written yet.

## Composition

Extends [base-record](srn://acme/datamodel/base-record@1) for identity and
creation time, and carries [order-line](srn://acme/product/shop/datamodel/order-line@1)
items and a [money](srn://acme/datamodel/money@1) subtotal. It is not
`auditable`: nobody audits a basket, and adding the mixin would put two fields
into every row for no reader.

## Expiry

`expires-at` is advisory in the schema and binding in behaviour: checkout refuses
to convert an expired cart, and the reservation window in
[order-placement](srn://acme/product/shop/protocol/order-placement) is deliberately
shorter than it. A schema cannot state that relationship, which is exactly the
kind of invariant that belongs in prose.
