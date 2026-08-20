---
name: cart
kind: datamodel
version: 1
title: Cart
summary: The mutable basket a customer builds before checkout converts it into an order.
status: approved
owner: team-checkout
usage: storage
abstract: false
tags:
  - commerce
  - aggregate
---

The one mutable aggregate in the checkout path. A cart accumulates lines, holds a
currency fixed at creation, and expires. Everything downstream of it is
immutable, which is what makes the conversion point — `submit-order` — the only
place where a race can happen.

`usage: storage`: a cart never crosses a component boundary. What crosses is an
[order-request](srn://acme/product/shop/datamodel/order-request@1) that names it. That
distinction is why the field is required and cannot be inferred — a model with no
protocol reference today may be pure storage or may be an exchange model whose
protocol has not been written yet.

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
