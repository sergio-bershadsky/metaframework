---
name: discount
kind: datamodel
version: 1
title: Discount
summary: Abstract base of every price reduction — shared scope fields plus a tagged union of three arithmetic kinds.
status: approved
owner: team-growth
usage: both
abstract: true
tags:
  - promotions
  - foundation
---

Every reduction acme can apply to a basket is a discount. The model carries what
all of them share — a customer-facing label, the total it applies to, the
currency it is valid in, and whether it may combine with others — and delegates
the arithmetic to a tagged union of three branches.

It is `abstract: true`: nothing stores or transmits a bare discount. What gets
stored is a [promo](srn://acme/product/growth/datamodel/promo@1) or a
[coupon](srn://acme/product/growth/datamodel/coupon@1), each of which composes
this model with a root-level `allOf`.

## Two axes, deliberately separated

A discount varies along two independent axes and the schema keeps them apart.

*How much* it is worth is the `kind` union here: `percentage`, `fixed-amount`,
`free-shipping`. *How it is obtained* is the concrete subtype: acme applies a
promo, a customer presents a coupon. Every combination of the two is meaningful
— a percentage coupon and a percentage promo are both ordinary — and collapsing
them into one enumeration of six values would have produced a model in which
half the field combinations are illegal and none of the illegality is
expressible. The argument is written up in
[0001-discount-inheritance](srn://acme/product/growth/adr/0001-discount-inheritance).

## Why basis points and not a decimal

`percentage.basis-points` is an integer count of hundredths of a percent, not a
decimal string. Unlike [money](srn://acme/datamodel/money@1), a rate is not a
value the customer is shown or the ledger records; it is a multiplier applied
once, and an integer multiplier with an explicit divisor of 10000 is exactly
representable in every language that will read this schema. The rounding of the
*product* is a policy, and it belongs to the component that applies it — see
[stackable-promotions](srn://acme/product/growth/requirement/stackable-promotions)
for the rule and its acceptance criteria.

`cap`, `minimum-spend`, and `max-refund` are money documents, because those *are*
amounts a customer can be shown and a controller can be asked about.

## Composition, not closure

`additionalProperties` is unset here and in every branch. An `allOf` branch is
evaluated independently of its siblings, so a closed base would reject every
property promo and coupon add — the composition trap the framework names as its
own error class. The union branches are open for the same reason: a coupon
carrying `code` still has to satisfy the `percentage` branch.

## Adding a fourth kind

Append a `oneOf` branch with a new `const` tag and bump this entity's version.
Every consumer that switches on `kind` falls through to its default, and every
stored promo and coupon keeps validating. Reusing an existing tag for a
different shape is not legal at any version — it changes what an already-written
record means, which is the one thing the additive rule never allows.
