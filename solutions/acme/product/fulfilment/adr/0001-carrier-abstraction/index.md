---
name: 0001-carrier-abstraction
kind: adr
version: 1
title: One gateway in front of every carrier, not one adapter per carrier
summary: Carrier differences are absorbed by a single gateway component with a normalized contract, not by per-carrier code in the orchestrator.
status: approved
owner: team-fulfilment
decision-status: accepted
date: "2026-05-14"
deciders:
  - team-fulfilment
  - team-platform
  - sergio
relations:
  uses:
    - /product/fulfilment/protocol/carrier-booking
    - /product/fulfilment/datamodel/carrier-quote@1
tags:
  - logistics
  - boundaries
---

# One gateway in front of every carrier, not one adapter per carrier

## Context

Acme ships through four carriers today and the commercial team expects six by
next year, including a regional one in the Nordics that exists for one market.
No two of them agree on anything: one prices in grams and one in volumetric
kilos, one returns a label as a base64 PDF and one as a URL that expires in
fifteen minutes, one treats a repeated booking request as idempotent and one
cheerfully produces a second parcel.

The first implementation put a carrier adapter behind an interface inside the
[delivery-orchestrator](srn://acme/product/fulfilment/component/delivery-orchestrator).
Within two quarters the interface had grown a `Map<String, Object>` of
carrier-specific options, three of its methods were implemented by exactly one
adapter, and adding the fourth carrier required touching the component that also
decides what a customer is promised.

The forcing question was a specific incident: a carrier changed a status code's
meaning, the mapping lived in an adapter, and the orchestrator's own retry logic
branched on that status. A vocabulary change at a third party reached a component
that makes customer promises, and nobody reviewing the change could have known.

## Decision

Every carrier is reached through one
[carrier-gateway](srn://acme/product/fulfilment/component/carrier-gateway)
component, typed `gateway`, which owns credentials, per-carrier request shaping,
the status-code mapping, the retry across carriers, and the idempotency ledger.
It offers upward exactly one normalized contract —
[carrier-booking](srn://acme/product/fulfilment/protocol/carrier-booking) and
[carrier-quote](srn://acme/product/fulfilment/datamodel/carrier-quote@1) — in which
no carrier's vocabulary appears.

The catalog models the carriers as a *single* `external` component,
[parcel-carrier](srn://acme/product/fulfilment/component/carrier-gateway/component/parcel-carrier),
nested beneath the gateway. Which carriers acme has contracts with is
configuration, not ontology.

No other component may hold a carrier credential or parse a carrier response.

## Consequences

- The orchestrator's carrier knowledge collapses to a preference list of opaque
  names. It cannot branch on carrier-specific behaviour even when a developer
  would find it convenient, which is the point.
- Adding a carrier is a gateway change and a configuration entry. It touches no
  entity in this catalog, and no review of a customer promise.
- The gateway becomes a single point of failure for all booking. Accepted, and
  mitigated by it holding no domain state: it can be redeployed or rebuilt from
  configuration without losing anything about a shipment.
- Normalization loses information. A carrier's richer status vocabulary is
  flattened into acme's seven values, and something is discarded at the boundary
  every day. `carrier-status-code` on
  [tracking-event](srn://acme/product/fulfilment/datamodel/tracking-event@1) keeps
  the raw value beside the mapped one precisely because that loss is real and
  needs to stay diagnosable.
- The idempotency ledger is now load-bearing and is the gateway's only state.
  Losing it does not lose a shipment, but it does re-open the double-booking risk
  that [carrier-failover](srn://acme/product/fulfilment/requirement/carrier-failover)
  exists to close, so it is backed up on the same schedule as the shipment store.

## Alternatives considered

- **Per-carrier adapters behind an interface in the orchestrator.** The status
  quo being replaced. It works until the interface has to be the union of every
  carrier's capabilities, at which point it stops being an abstraction and
  becomes a switch statement with extra steps.
- **One `external` component per named carrier in the catalog.** Rejected: it
  makes the catalog a mirror of the procurement department, each entity's
  description identical but for a name, and every contract renewal a
  documentation task nobody does.
- **A third-party multi-carrier aggregator.** Genuinely attractive — it is this
  decision, bought rather than built. Rejected for two reasons that may not hold
  forever: the aggregators acme evaluated add 200-400 ms to every booking and
  none would commit to the idempotency guarantee that
  [carrier-failover](srn://acme/product/fulfilment/requirement/carrier-failover)
  requires. If either changes, this decision is worth revisiting, and the shape
  of the change is small: the gateway keeps its contract and swaps its insides.
- **Let each warehouse book with its own local carrier.** Rejected: it moves the
  problem outside the catalog rather than solving it, and the customer promise
  would then be made by whichever partner's system happened to answer.
