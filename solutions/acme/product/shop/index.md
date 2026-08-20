---
name: shop
kind: product
version: 4
title: Shop
summary: Customer-facing storefront, cart, and checkout for the acme retail business.
status: approved
owner: team-shop
lifecycle: active
primary-actors:
  - /actor/customer
  - /actor/support-agent
relations:
  exposes:
    - /product/shop/datamodel/order-placed@1
  depends-on:
    - /product/billing/component/ledger
  implements:
    - /product/shop/requirement/guest-checkout
  uses:
    - /datamodel/money@1
tags:
  - commerce
  - customer-facing
x-cost-center: "4711"
---

Everything a customer touches between browsing and a confirmed order.
Fulfilment and settlement happen elsewhere: shop takes the money, publishes the
fact, and stops there.

## Components

- [checkout](srn://acme/product/shop/component/checkout) — cart to order, tax quoting, payment
  orchestration. The only component a customer's browser talks to.
- [inventory](srn://acme/product/shop/component/inventory) — stock availability and the
  reservation that holds it during a checkout attempt.

Beneath checkout sit two more: [payment](srn://acme/product/shop/component/checkout/component/payment),
which owns the conversation with the card acquirer, and
[tax-engine](srn://acme/product/shop/component/checkout/component/tax-engine), a library that runs inside
checkout's own process. Nesting here is composition, not dependency — payment is
*part of* checkout, whereas checkout's need for
[ledger](srn://acme/product/billing/component/ledger) is an edge that crosses the product
boundary.

## Public surface

The product's own public surface is one datamodel,
[order-placed](srn://acme/product/shop/datamodel/order-placed@1) — the fact other
products may consume. The protocols are exposed by the components that serve
them, so the portal's surface list for this product is the union of both, derived
rather than restated here.

## Ownership and reuse

`team-shop` owns this product and everything under it, including the ADRs and
requirements in its buckets. The dependency on
[ledger](srn://acme/product/billing/component/ledger) is reuse by reference: the component stays in
the billing subtree, owned by `team-billing`, and is never copied here. What
shop actually speaks of it is the [settlement](srn://acme/protocol/settlement)
bus, declared on the payment component that speaks it.

## Lifecycle

`lifecycle: active` and `status: approved` say different things and both are
true: the product is in production and invested in, and this description of it
has been reviewed. They move independently — a retired product may keep an
approved description forever.
