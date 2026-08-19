---
name: payment-method
kind: datamodel
version: 1
title: Payment method
summary: Discriminated union of the instruments a customer may pay with, tagged by a method constant.
status: approved
owner: team-shop
usage: both
abstract: false
tags:
  - payments
  - union
---

# Payment method

A `oneOf` over two branches — [card](srn://acme/shop/datamodel/card-payment@1)
and [sepa](srn://acme/shop/datamodel/sepa-payment@1) — each tagged by a `method`
property that is a distinct `const` and is required in every branch. That
discipline is what turns an opaque union into a variant map the portal can draw
and a consumer can switch on.

A union whose branches differ only in which properties they carry is still valid
JSON Schema and still validates instances. It is also unreadable: the reader has
to guess the author's intent from the shape of the data, and every new branch
makes an older consumer's guess wrong. The tag makes the intent explicit and the
extension additive.

## Adding a branch

Adding a third instrument is legal in place: append a `oneOf` branch with a new
`const` tag, bump this entity's version, and every consumer that switches on the
tag falls through to its default. Reusing an existing tag value for a different
shape is not legal at any version number — it changes what an existing instance
means, which is the one thing the additive rule never permits.

## Where it is used

[order-request](srn://acme/shop/datamodel/order-request@1) carries it on the
wire, and [order](srn://acme/shop/checkout/payment/datamodel/order@3) stores the
branch that was actually charged. Nothing outside those two references it, which
is why it sits in the shop product's bucket rather than at solution level.
