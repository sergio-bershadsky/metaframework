---
name: coupon-redemption
kind: journey
version: 2
title: Coupon redemption
summary: A code a customer already holds turned into a smaller total and, eventually, into a line in a marketer's spend report.
status: draft
owner: team-growth
actor: /actor/customer
relations:
  uses:
    - /environment/production
tags:
  - promotions
  - cross-product
---

A customer with a basket types in a code. Six steps later the total has moved,
the money has been taken, the code cannot be used again, and the
[marketer](srn://acme/actor/marketer) who authored the offer can see what it
cost. The path crosses the boundary between
[growth](srn://acme/product/growth) and [shop](srn://acme/product/shop) three
times, which is more than any other path in this catalog, and it is the reason
the two products were given exactly two protocols between them.

## Why this journey exists next to first-purchase

[first-purchase](srn://acme/journey/first-purchase) crosses three products and
names no protocol at any of its seams. This one crosses one boundary three times
and names a real protocol at every crossing. Both statements are true of the
same solution, and the difference is not maturity — it is that growth and shop
talk to each other, while shop, identity and fulfilment are joined by a customer
with a browser and an email client. Reading the two journeys side by side is the
fastest way to see which of acme's seams are described and which are inhabited.

## Outcome

The customer is charged the discounted total once, and the code is spent.

## Preconditions

The customer already holds a code. Where the code came from — a
[campaign](srn://acme/product/growth/datamodel/campaign@1) a marketer authored,
a batch minted by
[coupon-service](srn://acme/product/growth/component/coupon-service) — is supply,
not redemption, and it is not in these steps. A journey that started at minting
would have two outcomes and by the rules of the kind would be two journeys.

## Why the last step belongs to the marketer

The customer's path ends at `steps[4]`: they have paid, and nothing further is
asked of them. `steps[5]` is a hand-off, and it is in the list because the
redemption is not finished when the customer stops caring about it. The burn is
published on
[redemption-events](srn://acme/product/growth/protocol/redemption-events) and
lands against a campaign budget, and the marketer is the only actor who ever
reads this path's outcome — which is exactly the goal
[marketer](srn://acme/actor/marketer) states about seeing what a promotion has
already cost before extending it.

## Out of scope

Stacking. This path shows one code against one basket; which offers may combine
and in which order is
[stackable-promotions](srn://acme/product/growth/requirement/stackable-promotions)'s
to settle, and it is a rule rather than a route. Also out of scope: what happens
when
[promotion-engine](srn://acme/product/growth/component/promotion-engine) does not
answer in time. That is a second outcome — the customer pays list price — so by
the no-branching rule it is a second journey, and
[0002-fail-open-pricing](srn://acme/product/growth/adr/0002-fail-open-pricing) is
where the decision behind it lives.
