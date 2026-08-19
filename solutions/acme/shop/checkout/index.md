---
name: checkout
kind: component
version: 7
title: Checkout
summary: Converts a cart into a paid order — pricing, tax, stock reservation, and payment orchestration.
status: approved
owner: team-checkout
component-type: service
relations:
  uses:
    - /environment/production
    - /environment/staging
    - /datamodel/money@1
    - protocol/tax-quoting
  exposes:
    - ../protocol/order-placement
    - datamodel/cart@1
  depends-on:
    - ../inventory
    - /billing/ledger
  implements:
    - requirement/idem-cap
    - requirement/p99-checkout-latency
    - /requirement/gdpr-erasure
tags:
  - checkout
  - payments
x-runtime: kotlin-jvm
---

# Checkout

Owns the cart-to-order transition, and nothing else. It reserves stock through
[inventory](srn://acme/shop/inventory), quotes tax in its own process through
[tax-engine](srn://acme/shop/checkout/tax-engine), takes payment through its
[payment](srn://acme/shop/checkout/payment) sub-component, and publishes the
resulting fact. It is the only component in this product that a browser reaches.

## Edges, and why there are two kinds of them

The `uses` list mixes three target kinds on purpose, and the portal partitions
them by resolved kind rather than by a field:
[production](srn://acme/environment/production) and
[staging](srn://acme/environment/staging) are environments, so they read as
"this component runs here"; [money](srn://acme/datamodel/money@1) and
[tax-quoting](srn://acme/shop/checkout/protocol/tax-quoting) are contracts it
consumes.

`depends-on` says something coarser and structural: checkout requires
[inventory](srn://acme/shop/inventory) and
[ledger](srn://acme/billing/ledger) to exist and function. The ledger dependency
crosses the product boundary — the component stays in billing's subtree, owned
by `team-billing`, and is reused by reference, never copied here. What checkout
actually speaks of billing is the
[settlement](srn://acme/protocol/settlement) bus, and that edge belongs to the
payment sub-component that publishes on it.

## Sub-components

- [payment](srn://acme/shop/checkout/payment) — acquirer orchestration, and the
  external processor beneath it.
- [tax-engine](srn://acme/shop/checkout/tax-engine) — a library with no runtime
  of its own, running inside this process.

Nesting is composition: both are *part of* checkout. Neither is a dependency
statement, and neither is reusable elsewhere except by reference.

## Obligations

Checkout claims three: [idem-cap](srn://acme/shop/checkout/requirement/idem-cap),
[p99-checkout-latency](srn://acme/shop/checkout/requirement/p99-checkout-latency),
and the solution-wide
[gdpr-erasure](srn://acme/requirement/gdpr-erasure). The last of those is owned
at solution level because no single component can discharge it; checkout's share
is the contact and address data it holds.
