---
name: campaign-manager
kind: component
version: 1
title: Campaign manager
summary: The authoring surface — where a marketer writes campaigns, promos, and segment rules, and only there.
status: review
owner: team-growth
component-type: service
relations:
  uses:
    - /environment/production
    - /environment/staging
    - /datamodel/money@1
    - /product/growth/protocol/redemption-events
  exposes:
    - /product/growth/datamodel/campaign@1
    - /product/growth/datamodel/audience-segment@1
    - /product/growth/datamodel/promo@1
  depends-on:
    - /product/growth/component/audience
    - /product/growth/component/coupon-service
  implements:
    - /product/growth/requirement/stackable-promotions
tags:
  - marketing
  - authoring
x-runtime: kotlin-jvm
---

# Campaign manager

The only writer of [campaign](srn://acme/product/growth/datamodel/campaign@1),
[promo](srn://acme/product/growth/datamodel/promo@1), and
[audience-segment](srn://acme/product/growth/datamodel/audience-segment@1)
records. A [marketer](srn://acme/actor/marketer) reaches it and nothing else in
this product; every other component in growth reads what this one wrote.

Concentrating the write path in one component is what makes the approval rules
enforceable. A promotion is a price change, and a price change acme cannot
attribute to a person is an audit finding — which is why
[campaign](srn://acme/product/growth/datamodel/campaign@1) composes
[auditable](srn://acme/datamodel/auditable@1) and why this component is the only
thing that fills those fields in.

## Not on the hot path

Nothing a customer does reaches this component. It is a service rather than a
job because a marketer is waiting on its responses, but it sits entirely outside
checkout's request path: an outage here stops authoring, not selling. That is
also why it declares both
[production](srn://acme/environment/production) and
[staging](srn://acme/environment/staging) without any latency requirement of its
own — the budget in
[promotion-evaluation-budget](srn://acme/product/growth/requirement/promotion-evaluation-budget)
is [promotion-engine](srn://acme/product/growth/component/promotion-engine)'s to
meet, not this one's.

## Why it consumes its own product's bus

It `uses`
[redemption-events](srn://acme/product/growth/protocol/redemption-events) as a
consumer, to advance a campaign's `spent` figure from redemptions published by
[coupon-service](srn://acme/product/growth/component/coupon-service). The
alternative — coupon-service calling this component synchronously on every
redemption — would have put an authoring service in the checkout blast radius,
which is precisely the coupling the bus exists to break.

The consequence is that `spent` lags, and the campaign model says so plainly
rather than implying a transactional total.

## The two dependencies, and what they are for

[audience](srn://acme/product/growth/component/audience) is asked for a segment's
size at authoring time, so a marketer sees "about 42,000 accounts" before
committing — and so a segment below the re-identification floor can be refused
where the marketer can still fix it, rather than silently at materialization.

[coupon-service](srn://acme/product/growth/component/coupon-service) is asked to
mint code batches. This component decides *what* a coupon is worth and hands the
terms over; it never generates a code itself, because uniqueness is a property of
the store that holds them.

## Status: review

The component is live for one storefront. This description is `review` rather
than `approved` because the approval chain for a promotion above a certain value
is still being negotiated with finance, and that chain is the single most
important thing this page will eventually assert.
