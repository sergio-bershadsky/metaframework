---
name: customer
kind: actor
version: 2
title: Customer
summary: End user who browses the shop, places orders, and tracks their fulfilment.
status: approved
owner: team-commerce
actor-type: human
goals:
  - Pay for a basket without re-entering card details.
  - See an order's status without contacting support.
  - Get money back for a returned item within one working day.
relations:
  uses:
    - /shop/checkout
tags:
  - commerce
  - external-facing
---

# Customer

A customer is any person holding a shop account, authenticated or in a guest
session. The role says nothing about tenure or spend — segmentation is a concern
of the analytics stack, not of this description, and a description that tried to
carry it would be wrong within a quarter.

## Boundaries

- The customer is never a component. We describe the surfaces they touch —
  [checkout](srn://acme/shop/checkout) — never their behaviour.
- A person may hold several roles at once. The same human acting on behalf of
  the merchant is the [merchant-operator](srn://acme/actor/merchant-operator)
  actor, and the two must not be merged just because one body performs both.
- Guest sessions are in scope: the
  [guest-checkout](srn://acme/shop/requirement/guest-checkout) requirement exists
  precisely because "customer" does not imply "account holder".

## Participation

The customer is the initiating participant of
[order-placement](srn://acme/shop/protocol/order-placement) and the `from` of the
`submit-order` step in its `place-order` workflow. Participation is declared on
the protocol side only; this page carries no edge for it, and the portal derives
the lane it gets in every sequence diagram.
