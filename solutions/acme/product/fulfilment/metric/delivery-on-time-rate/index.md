---
name: delivery-on-time-rate
kind: metric
version: 1
title: Delivery on-time rate
summary: Share of parcels delivered on or before the date the customer was promised, over a rolling thirty days in production.
status: review
owner: team-fulfilment
metric-type: ratio
target: "95%"
window: "30d"
direction: higher-is-better
relations:
  measures:
    - /product/fulfilment/requirement/delivery-promise-accuracy
    - /capability/order-fulfilment
  uses:
    - /environment/production
tags:
  - logistics
  - customer-experience
---

# Delivery on-time rate

The number that says whether the date acme told a customer was worth telling
them. It carries two subjects, and it is the same observation for both:
[delivery-promise-accuracy](srn://acme/product/fulfilment/requirement/delivery-promise-accuracy)
is the commitment, its second acceptance criterion is this ratio written as an
obligation, and
[order-fulfilment](srn://acme/capability/order-fulfilment) is the doing the
commitment is about. Splitting it into two entities would give the catalog two
definitions of one number and, within a quarter, two values.

## Definition

Unit of observation is the **parcel**, not the order, because the requirement
promises one date per parcel and an order split across three parcels is three
promises. Denominator: shipments whose `promised-delivery-at` falls inside the
window, excluding shipments in the `returned` or `failed` states, and excluding
shipments that carry no promised date at all — a carrier that publishes no date
produces a range shown to the customer and nothing this metric can score.
Numerator: those whose first `delivered` scan on
[tracking-events](srn://acme/product/fulfilment/protocol/tracking-events) has a
timestamp on or before that date.

Both sides are compared as **dates in the destination's local timezone**, which
is the timezone the promise was displayed in. Comparing instants in UTC would
mark a parcel handed over at nine in the evening in Lisbon as a day late, and
the customer who signed for it would disagree.

Target and window are taken verbatim from the requirement's own criterion rather
than chosen here. Where the two ever disagree, the requirement is right and this
page is stale.

## Rationale

The measurement is anchored on the promise, not on an estimate. The requirement
forbids `promised-delivery-at` from ever being rewritten, which is what makes
this ratio computable at all: a metric measured against a date that moves is a
metric that can be met by moving the date, and every reading of it would be
true and worthless.

## Known distortions

- **Promising later delivers nothing faster.** The most effective way to raise
  this number is to quote longer, and nothing here can tell the difference.
  Read it beside the median gap between promise and delivery; a rate that rises
  while the gap widens is a reporting achievement.
- **Excluding `failed` flatters the wrong carrier.** A carrier that loses
  parcels scores better here than one that delivers them two days late, because
  the lost ones leave the denominator.
  [carrier-failover](srn://acme/product/fulfilment/requirement/carrier-failover)
  is where that behaviour is actually judged.
- The thirty-day window smooths a single bad week into a shrug. It is the
  requirement's window, so it stays, but an incident is visible in this number
  for a month after it ends and invisible for a week while it happens.
