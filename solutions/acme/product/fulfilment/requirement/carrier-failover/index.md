---
name: carrier-failover
kind: requirement
version: 1
title: A paid order always finds a carrier, or a human
summary: A refused or unresponsive carrier is retried against the next one within a bounded budget, and never double-books.
status: approved
owner: team-fulfilment
requirement-type: functional
priority: must
relations:
  uses:
    - /product/fulfilment/protocol/carrier-booking
    - /environment/production
tags:
  - resilience
  - logistics
---

# A paid order always finds a carrier, or a human

Once a customer has paid, there is no acceptable outcome in which a parcel
quietly fails to be booked. Either a carrier takes it, or a person is told that
one did not — within minutes, not on the next morning's exception report.

This is a `must` because the failure it prevents is silent. A booking that
refuses and stops leaves a paid order with no parcel, no notification, and no
error anyone sees until the customer asks where their kettle is. Every other
requirement in this product improves an experience; this one prevents an
invisible loss.

## Acceptance criteria

- A carrier refusal or an 8-second timeout advances the booking to the next
  carrier in the preference list, without operator involvement.
- The retry budget is at most three carriers per shipment; after that the
  shipment reaches `failed` and a support task exists.
- A retried booking never produces two parcels. Re-sending the same shipment id
  returns the original booking, whatever the carrier's own idempotency
  behaviour.
- A booking failure produces no error toward [shop](srn://acme/product/shop) and
  no change to the order's paid status.
- The time from first attempt to either a booking or a support task is at most
  60 seconds at p99, measured in
  [production](srn://acme/environment/production).
- A carrier that has refused three consecutive times is skipped for 10 minutes,
  so its outage does not consume the budget of every subsequent shipment.

## Rationale

The third criterion is the expensive one. Idempotency here is not about a
duplicate database row: a second booking is a second physical parcel, a second
collection, and a second invoice, and no reconciliation catches it before the
customer receives two kettles. That is why the
[carrier-gateway](srn://acme/product/fulfilment/component/carrier-gateway) keeps
its own idempotency ledger rather than trusting a carrier header — carriers are
inconsistent about it, and the failure is unrecoverable rather than merely
annoying.

The last criterion was added after an incident: one carrier's API degraded, every
shipment spent its whole budget waiting on it, and the two healthy carriers were
never reached. A retry policy without a circuit is a way of turning one outage
into a total one.

## Shared, deliberately

Claimed by both
[delivery-orchestrator](srn://acme/product/fulfilment/component/delivery-orchestrator)
and [carrier-gateway](srn://acme/product/fulfilment/component/carrier-gateway), and
neither can discharge it alone: the gateway owns the retry across carriers, the
orchestrator owns what happens when the budget is spent. A requirement claimed by
two components is not a modelling error — it is the normal shape of an obligation
that crosses a boundary.

## Out of scope

Choosing the *best* carrier. This requirement is about never being stuck, not
about cost or speed optimization; ranking is a policy that lives in
configuration and changes with the commercial calendar.
