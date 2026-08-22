---
name: redemption-events
kind: protocol
version: 5
title: Redemption events
summary: Event bus carrying burnt coupons and reversals from coupon-service to everything that keeps a running total.
status: approved
owner: team-growth
style: bus
participants:
  - alias: coupon-service
    ref: /product/growth/component/coupon-service
    role: publisher
  - alias: campaign-manager
    ref: /product/growth/component/campaign-manager
    role: publisher-consumer
  - alias: audience
    ref: /product/growth/component/audience
    role: consumer
  - alias: promotion-engine
    ref: /product/growth/component/promotion-engine
    role: consumer
conforms-to:
  - standard: CloudEvents
    version: "1.0.2"
    url: https://cloudevents.io/
relations:
  uses:
    - /environment/production
tags:
  - promotions
  - asynchronous
---

One publisher of redemptions, three consumers, none of which the publisher knows
about. [campaign-manager](srn://acme/product/growth/component/campaign-manager)
is the one participant on both sides — it consumes redemptions to advance a
budget and publishes the resulting state change on its own topic — which is what
its `publisher-consumer` role records. The bus stays a bus regardless: no
participant addresses another, and none of them knows how many are listening.

Every
component in growth that maintains a running total maintains it from this bus:
[campaign-manager](srn://acme/product/growth/component/campaign-manager) advances
a campaign's `spent`, [audience](srn://acme/product/growth/component/audience)
refreshes the behavioural facts a segment clause tests, and
[promotion-engine](srn://acme/product/growth/component/promotion-engine)
invalidates the campaign entries in its cache when a budget runs out.

Placement follows from the participant list rather than from taste: all four
component participants sit under [growth](srn://acme/product/growth), so their
nearest common ancestor is that product and the entity sits in its `protocol/`
bucket. Add a consumer from another product and the correct placement moves to
the solution root with it.

## Why a bus and not a call

A burn is already committed when it is published. Nothing downstream may be able
to fail it — a campaign whose budget accounting is unavailable must not be able
to reject an order the customer has already paid for. That is the same argument
[settlement](srn://acme/protocol/settlement) makes one product over, and it
holds here for the same reason: the publisher's obligation ends when the fact is
durable.

The price is that `spent` on a
[campaign](srn://acme/product/growth/datamodel/campaign@1) lags the truth by the
consumer's own latency, and a campaign can therefore overspend its budget by the
redemptions in flight when the threshold is crossed. The window was measured and
accepted; the alternative is a synchronous decrement on the checkout path, which
[0002-fail-open-pricing](srn://acme/product/growth/adr/0002-fail-open-pricing)
rules out.

## Ordering and keys

Every topic is keyed by `campaign-id`, not by redemption id. All facts affecting
one budget therefore land on one partition and arrive in publication order,
which is what lets a consumer keep a running sum without a sort. Across
campaigns there is no ordering guarantee and none is needed.

A reversal is published on its own topic rather than as a mutated redemption,
because a correction is a fact and not an edit — the same discipline
[ledger-entry](srn://acme/product/billing/datamodel/ledger-entry@1) applies.
Gross and net campaign cost are both answerable by consuming both topics; a
consumer that reads only the first gets gross, and knows it.

## Retention and replay

90 days on both redemption topics — long enough to rebuild a campaign total from
scratch after a consumer bug, short enough that nobody mistakes the bus for the
[redemption](srn://acme/product/growth/datamodel/redemption@1) log, which is
authoritative and lives in coupon-service.

## Artifacts

`transport.yaml` binds the topics; `states.json` is the budget lifecycle of one
campaign as the bus reveals it, not the internal state of any consumer;
`workflows/redeem-coupon.yaml` is the burn-and-fan-out exchange. The
message-to-datamodel matrix on this page is derived from those files, which is
why the payload models do not appear in `relations`.

## The Arazzo description

`arazzo.yaml` re-describes this exchange as the campaign manager drives it, in
the OpenAPI Initiative's [Arazzo](https://spec.openapis.org/arazzo/latest.html)
format, grounded in `transport.yaml` — a redemption charged to a campaign and
the closure that may follow it, and separately the reversal that may arrive
later. The running totals are the component's own arithmetic, touch no channel,
and have no step.

An Arazzo Description has a single executor, so it describes one participant's
path and never the whole exchange: `workflows/` stays the authoritative
choreography, and the sequence diagrams on this page derive from it alone. The
file is grammar-free — snapshotted with the entity, served as authored, and
judged by no field table, so no shape of it can be wrong here. One rule does
reach it: grounding, `W_PROTO_ARAZZO_UNGROUNDED` — every source description
must name a sibling artifact, and every operation or channel a step names must
resolve inside one. The step graph the portal draws from the file is a picture
and checks nothing.
