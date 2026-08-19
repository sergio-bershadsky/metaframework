---
name: order
kind: datamodel
version: 3
title: Order
summary: Customer order aggregate persisted by the payment component and published on settlement.
status: approved
owner: team-payments
usage: both
abstract: false
tags:
  - commerce
  - aggregate
x-jira-epic: SHOP-142
---

# Order

The order aggregate as the payment component owns it: one order per checkout
attempt, immutable in everything but `status` once authorization succeeds. It
extends [base-record](srn://acme/datamodel/base-record@1) for identity and
creation time and composes the
[auditable](srn://acme/datamodel/auditable@1) mixin, because a support agent
changing an order's status is exactly the event an auditor asks about later.

Amounts are [money](srn://acme/datamodel/money@1) documents; lines are
[order-line](srn://acme/product/shop/datamodel/order-line@1) items, which `schema.json`
reaches as `../../../../datamodel/order-line/schema.json` — an ordinary relative
file path, so `json-schema-to-typescript` and `ajv-cli` resolve it unaided. The
payment instrument is the
[payment-method](srn://acme/product/shop/datamodel/payment-method@1) union, stored as the
branch that was actually charged.

## Invariants the schema cannot express

- `discount` never exceeds `total`.
- `status` moves only forward: `placed` → `paid` → `refunded`. There is no path
  back, and a correction is a new fact rather than an edit.
- An order is published on [settlement](srn://acme/protocol/settlement) exactly
  once, at the transition into `paid`.

## History

Version 2 added the optional `discount`; version 3 added the `refunded` enum
value and the `auditable` branch. Both are additive — every version 1 instance
still validates, which is the whole test. The version lives in the frontmatter
above and nowhere else: `schema.json` carries no `$id`, so there is no second
copy to drift.

The schema's `$ref` edges are not repeated under `relations`: the portal derives
the inheritance tree and the reference graph from `schema.json` itself.
