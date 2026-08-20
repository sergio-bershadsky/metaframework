---
name: carrier-quote
kind: datamodel
version: 1
title: Carrier quote
summary: One carrier's offer to move one parcel — price, promised date, and the moment the offer expires.
status: approved
owner: team-fulfilment
usage: exchange
abstract: false
tags:
  - logistics
  - pricing
---

What a carrier says it will charge and when it will deliver, for one parcel, at
one moment. Produced by
[carrier-gateway](srn://acme/product/fulfilment/component/carrier-gateway) from a
carrier's rating API and normalized into a shape the
[delivery-orchestrator](srn://acme/product/fulfilment/component/delivery-orchestrator)
can compare across carriers without knowing any of them.

## Why an expiry is required

`quote-expires-at` is not optional, and it is the field that keeps this model
honest. A carrier quote is an offer with a lifetime — fuel surcharges move
weekly, capacity pricing moves hourly in December, and a quote held for an hour
is a number acme made up. Making expiry mandatory forces every consumer to
decide what to do when it has passed, instead of discovering months later that a
cached quote has been silently underbilling the difference.

The expiry is the carrier's, echoed rather than invented. Where a carrier
publishes none, the gateway supplies its own conservative one and says so in the
`quote-reference`; a quote with no expiry at all is not representable.

## Price, and the surcharge list beside it

`price` is a [money](srn://acme/datamodel/money@1) document like every amount in
this solution — decimal string, explicit currency, no floats. `base-rate` plus
every entry of `surcharges` must equal it, and that breakdown exists because the
total alone is unarguable-with: when an invoice differs from the quote by €1.80,
the only useful question is which surcharge moved, and a model carrying one
number cannot answer it.

The sum rule is stated here and enforced nowhere in the schema, because JSON
Schema cannot express arithmetic across sibling arrays. That is a real limit and
naming it is better than pretending the constraint is structural: the check lives
in the gateway, and a quote that fails it is refused before it reaches a decision.

## Currency

A quote's currency is the carrier's billing currency, not the customer's, and it
is therefore not guaranteed to match the order. That is the one place this
product touches the boundary drawn by
[0001-single-currency](srn://acme/adr/0001-single-currency): the ADR forbids
conversion inside the checkout path, and a shipping cost is outside it. The
converted figure that eventually reaches the ledger is
[billing](srn://acme/product/billing)'s problem and is derived from the carrier's
invoice, never from this document.

## Not stored

`usage: exchange`. The winning quote's *outcome* is copied into the
[shipment](srn://acme/product/fulfilment/datamodel/shipment@1) as
`shipping-cost` and `promised-delivery-at`; the losing quotes are discarded once
the booking decision is made. Keeping a quote history would be a pricing-analytics
concern, and the moment anyone wants one it belongs in a warehouse rather than in
the operational path.
