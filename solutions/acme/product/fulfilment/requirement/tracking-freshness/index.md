---
name: tracking-freshness
kind: requirement
version: 1
title: A scan is visible to the customer within 90 seconds
summary: The delay acme adds between receiving a carrier scan and showing it is bounded, and measured separately from the carrier's.
status: approved
owner: team-fulfilment
requirement-type: non-functional
priority: must
relations:
  uses:
    - /environment/production
    - /product/fulfilment/protocol/tracking-events
tags:
  - performance
  - logistics
---

# A scan is visible to the customer within 90 seconds

From the moment a carrier scan reaches acme's ingress to the moment the same fact
is readable on the customer's order page, at most 90 seconds at p95 in
[production](srn://acme/environment/production).

## Why the clock starts at `recorded-at`

Because that is the only half acme can fix. A carrier's delay between a courier's
scan and its webhook varies from four seconds to six hours, depends on van
connectivity, and is not negotiable at any price acme is willing to pay. A
requirement measured on `occurred-at` would be a promise about someone else's
network, and it would be missed for reasons no engineer here could act on.

Stating the boundary explicitly is the point of the two timestamps in
[tracking-event](srn://acme/product/fulfilment/datamodel/tracking-event@1). It also
prevents the tempting fudge — quietly measuring `recorded-at` while claiming
`occurred-at` — which produces a green dashboard and an angry customer.

## Acceptance criteria

- p95 of `read-visible-at` minus `recorded-at` is at most 90 seconds, over any
  rolling one-hour window.
- p99 of the same measure is at most 5 minutes.
- The measurement is taken at the storefront's read API, including the fold and
  any cache in front of it — not at the Kafka consumer's commit.
- The gap between `occurred-at` and `recorded-at` is reported alongside it,
  per carrier, and is explicitly excluded from the objective.
- The customer-visible timestamp is always `occurred-at`, never `recorded-at`,
  whatever this requirement is measured on.
- A consumer lag replay after an outage does not violate the objective for
  events received after the backlog is drained.

## Rationale

The fifth criterion looks like a display detail and is the reason the whole
requirement exists in a reviewable form. Showing the customer the time acme
learned something, rather than the time it happened, makes every parcel look like
it moved on a schedule set by acme's infrastructure — and during a backlog it
makes a dozen scans appear to happen in the same second.

The last criterion is the honest exclusion. After a six-hour consumer outage, the
first minutes of catch-up will breach any freshness target; measuring them would
either fail the objective permanently or force a team to hide the backlog.

## Shared with the gateway

[carrier-gateway](srn://acme/product/fulfilment/component/carrier-gateway) owns the
ingest hop and [tracking](srn://acme/product/fulfilment/component/tracking) owns the
fold and the read path. Both claim this requirement, and the 90-second budget is
split between them in the components' own runbooks rather than here — a
requirement states the obligation, not the allocation.
