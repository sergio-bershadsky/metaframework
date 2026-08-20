---
name: promotion-pricing
kind: capability
version: 1
title: Sell a basket for less, on purpose
summary: Work out what a basket is worth once every offer the customer qualifies for has been applied, and charge that number rather than the list price.
status: draft
owner: team-growth
tags:
  - promotions
  - commerce
---

Acme can decide that a particular basket, belonging to a particular customer, at
a particular moment, should cost less than the sum of its list prices — and can
then actually charge the reduced number, once, without anybody having to explain
afterwards where it came from. That is one doing with two halves and they are
owned by different teams:
[growth](srn://acme/product/growth) decides what an offer is worth, and
[shop](srn://acme/product/shop) decides what the customer is charged and takes
the money.

Keeping both halves inside one capability is the whole reason this entity is
worth writing. The seam between them is the only place in the solution where a
priced quote crosses a product boundary on the hot path, and a description that
gave each product its own capability would let both be true while the customer
was charged the wrong amount. The capability is discharged at the point of sale
or not at all; a quote nobody applied is arithmetic.

Rebuild the evaluator, replace coupons with something else entirely, move the
authoring surface into a spreadsheet — the sentence stands. What would break it
is acme deciding it no longer sells anything for less than list, which is a
business decision and exactly the kind of change this kind is built to record.

## Boundaries

- **Not the price of the goods.** What a thing costs before any offer, and in
  which currency, is
  [multi-currency-pricing](srn://acme/product/shop/requirement/multi-currency-pricing)'s
  business and lives in [shop](srn://acme/product/shop). This capability only
  ever moves a total downward from a list price it did not set.
- **Ends when the discounted total is charged.** What the discount cost acme,
  posted against a campaign budget, is a reporting question; what it cost in
  accounting terms is [billing](srn://acme/product/billing)'s ledger. Neither is
  inside this sentence.
- **Deliberately blind to who the customer is.** Growth holds an opaque account
  identifier and nothing else about a person, and
  [personalized-pricing](srn://acme/product/growth/requirement/personalized-pricing)
  records that as a decision rather than an omission. A capability to price
  *individually* is a different capability, and acme has chosen not to have it.
- **The evaluation is allowed to fail.**
  [0002-fail-open-pricing](srn://acme/product/growth/adr/0002-fail-open-pricing)
  settles what happens when the engine does not answer in time, and the answer —
  charge list price — is inside this capability's failure path, not outside it.
  Acme can still sell the basket; it just sells it for more.

## Not this

- *Running a campaign* is not this capability. A
  [marketer](srn://acme/actor/marketer) authoring a promo in
  [campaign-manager](srn://acme/product/growth/component/campaign-manager) is
  preparing the offers this doing later applies; the doing is what happens to a
  basket, not what happens in an authoring screen.
- *Issuing a coupon code* is not it either, for the same reason. Minting is
  supply; this capability is the moment of use. The two are separated in the
  catalog by
  [coupon-redemption](srn://acme/journey/coupon-redemption), which is the path
  that joins them and is a journey precisely because the order of the steps is
  what makes it interesting.
- *Stackability* — which offers may combine and in what order — is a statement
  that must be true and is therefore a requirement
  ([stackable-promotions](srn://acme/product/growth/requirement/stackable-promotions)),
  not a second capability. So is answering inside a budget
  ([promotion-evaluation-budget](srn://acme/product/growth/requirement/promotion-evaluation-budget)).
