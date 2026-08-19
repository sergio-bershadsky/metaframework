---
name: order-confirmation
kind: datamodel
version: 1
title: Order confirmation
summary: What checkout returns to the customer once an order is placed and payment is authorized.
status: approved
owner: team-shop
usage: exchange
abstract: false
tags:
  - commerce
  - wire
---

# Order confirmation

The reply to a successful `submit-order`, and the payload a support agent quotes
back at a customer. It is deliberately thin: an identifier, a status, a total,
and a timestamp. Everything else about the order is retrievable from the order
resource, and duplicating it here would make two shapes that disagree the moment
one of them is extended.

## Status values

`placed` and `paid` are separate because they become separate in time. A card
authorization succeeds before capture completes, and the customer is entitled to
a confirmation at the first of those moments. `refunded` deliberately does not
appear here — a refund is a later fact carried by the
[settlement](srn://acme/protocol/settlement) bus, not a value this reply ever
takes.

## Relationship to the order

The confirmation is a projection of
[order](srn://acme/product/shop/component/checkout/component/payment/datamodel/order@3) at one instant. It
does not extend it and shares no base: the two evolve on different clocks, and
coupling a wire reply to a stored aggregate is how a storage migration becomes a
client-visible breaking change.
