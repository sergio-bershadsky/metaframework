---
name: 0001-event-sourcing
kind: adr
version: 3
title: Event-source the order lifecycle
summary: Order state is derived from an append-only event log rather than stored as mutable rows.
status: approved
owner: team-shop
decision-status: superseded
date: "2026-07-02"
deciders:
  - team-shop
  - team-platform
  - sergio
relations:
  uses:
    - ../../datamodel/order-placed@1
tags:
  - persistence
  - orders
---

# Event-source the order lifecycle

## Context

Order state was mutated in place by four components, and reconstructing "what
did this order look like on Tuesday" required log archaeology. Two incidents in
the fourth quarter came down to a lost intermediate state that nobody could
prove had ever existed. Regulatory review requires a five-year audit trail of
price and status changes.

At the time, the managed database in use offered no stable change-data-capture
guarantee, so the only reliable way to get an ordered record of changes was to
make the application write one.

## Decision

We event-source the order lifecycle. Checkout appends immutable events to the
order log; current order state is a projection rebuilt from that log. No
component writes order state by any other path.

## Consequences

- Audit and time-travel queries become trivial; the five-year obligation is
  satisfied by retention alone.
- Every reader must tolerate eventual consistency of projections. The storefront
  gained a "pending" state it did not previously need, and support agents had to
  be taught what it means.
- Rebuild cost grows with log size. A snapshot mechanism will be needed before
  the log passes roughly ten million events, and it was never built.
- The team pays a permanent modelling tax: schema evolution is governed by the
  additive rule at the event level, with no migrations available.

## Alternatives considered

- **Audit columns on mutable rows.** Cheapest to build, but it records that a
  field changed, not why, and it cannot reconstruct intermediate states. Fails
  the regulatory requirement outright.
- **Change-data-capture from the database log.** Rejected in 2024 because the
  managed database offered no stable CDC guarantee. That guarantee arrived in
  2026, which is exactly what superseded this decision — see
  [0002-change-data-capture](srn://acme/shop/adr/0002-change-data-capture).
- **Do nothing and improve logging.** Rejected: it addresses the incidents but
  not the audit obligation.

## Review notes

This record is `status: approved` and `decision-status: superseded`, which is a
normal and useful combination: the document is complete and reviewed, and the
decision it records no longer binds. Its `## Decision` paragraph has not been
edited and never will be — it is a true statement about what was decided in
2024. The `superseded-by` pointer is derived from ADR-0002's `supersedes` edge.
