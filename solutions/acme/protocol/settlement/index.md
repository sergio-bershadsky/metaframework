---
name: settlement
kind: protocol
version: 3
title: Settlement
summary: Event bus carrying paid orders from shop into billing, and ledger postings onward to reconciliation.
status: approved
owner: team-billing
style: bus
participants:
  - alias: payment
    ref: /product/shop/component/checkout/component/payment
    role: publisher
  - alias: ledger
    ref: /product/billing/component/ledger
    role: consumer
  - alias: reconciliation
    ref: /product/billing/component/reconciliation
    role: consumer
conforms-to:
  - standard: CloudEvents
    version: "1.0.2"
    url: https://cloudevents.io/
relations:
  uses:
    - /environment/production
tags:
  - settlement
  - asynchronous
---

The only surface on which [shop](srn://acme/product/shop) and
[billing](srn://acme/product/billing) meet. Shop publishes the fact that an order was
paid; billing decides what that means in accounting terms. Neither side calls
the other, and neither knows how many consumers there are — which is what makes
this a `bus` and not a request-response protocol.

Placement follows from the participant list rather than from taste: the
component participants are
[payment](srn://acme/product/shop/component/checkout/component/payment) under the shop product and
[ledger](srn://acme/product/billing/component/ledger) and
[reconciliation](srn://acme/product/billing/component/reconciliation) under billing, so their
nearest common ancestor is the solution root, and the entity sits at
`solutions/acme/protocol/settlement/`. Move a participant and the correct
placement moves with it.

## Why a bus and not a call

Ledger postings must not be able to fail an order that the customer has already
paid for. An event breaks that coupling: the payment component's obligation ends
when the fact is durably published, and billing catches up at its own pace. The
price is eventual consistency — a paid order is visible in the shop before it is
visible in the ledger, and the
[audit-trail](srn://acme/product/billing/requirement/audit-trail) requirement states how
long that window may be.

## Ordering and keys

Both topics are keyed by `order-id`, so all facts about one order land on one
partition and arrive in publication order. Across orders there is no ordering
guarantee and none is needed. Retention is 30 days on the order topic — long
enough to replay a reconciliation run, short enough that the bus is not mistaken
for the ledger.

The message-to-datamodel matrix on this page is derived from `transport.yaml`
and `workflows/`; the payload models are deliberately absent from `relations`,
which carries only the non-payload dependency on
[production](srn://acme/environment/production).
