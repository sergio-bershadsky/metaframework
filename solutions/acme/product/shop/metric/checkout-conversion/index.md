---
name: checkout-conversion
kind: metric
version: 1
title: Checkout conversion
summary: Share of checkout attempts that end in a placed order, measured over a rolling seven days in production.
status: draft
owner: team-shop
metric-type: ratio
target: "68%"
window: "7d"
direction: higher-is-better
relations:
  measures:
    - /capability/order-fulfilment
  uses:
    - /environment/production
tags:
  - commerce
  - checkout-path
---

# Checkout conversion

Of the customers who got as far as submitting a basket, how many ended up with
an order. It is the front door of
[order-fulfilment](srn://acme/capability/order-fulfilment): a basket that dies
here is a fulfilment that never started, and no amount of on-time delivery
downstream compensates for it.

## Definition

Denominator: checkout attempts in production in which the customer submitted the
cart at least once — one `submit-order` exchange opened on
[order-placement](srn://acme/product/shop/protocol/order-placement), regardless
of how it ended. Numerator: attempts that produced an
[order-placed](srn://acme/product/shop/datamodel/order-placed@1) fact.

An attempt is counted once, keyed by the idempotency key
[idem-cap](srn://acme/product/shop/component/checkout/requirement/idem-cap)
already requires, so a customer retrying a declined card is one attempt and not
three. Sessions the edge classifier marks as bots are excluded from both sides.
Attempts abandoned before submission are excluded too — not because they do not
matter, but because they are a question about the storefront rather than about
whether acme could take the order, and mixing the two produces a number nobody
can act on.

## Rationale

This metric points at a capability rather than at
[checkout](srn://acme/product/shop/component/checkout), and the choice is
deliberate. Most of what moves it is not checkout's code: a stock reservation
that could not be granted, a payment declined by the acquirer, a promotion quote
that arrived too late to be applied. The number is a statement about whether the
business can convert an intent to buy into something to fulfil, and the
component that happens to be holding the customer when it fails is the wrong
subject for it.

It is filed in [shop](srn://acme/product/shop)'s bucket, not at solution level,
because `team-shop` is who answers for it. Placement says whose number it is;
`measures` says what it is about. The same capability is measured from the other
end by
[delivery-on-time-rate](srn://acme/product/fulfilment/metric/delivery-on-time-rate),
filed under a different product and owned by a different team — one capability,
two numbers, two accountable owners, and no argument about where either lives.

## Known distortions

- Removing an inconvenient payment method raises this number by removing the
  customers who were going to use it. Read next to order volume, never alone.
- A stock-out counts as a failed conversion even though checkout behaved
  correctly. That is intended — the customer left without goods either way — but
  it means a bad week in the warehouse looks like a bad week in checkout.
- The seven-day window is short enough to see a deploy and long enough to
  survive a weekend. It is not long enough to compare against a promotional
  period, and a comparison across one is meaningless.
