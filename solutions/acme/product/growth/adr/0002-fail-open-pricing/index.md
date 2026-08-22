---
name: 0002-fail-open-pricing
kind: adr
version: 2
title: Promotion evaluation is advisory and fails open
summary: An unavailable growth never blocks an order — checkout prices undiscounted and the customer sees no offer.
status: approved
owner: team-growth
decision-status: accepted
date: "2026-07-02"
deciders:
  - team-growth
  - team-checkout
  - team-platform
  - sergio
relations:
  uses:
    - /product/growth/protocol/promotion-evaluation
    - /environment/production
tags:
  - promotions
  - availability
---

## Context

[growth](srn://acme/product/growth) put a new component on the checkout request
path. [checkout](srn://acme/product/shop/component/checkout) already carried a
p99 obligation and an availability target that predate this product, and the
first design review asked the question that decides everything else: when
[promotion-engine](srn://acme/product/growth/component/promotion-engine) cannot
answer, what does checkout do?

Two honest answers were on the table. Fail closed — refuse the order, because a
customer who was promised a discount and did not receive it will contact
support, and a customer charged full price for a basket that showed a discount
is a complaint acme deserves. Or fail open — take the order at full price and
show no offer at all.

The commercial argument cut against intuition: growth's own measurements put the
revenue of every promotion acme runs at a fraction of the revenue of the orders
that would be refused during even a short growth outage.

## Decision

Promotion evaluation is **advisory**. Growth is never able to prevent an order.

Concretely:

- Every reply on
  [promotion-evaluation](srn://acme/product/growth/protocol/promotion-evaluation)
  is a [promotion-quote](srn://acme/product/growth/datamodel/promotion-quote@1),
  including the degraded one. There is no error response meaning "the engine is
  unwell".
- A quote the engine could not fully compute carries `fallback: true` and an
  empty `applied` list. Checkout prices the cart undiscounted and shows no
  offer — not a stale offer, and not an error.
- The degradation is a field rather than an HTTP status, because a consumer that
  has to distinguish "no discounts apply" from "we could not tell" by reading a
  status code will get it wrong under exactly the conditions where it matters.
- Growth's own dependencies fail the same way one level down: a timeout from
  [audience](srn://acme/product/growth/component/audience) or
  [coupon-service](srn://acme/product/growth/component/coupon-service) is read
  as a negative answer, and the affected candidate appears in the quote's
  `rejected` list with a reason.
- Budget enforcement is asynchronous, over
  [redemption-events](srn://acme/product/growth/protocol/redemption-events),
  never a synchronous decrement on the request path.

## Consequences

- A growth outage costs acme every promotion it would have given away and no
  orders. That is the trade, stated plainly.
- A customer can see a discount in the basket and not see it at the payment
  step. The `rejected` list exists so the basket can say which discount and
  why, and this is the failure mode acme chose rather than one it stumbled into.
- A campaign can overspend its budget, bounded by the redemptions in flight when
  the threshold is crossed plus the engine's 60-second cache window. Finance
  accepted the bound after it was measured;
  [campaign](srn://acme/product/growth/datamodel/campaign@1) records `spent` as
  a lagging figure rather than pretending otherwise.
- Fail-open hides its own failures. Nothing alerts when discounts silently stop
  being applied, which is why
  [promotion-evaluation-budget](srn://acme/product/growth/requirement/promotion-evaluation-budget)
  carries AC-5: a ceiling on the fallback rate, breached means incident.
- Checkout owns the `uses` edge toward this protocol and has not yet authored
  it. Until it does, growth's inbound reuse list is empty and this catalog
  understates the coupling — the edge belongs to the reusing side and this
  product will not author it from the wrong end.

## Graduation checklist

This decision holds while growth is `incubating` and shop is a client that can
be switched off. When checkout authors its `uses` edge the two products co-own
the surface, and three things become due at once:

1. [promotion-evaluation](srn://acme/product/growth/protocol/promotion-evaluation)
   is swapped for a successor at `srn://acme/protocol/promotion-evaluation`. Its
   component participants span two products, so the nearest-common-ancestor rule
   already places it at the solution root; it sits in growth's bucket only
   because growth still owns the contract unilaterally, and `/diagnostics`
   reports that as `W_STRUCT_PROTOCOL_NCA` in the meantime. Version 1 of this
   ADR said the entity "moves", which is not an operation this framework has:
   the SRN is the path, so the successor is authored at the root with a
   `supersedes` edge and this one is deprecated in place and kept.
2. The fallback ceiling in AC-5 becomes a shared alert rather than a growth one.
3. This ADR is revisited, because "advisory" is a much weaker promise once shop
   has planned its basket UI around the discount being there.

## Alternatives considered

- **Fail closed.** Rejected on the revenue comparison above, and on a second
  ground: it makes an incubating product able to take down the storefront, which
  no incubating product should be able to do.
- **Serve a stale quote from checkout's cache.** Rejected: a quote is an opinion
  about a cart at an instant, and honouring an expired one is how acme ends up
  giving away a discount whose campaign ended last week. It also breaks the
  determinism
  [stackable-promotions](srn://acme/product/growth/requirement/stackable-promotions)
  requires.
- **A synchronous budget check on the request path.** Rejected: it puts a write
  lock on a campaign row inside checkout's p99 and makes the campaign store a
  checkout dependency. The asynchronous alternative costs a bounded overspend,
  which is money, and money was the cheaper thing to spend.
- **Circuit-break at checkout instead of degrading at the engine.** Rejected as
  the same decision made in the wrong place: checkout would then have to know
  what a degraded price is, and the definition of "undiscounted" would live in
  two products.
