---
name: delivery-orchestrator
kind: component
version: 4
title: Delivery orchestrator
summary: Decides what ships in which parcel, by which carrier, and owns the shipment aggregate end to end.
status: approved
owner: team-fulfilment
component-type: service
relations:
  uses:
    - /environment/production
    - /environment/staging
    - /datamodel/money@1
    - /product/shop/datamodel/order-placed@1
    - /product/fulfilment/datamodel/carrier-quote@1
    - /product/fulfilment/protocol/tracking-events
  exposes:
    - /product/fulfilment/protocol/carrier-booking
    - /product/fulfilment/datamodel/shipment@3
  depends-on:
    - /product/fulfilment/component/carrier-gateway
    - /product/fulfilment/component/tracking
  implements:
    - /product/fulfilment/requirement/carrier-failover
    - /product/fulfilment/requirement/delivery-promise-accuracy
    - /requirement/gdpr-erasure
tags:
  - logistics
  - decisions
x-runtime: kotlin-jvm
---

# Delivery orchestrator

The only component in this product that decides anything. It consumes
[order-placed](srn://acme/product/shop/datamodel/order-placed@1), splits the order
into one or more parcels, chooses a carrier and a service level for each, and
owns the resulting
[shipment](srn://acme/product/fulfilment/datamodel/shipment@3) records for the
rest of their lives.

Everything else here is mechanism: the gateway translates, tracking aggregates.
Concentrating judgement in one component is deliberate — when a delivery goes
wrong the question is always "why was that choice made", and there is exactly
one place to look.

## Why it initiates rather than exposes

It is the `initiator` of
[carrier-booking](srn://acme/product/fulfilment/protocol/carrier-booking) and yet
carries `exposes` for it, which looks contradictory and is not: `exposes` and
`uses` state which side *provides a surface*, and the orchestrator provides one
— the internal booking API that support tooling and the retry scheduler drive.
The conversation it starts toward
[carrier-gateway](srn://acme/product/fulfilment/component/carrier-gateway) is the
same protocol seen from the other end, and the protocol's participant list is
what records that both ends are in it.

On [tracking-events](srn://acme/product/fulfilment/protocol/tracking-events) it is
purely a consumer, so that edge is `uses`. It never publishes on the bus: a
component that both decided a shipment's fate and announced what happened to it
could not be contradicted by reality.

## The order-placed dependency, and its shape

The `uses` edge toward shop's
[order-placed](srn://acme/product/shop/datamodel/order-placed@1) is a datamodel
edge, not a component one, and that distinction is the whole coupling story.
Fulfilment depends on a published *fact shape*, not on shop being reachable. If
[checkout](srn://acme/product/shop/component/checkout) is down, orders already
published still ship; if the fact's optional fields change, nothing here breaks,
because a reader tolerates unknown properties.

What it does not get from the fact is a delivery address — that arrives with the
order's own address capture and lands here as a
[delivery-address](srn://acme/product/fulfilment/datamodel/delivery-address@1).
That is also why this component claims
[gdpr-erasure](srn://acme/requirement/gdpr-erasure): it is the store of record for
the addresses, and erasure blanks them here.

## Splitting, and why it is not the warehouse's job

A five-item order held in two warehouses is two parcels, and the split is decided
here rather than by the warehouse systems, because the split determines the
customer promise and the customer promise is acme's to make. The warehouse
knows where stock is; only this component knows that telling a customer "two
deliveries, Tuesday and Thursday" is better than "one delivery, Thursday", and
that judgement changes with the season and never with the stock location.

Because the judgement is made here, the record of it is written here: this
component stamps `parcel-index` and `parcel-count` at the moment it splits, when
the count is known and final, and never rewrites either afterwards. No other
component is in a position to — by the time a parcel reaches
[carrier-gateway](srn://acme/product/fulfilment/component/carrier-gateway) the
sibling parcels are separate bookings with no remaining relationship, and
tracking sees scans, not intent. The pin on
[shipment](srn://acme/product/fulfilment/datamodel/shipment@3) moves to `@3` for
that reason: the fields this component is the sole writer of arrived in that
revision, and a page that claims to own the aggregate should name the revision it
actually writes.

`signed-for-by` is the exception that proves the ownership rule. It is written
here too, from a carrier callback rather than from any decision, and it is the
one field on the aggregate this component copies without understanding — an
opaque name from a third party, blanked on erasure alongside the address, and
never read back by anything this component does.

## Choosing between quotes

The `uses` edge toward
[carrier-quote](srn://acme/product/fulfilment/datamodel/carrier-quote@1) was
missing from this page for as long as the selection rule was "cheapest", because
a rule that simple reads like an implementation detail. It is not, and the edge
is here now because the rule is a decision this component makes on the customer's
behalf.

What it actually selects is the cheapest quote whose promised date is not later
than the date the storefront was prepared to show — not the cheapest quote. Those
differ often enough to matter: a carrier two pounds cheaper and a day slower is
the wrong answer for an order placed on a Thursday before a holiday and the right
one on a Monday, and only this component knows which Thursday it is.

Ties break toward the carrier with the better recent delivery record rather than
the better contracted rate, which is a deliberate inversion. The contracted rate
is what acme negotiated; the recent record is what the customer will experience,
and
[delivery-promise-accuracy](srn://acme/product/fulfilment/requirement/delivery-promise-accuracy)
is measured on the second.

Once a quote is accepted its `promised-delivery-at` is copied onto the shipment
and the quote is not consulted again. Everything after that point is a fact about
what was agreed, not an input to a decision, which is why the edge is `uses` on a
datamodel and not a `depends-on` toward whatever produced it.

## Failure posture

A booking failure is never propagated toward
[shop](srn://acme/product/shop). The order is paid; refusing it after the fact is
not available. The orchestrator retries per
[carrier-failover](srn://acme/product/fulfilment/requirement/carrier-failover), and
what a persistent failure produces is a support task and a
[problem](srn://acme/datamodel/problem@1) document — never a reversal of something
the customer has already been told is done.
