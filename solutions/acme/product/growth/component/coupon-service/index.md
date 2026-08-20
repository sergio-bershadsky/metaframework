---
name: coupon-service
kind: component
version: 2
title: Coupon service
summary: Mints, validates, and burns coupon codes — the only component in growth holding a lock a customer can race.
status: review
owner: team-growth
component-type: service
lifecycle: released
relations:
  uses:
    - /environment/production
    - /environment/staging
    - /datamodel/money@1
  exposes:
    - /product/growth/protocol/promotion-evaluation
    - /product/growth/protocol/redemption-events
    - /product/growth/datamodel/coupon@1
    - /product/growth/datamodel/redemption@1
  implements:
    - /product/growth/requirement/stackable-promotions
    - /requirement/gdpr-erasure
  realizes:
    - /capability/promotion-pricing
tags:
  - coupons
  - stateful
x-runtime: kotlin-jvm
---

# Coupon service

Owns every [coupon](srn://acme/product/growth/datamodel/coupon@1) acme has ever
issued and every [redemption](srn://acme/product/growth/datamodel/redemption@1)
it has recorded. It is the stateful centre of an otherwise stateless product,
and the only place in growth where two customers can contend for the same row.

## The lock is the whole component

`redeemed-count < redemption-limit` is not a schema constraint and cannot be one
— it is a claim about a row at an instant, and two carts submitting the last use
of a code will both read the same value. This component serializes that: a burn
takes a row lock on the coupon, re-reads the counter inside the transaction,
increments it, and writes the redemption in the same transaction.

Everything else about the component follows from that decision. It is the reason
growth has a database at all, the reason this is the one component with a
meaningful failover story, and the reason
[promotion-engine](srn://acme/product/growth/component/promotion-engine) is
allowed to treat an unavailable coupon-service as "no coupon applies" rather
than as an error.

## Validate and burn are different operations

Validation is idempotent, cheap, and happens on every keystroke in the basket.
Burning happens once, when the order is placed, and is the only operation that
takes the lock. Conflating them would mean a customer who typed a code and
abandoned their cart had consumed it.

The split is visible in
[promotion-evaluation](srn://acme/product/growth/protocol/promotion-evaluation),
where `validate-coupon` is a read against a quote, and in
[redemption-events](srn://acme/product/growth/protocol/redemption-events), where
the burn is what produces the published fact.

## Codes are minted here, terms are decided elsewhere

[campaign-manager](srn://acme/product/growth/component/campaign-manager) hands
over the discount terms and asks for a batch; this component generates the codes
and guarantees their uniqueness. Uniqueness is a property of the store that
holds the codes, so the generator lives next to the store — an authoring service
minting codes would have needed a distributed uniqueness check to say anything
true.

The alphabet is in the [coupon](srn://acme/product/growth/datamodel/coupon@1)
schema rather than in this component's code, because every writer of a coupon
has to agree on it and a validator is a cheaper agreement than a code review.

## Erasure

It `implements` [gdpr-erasure](srn://acme/requirement/gdpr-erasure) because it
holds `issued-to` and `account-id` on records it must not delete: a redemption
is a financial fact charged to a campaign budget, and deleting it would make a
campaign's cost unanswerable. Erasure therefore replaces both identifiers with a
stable pseudonym and leaves the amounts intact — the same shape of answer
[ledger](srn://acme/product/billing/component/ledger) gives, for the same
reason.

## Status: review

Live for one storefront. The description is `review` because the failover
behaviour of the lock under a regional database failover has been designed and
argued but not yet exercised, and asserting `approved` before that test would be
claiming a guarantee nobody has observed.
