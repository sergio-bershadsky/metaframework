---
name: delivery-promise-accuracy
kind: requirement
version: 2
title: The date the customer is told is the date that holds
summary: A promised delivery date is taken from the accepted carrier quote, never recomputed, and met often enough to be believed.
status: review
owner: team-fulfilment
requirement-type: non-functional
priority: should
relations:
  uses:
    - /environment/production
    - /product/fulfilment/datamodel/carrier-quote@1
tags:
  - customer-experience
  - logistics
---

# The date the customer is told is the date that holds

A customer is told one delivery date, once, and it comes from the carrier quote
that was actually accepted. It is stored on the
[shipment](srn://acme/product/fulfilment/datamodel/shipment@1) and never
recalculated afterwards, however much better the estimate would look tomorrow.

## Acceptance criteria

- `promised-delivery-at` is copied verbatim from the accepted
  [carrier-quote](srn://acme/product/fulfilment/datamodel/carrier-quote@1) and is
  never written again for the life of the shipment.
- At least 95% of shipments are delivered on or before their promised date,
  measured over a rolling 30 days in
  [production](srn://acme/environment/production), excluding shipments in the
  `returned` or `failed` states.
- A parcel that will miss its promised date generates a notification to the
  customer before the date passes, not after.
- The promise shown to a customer never moves later. A revised carrier estimate
  is displayed as an exception, alongside the original promise, and does not
  replace it.
- Where a carrier publishes no date, the shipment carries none and the customer
  is shown a range rather than a fabricated day.
- An order split across several parcels carries one promised date per parcel, each
  from that parcel's own accepted quote. The order-level date shown to the
  customer is the latest of them, and each parcel's own date is shown against that
  parcel.

## Rationale

The fourth criterion is the whole requirement. A promise that silently slides is
worse than a pessimistic one: the customer plans around Tuesday, the page says
Thursday on Tuesday morning, and acme has spent trust it cannot buy back with an
accurate estimate. Keeping the original visible costs a support conversation and
keeps the relationship.

The split criterion arrived with `parcel-index` on
[shipment](srn://acme/product/fulfilment/datamodel/shipment@3) and settles an
argument that had been running informally. Showing the *earliest* parcel date at
order level tests better and is a lie by omission: the customer's order is not
complete until the last parcel lands, and a customer who planned around Tuesday
because one of two parcels arrives then has been misled by a true number.

Showing both — a latest date for the order, a real date per parcel — costs a line
of interface and is the only version of this that survives contact with a
customer who counts their boxes. It also keeps the per-parcel promise
individually measurable under the 95% criterion, which an order-level-only
promise would have destroyed: two parcels, one late, is one missed promise, not
half of one.

The second criterion is deliberately not 99%. Carriers miss dates for reasons —
weather, capacity, an address nobody can find — that no acme system influences,
and a target acme cannot move is a target that gets quietly ignored. 95% is the
number the carrier contracts are negotiated against, which makes a breach a
commercial conversation with a counterparty rather than an engineering ticket
with no owner.

## Why `should` and why still in review

A `should`, because the product genuinely ships without it: a customer who is
shown a range rather than a date can still buy, and the early markets ran that
way for a year. It is in `review` because the third criterion has no agreed
trigger — "will miss its promised date" is a prediction, and
[tracking](srn://acme/product/fulfilment/component/tracking) currently has no
model that produces one with a defensible false-positive rate. Until that is
settled, telling customers about delays that do not happen may cost more than
the silence it replaces.

## Out of scope

The estimate shown *before* purchase, on the product page. That number comes
from a shipping-options feed in [shop](srn://acme/product/shop) and is a
different promise made at a different moment, to a customer who has not paid.
