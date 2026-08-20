---
name: support-agent
kind: actor
version: 1
title: Support agent
summary: Staff member who investigates order and payment contacts on a customer's behalf.
status: approved
owner: team-commerce
actor-type: human
goals:
  - Find out what happened to one order without asking an engineer.
  - Issue a refund for a settled order and see it reflected in the ledger.
  - Tell a customer, truthfully, when their money will be back.
tags:
  - internal
  - support
---

A member of the customer support team, acting on a customer's behalf and with
their consent. The agent sees order and settlement state; they do not see raw
card data, which never leaves the acquirer's tokenized form (see
[payment](srn://acme/product/shop/component/checkout/component/payment)).

## Why this is an actor and not a component

The support console is somebody else's product and is not described in this
solution. What matters here is that a named counterpart initiates refunds and
reads settlement state, so that the
[audit-trail](srn://acme/product/billing/requirement/audit-trail) requirement has a
subject and the ledger's read surface has a stated consumer.

## Boundaries

The agent is a distinct role from [customer](srn://acme/actor/customer) even
when the same person holds both accounts, and a distinct role from
[merchant-operator](srn://acme/actor/merchant-operator), who curates the catalog
and never sees payment data. Splitting the retired `shop-admin` role into these
three is what made the access policy expressible at all.
