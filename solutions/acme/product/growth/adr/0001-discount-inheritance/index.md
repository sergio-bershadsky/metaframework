---
name: 0001-discount-inheritance
kind: adr
version: 1
title: One abstract discount base, two subtypes, three arithmetic kinds
summary: Discounts vary along two independent axes, so the model separates them — a tagged union under a shared base.
status: approved
owner: team-growth
decision-status: accepted
date: "2026-06-11"
deciders:
  - team-growth
  - team-checkout
  - sergio
relations:
  uses:
    - /product/growth/datamodel/discount@1
    - /datamodel/base-record@1
tags:
  - promotions
  - modelling
---

## Context

Growth had to express six things acme sells promotions with: a percentage off,
an amount off, and free shipping, each of which can arrive either automatically
(acme applies it) or by presentation (the customer types a code). Every one of
the six combinations occurs in the current commercial plan, and the combinations
are not correlated — a percentage coupon is exactly as ordinary as a percentage
promo.

Three shapes then compete for the same modelling budget: the fields shared by
everything that reduces a price, the fields that differ by arithmetic, and the
fields that differ by how the discount was obtained. The first attempt put all
of them in one flat object with fourteen optional properties, and within a month
nobody could say which combinations were legal.

## Decision

We model the two axes separately.

The vertical axis is inheritance.
[discount](srn://acme/product/growth/datamodel/discount@1) is `abstract: true`
and composes [base-record](srn://acme/datamodel/base-record@1) with a root-level
`allOf`. It owns what every reduction shares: label, scope, currency,
stackability. Two concrete models compose it the same way —
[promo](srn://acme/product/growth/datamodel/promo@1) adds a funding campaign, an
audience, and a window;
[coupon](srn://acme/product/growth/datamodel/coupon@1) adds a code, an expiry,
and a burn counter. The lineage is therefore three levels deep,
`base-record → discount → coupon`, and each level adds only what it is
responsible for.

The horizontal axis is a discriminated union. Inside `discount`, a `oneOf` over
three branches tagged by a `kind` constant — `percentage`, `fixed-amount`,
`free-shipping` — carries the arithmetic and nothing else. Because it lives on
the base, both subtypes inherit it and every one of the six combinations is
expressible without a single conditional.

Both concrete subtypes additionally declare a required `source` constant, so a
consumer holding a discount of unknown provenance —
[promotion-quote](srn://acme/product/growth/datamodel/promotion-quote@1)'s
`applied` array — can switch on it. That is a second discriminated union, over
the subtypes, and it exists for exactly that one consumer.

## Consequences

- Adding a fourth arithmetic kind is one additive `oneOf` branch on `discount`.
  Every stored promo and coupon keeps validating, and every consumer that
  switches on `kind` falls through to its default.
- Adding a third way to obtain a discount — a loyalty award, the current
  candidate — is one new model composing `discount`, plus one `oneOf` branch on
  `promotion-quote`. Nothing already written changes.
- The cost is depth. A reader who wants coupon's full field list must flatten
  three documents, and the portal's schema explorer has to draw a three-level
  tree rather than a table. That is a real tax on comprehension, paid once per
  reader, against a tax on correctness paid on every change.
- `discount` cannot be closed with `additionalProperties: false` — an `allOf`
  branch is evaluated independently of its siblings, so a closed base would
  reject every property its descendants add. The framework names that as its own
  error class, and this decision is why the class matters here.
- Two tag properties, `kind` and `source`, exist in one hierarchy. That is one
  more discriminator than a reviewer expects, and the reason both are `const`
  and both are `required` is so a validator, not a convention, enforces them.

## Alternatives considered

- **Six sibling models, no base.** `percentage-promo`, `fixed-amount-coupon`,
  and four more. Rejected: the shared fields would have been copied six times,
  and the seventh combination — a fourth kind, or a third source — turns six
  models into eight or nine. The combinatorics are the argument.
- **One flat model with optional fields.** What the first attempt built.
  Rejected: fourteen optional properties admit thousands of field combinations
  of which a few dozen are legal, and none of the illegality is expressible in
  the schema. Every consumer reimplements the same validation and two of them
  get it wrong.
- **One `kind` enumeration of six values.** Collapses both axes into one tag.
  Rejected because the axes are genuinely independent: `percentage-coupon` and
  `fixed-amount-coupon` share the code, the expiry and the counter, and nothing
  in a flat enumeration lets them share it.
- **Composition instead of inheritance — a discount *has* an arithmetic
  object.** Genuinely close, and it survives the combinatorics just as well. The
  deciding argument was the wire: a nested `arithmetic: { kind, basis-points }`
  is one more level of indirection in every payload and every consumer's
  switch, for no gain over a union whose tag sits at the same level as the
  fields it selects.
