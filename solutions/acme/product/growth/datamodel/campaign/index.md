---
name: campaign
kind: datamodel
version: 2
title: Campaign
summary: The funded, time-boxed container every promo and coupon charges against — budget, window, and objective, and the record published when one of the three changes.
status: approved
owner: team-growth
usage: both
abstract: false
tags:
  - promotions
  - finance
---

A campaign is the unit a marketer plans in and the unit finance holds them to.
It funds discounts, it does not describe one: nothing in this model says how
much comes off a basket, and a campaign with no promos attached is a legal,
meaningful, and quite common record.

`usage: both`, and the second half is the reason this model has a version 2.
[campaign-manager](srn://acme/product/growth/component/campaign-manager) is the
only writer of the stored record, and it publishes that record whole on
`acme.growth.campaign-state-changed.v1` — the cache-invalidation event on
[redemption-events](srn://acme/product/growth/protocol/redemption-events) that
tells the engine a budget is exhausted or a window has closed. A shape that is
both a row and a Kafka message carries both sets of pressures at once: a
migration plan on one side, a producer/consumer rollout order on the other, and
declaring only `storage` hid the second from every reviewer who asked what
crosses growth's boundary.

It composes two bases at once —
[base-record](srn://acme/datamodel/base-record@1) for identity and
[auditable](srn://acme/datamodel/auditable@1) for who last changed it and why.
Both are root-level `allOf` branches and they are peers; conjunction is
commutative, so the order they appear in carries no meaning. The mixin is here
and not on [promo](srn://acme/product/growth/datamodel/promo@1) because a budget
change is the thing a controller asks about after the fact, and the promo that
spent it is immutable once live.

## `spent` is a cached sum and says so

`spent` is not the truth. The truth is the
[redemption](srn://acme/product/growth/datamodel/redemption@1) log, and `spent`
is a running total maintained from the
[redemption-events](srn://acme/product/growth/protocol/redemption-events) bus.
It lags, sometimes by seconds, and the model is honest about that rather than
pretending to a transactional guarantee that spans two components.

The consequence is stated rather than hidden: a campaign can overspend its
budget by the redemptions in flight when the threshold is crossed. That window
was measured and accepted — the alternative is a synchronous decrement on the
checkout hot path, which
[0002-fail-open-pricing](srn://acme/product/growth/adr/0002-fail-open-pricing)
rules out on availability grounds. Finance's own figure comes from the ledger,
never from this field.

## Budget and window both stop it

`state: exhausted` and `state: ended` are different terminal outcomes and both
are useful: the first says the money ran out, the second that the clock did. A
marketer asking why an offer stopped gets a different answer and a different
next action in each case, which is exactly the distinction a single `inactive`
flag would have destroyed.

`budget` and `spent` are [money](srn://acme/datamodel/money@1) documents, so both
carry their currency. A campaign is single-currency for the same reason an order
is — [0001-single-currency](srn://acme/adr/0001-single-currency) — and a
multi-market effort is several campaigns, one per storefront.

## What is not here

No creative assets, no channel plan, no send schedule. Those live in the
marketing automation suite acme buys rather than builds, and this catalog
describes only the part that changes a price. A campaign identifier is the join
key between the two worlds, and keeping the join key while refusing the payload
is the boundary decision this model encodes.
