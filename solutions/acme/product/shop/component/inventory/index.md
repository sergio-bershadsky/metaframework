---
name: inventory
kind: component
version: 4
title: Inventory
summary: Stock availability projection and the short-lived reservations that hold it during checkout.
status: approved
owner: team-shop
component-type: service
lifecycle: released
relations:
  uses:
    - /environment/production
    - /environment/staging
  exposes:
    - /product/shop/protocol/order-placement
  realizes:
    - /capability/order-fulfilment
tags:
  - stock
  - checkout-path
---

# Inventory

Answers one question — can this basket be fulfilled right now — and holds the
answer still for 120 seconds while
[checkout](srn://acme/product/shop/component/checkout) takes payment. It is a projection, not a
system of record: the authoritative stock count lives in the warehouse systems
acme's logistics partner operates, and this component describes what the shop
believes about them.

## Reservations

A reservation is a lease, not a lock. It expires without anyone releasing it,
which is what keeps an abandoned checkout from starving the catalog, and it is
released explicitly on the `release-stock` event when an authorization fails.
Both paths appear in the `place-order` workflow of
[order-placement](srn://acme/product/shop/protocol/order-placement).

The retry loop in that workflow — at most three attempts — exists because the
projection is eventually consistent with the warehouse feed. A refusal is often
stale by a few hundred milliseconds, and refusing the customer on the first
answer costs more sales than the retries cost latency.

## Why it exposes rather than uses

Inventory is a responder in
[order-placement](srn://acme/product/shop/protocol/order-placement): checkout calls it,
never the other way round. `exposes` states that direction, and the protocol's
participant list gives it the alias `inventory` that the workflow steps use. The
two are cross-checked by the portal, and a participant with no matching edge
renders as an undirected, dimmed node rather than an invented one.
