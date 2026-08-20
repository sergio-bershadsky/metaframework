---
name: tracking
kind: component
version: 3
title: Tracking
summary: Folds carrier scans into a delivery status a customer can be shown, and answers "where is it" without a carrier call.
status: approved
owner: team-fulfilment
component-type: service
lifecycle: released
relations:
  uses:
    - /environment/production
    - /environment/staging
    - /product/fulfilment/protocol/tracking-events
  exposes:
    - /product/fulfilment/protocol/tracking-events
    - /product/fulfilment/datamodel/tracking-event@1
  implements:
    - /product/fulfilment/requirement/tracking-freshness
    - /product/fulfilment/requirement/delivery-promise-accuracy
  realizes:
    - /capability/order-fulfilment
tags:
  - logistics
  - read-model
x-runtime: kotlin-jvm
---

The read side of the product. It consumes normalized
[tracking-event](srn://acme/product/fulfilment/datamodel/tracking-event@1) scans,
folds them into a per-shipment status, and publishes the *derived* fact — that a
delivery moved from one state to another — for anyone who cares about outcomes
rather than about scans.

## The only participant on both sides of the bus

It carries `uses` and `exposes` for the same protocol,
[tracking-events](srn://acme/product/fulfilment/protocol/tracking-events), and
that is the honest description rather than a mistake: it subscribes to the raw
scan topic and publishes to the derived-status topic. Two topics, one bus, one
component in both roles.

Splitting it into a consumer service and a publisher service was considered and
rejected. The fold is the whole of the logic; two components would exchange the
intermediate state over another protocol, and the catalog would gain a hop that
describes an implementation detail nobody outside the team would ever read.

## Why the fold is not a projection of the last scan

Scans arrive out of order, duplicated, and occasionally retracted. A status that
was "whatever the newest scan said" flaps: a van reconnects, six hours of scans
land at once, and a customer watching the page sees a parcel travel backwards.
The fold is therefore monotonic over acme's own status ordering — a shipment
never leaves `delivered` — with two named exceptions, `returned` and `lost`,
which are the only regressions a carrier is allowed to assert.

`occurred-at` orders the fold; `recorded-at` never does. That is the practical
consequence of the two-timestamp rule in
[tracking-event](srn://acme/product/fulfilment/datamodel/tracking-event@1), and
getting it backwards is exactly how the flapping bug appeared the first time.

## Freshness, and what it can actually promise

[tracking-freshness](srn://acme/product/fulfilment/requirement/tracking-freshness)
is claimed here and in
[carrier-gateway](srn://acme/product/fulfilment/component/carrier-gateway), and
neither alone can discharge it: the gateway owns the ingest hop, this component
owns the fold and the read path. Neither owns the carrier's own delay between a
courier's scan and the webhook, which is why the requirement is written against
`recorded-at` and not against `occurred-at`.

## No carrier calls on the read path

A customer asking "where is my parcel" is answered from the fold, never by
calling a carrier. Polling carriers on demand is how a support spike becomes a
rate-limit ban, and a ban is an outage of every booking as well as every lookup.
The cost is that acme's answer is as stale as the last scan it received, and
saying so plainly — with the scan time attached — is better than a fresh-looking
answer that is equally stale underneath.
