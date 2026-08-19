---
name: guest-checkout
kind: requirement
version: 1
title: Checkout without an account
summary: A customer can complete a purchase without creating an account, and can claim the order later.
status: approved
owner: team-shop
requirement-type: functional
priority: should
relations:
  uses:
    - /product/shop/protocol/order-placement
tags:
  - conversion
  - checkout-path
---

# Checkout without an account

A [customer](srn://acme/actor/customer) who has never bought from acme must be
able to complete a purchase with an email address and a payment instrument, and
nothing else. Account creation is offered after payment, never before it, and
declining it costs the customer nothing.

The obligation is commercial rather than technical: the measured drop-off at a
forced registration step is the single largest loss in the funnel. It is a
`should` and not a `must` because the product ships without it under protest —
the workaround, a one-click account created silently from the email address,
exists and is worse.

## Acceptance criteria

- A purchase completes end to end with an email address and a payment
  instrument, with no password ever set.
- A guest order is retrievable for 90 days with the order id and the email
  address used to place it.
- Creating an account with that email address later attaches every guest order
  placed with it, without support involvement.
- The guest path and the account path place the same order shape — one
  [order](srn://acme/product/shop/component/checkout/component/payment/datamodel/order@3), no guest-specific
  variant.
- Declining the post-purchase account offer leaves the order untouched.

## Rationale

The fourth criterion is the load-bearing one. An earlier attempt shipped a
separate "guest order" record, and every downstream consumer — settlement,
support tooling, reporting — grew a branch for it. One shape, two ways in.

## Out of scope

Guest returns and refunds, which need an identity check the email address alone
cannot carry.
