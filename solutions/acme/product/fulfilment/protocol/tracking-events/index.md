---
name: tracking-events
kind: protocol
version: 2
title: Tracking events
summary: Kafka bus carrying normalized carrier scans inward and derived delivery status outward to everyone who cares.
status: approved
owner: team-fulfilment
style: bus
participants:
  - alias: courier
    ref: /actor/courier
    role: scan-origin
  - alias: gateway
    ref: /product/fulfilment/component/carrier-gateway
    role: publisher
  - alias: tracking
    ref: /product/fulfilment/component/tracking
    role: consumer
  - alias: orchestrator
    ref: /product/fulfilment/component/delivery-orchestrator
    role: consumer
  - alias: customer
    ref: /actor/customer
    role: subscriber
conforms-to:
  - standard: CloudEvents
    version: "1.0.2"
    url: https://cloudevents.io/
relations:
  uses:
    - /environment/production
tags:
  - logistics
  - asynchronous
---

The inbound half of fulfilment. The world reports what happened to a parcel, at
times acme does not choose, and every interested component catches up at its own
pace. Nobody names a receiver; the fan-out is by subscription, which is what
makes this a `bus` rather than a set of calls.

Placement is mechanical: the component participants are the
[gateway](srn://acme/product/fulfilment/component/carrier-gateway),
[tracking](srn://acme/product/fulfilment/component/tracking), and the
[orchestrator](srn://acme/product/fulfilment/component/delivery-orchestrator), whose
common pair prefix is `product/fulfilment`. The two actors do not enter that
calculation — actors are solution-level, and counting them would collapse every
protocol to the solution root.

## Why the courier is a participant

The `courier` lifeline is the origin of every fact on this bus, and a description
that started at the carrier's webhook would start one hop too late. The first
step of `report-progress` is a scan by a human, and it carries no `channel`
because it does not travel on Kafka at all — it reaches the gateway's ingress as
a carrier webhook, and the gateway is what puts it on a topic.

Showing that hop is the difference between a diagram that explains where data
comes from and one that asserts it appears.

## Why the customer is a participant

The customer does not consume a Kafka topic. The `customer` lifeline marks where
a delivery notification *leaves the solution*, and the transport of that last hop
— email, push, the storefront's order page — belongs to the storefront, not to
this protocol. Drawing it here is honest about the fan-out's real audience; the
alternative was a diagram in which a status change is published to two internal
services and apparently nobody else.

## Two topics, and why the split matters

`acme.fulfilment.tracking-event.v1` carries raw normalized scans;
`acme.fulfilment.delivery-status.v1` carries the derived fact that a shipment's
status changed. [tracking](srn://acme/product/fulfilment/component/tracking) is the
only participant on both sides — it subscribes to the first and publishes the
second.

The split exists because scans are noisy and statuses are not. A parcel produces
a dozen scans and two status changes; a consumer that only wants to tell a
customer "it's out for delivery" should not have to implement the fold, the
ordering rules, and the de-duplication to find out. Publishing only raw scans
would push that logic into every consumer, and it would be subtly different in
each.

## Ordering and keys

Both topics are keyed by `shipment-id`, so every fact about one parcel lands on
one partition and arrives in publication order. That is *publication* order, not
event order: scans arrive from carriers out of order and duplicated, and the
partition key does nothing about it. Ordering the fold is
[tracking](srn://acme/product/fulfilment/component/tracking)'s job, done on
`occurred-at`, and the requirement that keeps it honest is
[tracking-freshness](srn://acme/product/fulfilment/requirement/tracking-freshness).

Retention is 14 days on the scan topic — long enough to rebuild a fold after a
bad deployment, short enough that the bus is never mistaken for the tracking
history a carrier owns.

## No states.json

Deliberate. The delivery lifecycle already has a state machine, in
[carrier-booking](srn://acme/product/fulfilment/protocol/carrier-booking), and the
same lifecycle described twice would drift. This protocol carries observations
about that machine; it does not have a conversation state of its own.
