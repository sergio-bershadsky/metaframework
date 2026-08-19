---
name: 0002-change-data-capture
kind: adr
version: 2
title: Replace the order event log with change data capture
summary: Order state returns to mutable rows; the ordered change stream comes from the database log instead of the application.
status: approved
owner: team-shop
decision-status: accepted
date: "2026-07-02"
deciders:
  - team-shop
  - team-platform
  - sergio
relations:
  supersedes:
    - ../0001-event-sourcing
  uses:
    - ../../protocol/order-placement
    - ../../datamodel/order-placed@1
tags:
  - persistence
  - orders
---

# Replace the order event log with change data capture

## Context

[0001-event-sourcing](srn://acme/shop/adr/0001-event-sourcing) bought an ordered,
auditable record of order changes at the price of a projection rebuild that grew
without bound and a snapshot mechanism nobody had time to build. Two years on,
the rebuild takes eleven minutes and is on the critical path of every schema
change.

The constraint that forced event sourcing in 2024 — no trustworthy
change-data-capture from the managed database — no longer holds. The platform
now offers a logical replication stream with at-least-once delivery and stable
ordering per key, which is precisely the guarantee the original decision went
looking for in the application layer.

## Decision

We store order state as mutable rows again and derive the ordered change stream
from the database's logical replication log. Checkout writes rows; the capture
process turns each committed change into an
[order-placed](srn://acme/shop/datamodel/order-placed@1) fact on the
[settlement](srn://acme/protocol/settlement) bus. The application no longer
maintains an event log of its own.

## Consequences

- Projection rebuilds disappear. Current state is the row, and a schema change
  is a migration again rather than a replay.
- The audit obligation is now met by log retention plus the
  [auditable](srn://acme/datamodel/auditable@1) mixin rather than by the shape of
  the store; retention configuration becomes a correctness concern, and losing it
  loses the trail silently.
- Delivery is at-least-once, so every consumer of the settlement bus must be
  idempotent on `order-id`. That obligation is written down in
  [idem-cap](srn://acme/shop/checkout/requirement/idem-cap).
- Migration is not free: for one release the two paths run side by side, and the
  reconciliation job compares them.

## Alternatives considered

- **Keep event sourcing and build snapshots.** The honest comparison. Rejected
  because it buys back the rebuild time and nothing else, while keeping the
  modelling tax on every new field.
- **Outbox table written in the same transaction.** Rejected: it is CDC with the
  ordering guarantee reimplemented by hand, and the hand-written half is the part
  that fails at three in the morning.
- **Do nothing.** Rejected: the eleven-minute rebuild is already the reason
  schema changes are batched into quarterly releases, which is a worse problem
  than the one being solved.
