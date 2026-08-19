---
name: delivery-promise-accuracy
kind: requirement
version: 3
title: The date the customer is told is the date that holds
summary: A promised delivery date is taken from the accepted carrier quote, never recomputed, and met often enough to be believed.
status: approved
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
  customer before the date passes, not after. "Will miss" is not a prediction: a
  parcel qualifies when it has recorded no carrier scan for 48 hours, or has
  recorded a failed delivery attempt, or the promised date is tomorrow and the
  parcel has not reached the destination country. Any of the three fires the
  notification; nothing else does.
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

## Why `should`, and how it left review

A `should`, because the product genuinely ships without it: a customer who is
shown a range rather than a date can still buy, and the early markets ran that
way for a year.

It sat in `review` for two versions over the third criterion, which said a parcel
that "will miss its promised date" must be notified about and left the prediction
undefined. That is the shape of a criterion nobody can fail, and the objection was
right: [tracking](srn://acme/product/fulfilment/component/tracking) has no model
that predicts a miss with a defensible false-positive rate, and telling customers
about delays that do not happen costs more than the silence it replaces.

What resolved it was giving up on prediction. The three conditions now named in
the criterion are not forecasts — they are observations, each one a statement
about what has already happened or failed to: no scan for 48 hours, a recorded
failed attempt, or still in the wrong country the day before. Each is checkable
from data
[tracking](srn://acme/product/fulfilment/component/tracking) already holds, each
is false when nothing is wrong, and none requires a model anybody has to defend.

That is a clarification of the criterion rather than a change to it. The
requirement said the same thing at version 1 — tell the customer before the date
passes — and what versions 2 and 3 added is the definition that makes it possible
to say whether it was met. With a rule that can be checked, the criterion can be
agreed to, and the entity is `approved`.

The three conditions are deliberately coarse, and will miss a parcel that is
quietly going to be a day late with scans arriving on schedule. That case is
accepted: the fourth criterion still protects the customer from a promise that
silently slides, and a notification nobody could have justified is worse than a
notification nobody sent.

## Out of scope

The estimate shown *before* purchase, on the product page. That number comes
from a shipping-options feed in [shop](srn://acme/product/shop) and is a
different promise made at a different moment, to a customer who has not paid.
