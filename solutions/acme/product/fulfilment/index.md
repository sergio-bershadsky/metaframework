---
name: fulfilment
kind: product
version: 1
title: Fulfilment
summary: Turns a paid order into a parcel in a customer's hands — carrier selection, booking, and tracking.
status: approved
owner: team-fulfilment
lifecycle: active
primary-actors:
  - /actor/customer
  - /actor/courier
  - /actor/support-agent
relations:
  exposes:
    - /product/fulfilment/datamodel/shipment@1
  depends-on:
    - /product/shop
  implements:
    - /product/fulfilment/requirement/carrier-failover
  uses:
    - /datamodel/money@1
    - /product/shop/datamodel/order-placed@1
tags:
  - logistics
  - delivery
x-cost-center: "4713"
---

# Fulfilment

Everything between a paid order and a parcel a customer has signed for. Shop
takes the money and publishes the fact; fulfilment turns that fact into a
physical movement it does not itself perform, using carriers acme does not
operate and cannot control.

That last clause is the whole design problem of this product. Every other
product in the catalog describes systems acme runs; this one spends most of its
description on the boundary with systems it does not. The result is
protocol-heavy on purpose: where a component cannot own behaviour, the only
thing left to write down is the conversation.

## Components

- [delivery-orchestrator](srn://acme/product/fulfilment/component/delivery-orchestrator) —
  decides *what* to ship, in how many parcels, by which carrier and service
  level, and owns the [shipment](srn://acme/product/fulfilment/datamodel/shipment@1)
  aggregate. It is the only component here that makes a decision.
- [carrier-gateway](srn://acme/product/fulfilment/component/carrier-gateway) — one
  normalized surface in front of every carrier API. It makes a decision only
  about *which carrier to try next*, never about what to ship.
- [tracking](srn://acme/product/fulfilment/component/tracking) — the read side:
  it folds a stream of carrier scans into a delivery status a customer can be
  shown, and answers "where is it" without anyone calling a carrier.
- [parcel-carrier](srn://acme/product/fulfilment/component/carrier-gateway/component/parcel-carrier)
  — the third party itself, nested under the gateway because the gateway is the
  only thing that speaks to it.

## Protocols

Two, and they divide by direction rather than by technology.
[carrier-booking](srn://acme/product/fulfilment/protocol/carrier-booking) is the
outbound, synchronous half: acme asks a carrier to take a parcel and waits for
an answer, because there is nothing useful to do until one arrives.
[tracking-events](srn://acme/product/fulfilment/protocol/tracking-events) is the
inbound, asynchronous half: the world reports what happened to the parcel, at
times acme does not choose, and every consumer catches up at its own pace.

A single protocol covering both would have to be `bus` and `request-response`
at once, which the style axis correctly refuses to express.

## Coupling to shop

One inbound edge and no outbound one. Fulfilment consumes
[order-placed](srn://acme/product/shop/datamodel/order-placed@1) and reuses
[order-line](srn://acme/product/shop/datamodel/order-line@1) inside its own
[shipment](srn://acme/product/fulfilment/datamodel/shipment@1) model — a
cross-product reference by SRN, never a copy. Shop does not know this product
exists, and nothing in the checkout path waits for it: an order is placed
whether or not a carrier can be found, and a booking failure is a fulfilment
problem, not a customer-facing checkout error.

The `depends-on` edge toward [shop](srn://acme/product/shop) states the
structural half of that: fulfilment requires shop to exist and to publish. The
reverse edge is deliberately absent, and that asymmetry is the point.

## What is deliberately not here

Warehouse operations — picking, packing, and the robotics that do them — are
out of scope for the whole solution, and stay out here. Fulfilment starts at the
moment a parcel has a weight and a destination, and everything upstream of that
is a system acme's logistics partner runs. Returns are modelled only as far as
the `returned` branch of the delivery lifecycle; the refund that follows one is
[billing](srn://acme/product/billing)'s.
