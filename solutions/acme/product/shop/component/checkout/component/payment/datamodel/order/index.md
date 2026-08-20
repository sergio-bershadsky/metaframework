---
name: order
kind: datamodel
version: 4
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

The order aggregate as the payment component owns it: one order per checkout
attempt, immutable in everything but `status` once authorization succeeds. It
extends [base-record](srn://acme/datamodel/base-record@1) for identity and
creation time and composes the
[auditable](srn://acme/datamodel/auditable@1) mixin, because a support agent
changing an order's status is exactly the event an auditor asks about later.

Amounts are [money](srn://acme/datamodel/money@1) documents; lines are
[order-line](srn://acme/product/shop/datamodel/order-line@1) items. The
payment instrument is the
[payment-method](srn://acme/product/shop/datamodel/payment-method@1) union, stored as the
branch that was actually charged.

`schema.json` names every one of those neighbours by its canonical schema URL —
`https://schemas.metaframework.dev/acme/datamodel/money`, and the same host for
the rest — and identifies itself the same way in `$id`, with `x-srn` beside it
carrying the unversioned SRN. Nothing in the document is a path relative to this
directory, so a resolver handed only the `$id` walks the whole closure without a
clone of the catalog on disk, and a copy of this file pasted into a validator
still says what it is. The one exception is `line-count`, which points at
`#/$defs/positive-int`: a shape private to this document, deliberately not an
entity, because a positive integer has no independent meaning to review.

## Invariants the schema cannot express

- `discount` never exceeds `total`.
- `status` moves only forward: `placed` → `paid` → `refunded`. There is no path
  back, and a correction is a new fact rather than an edit.
- An order is published on [settlement](srn://acme/protocol/settlement) exactly
  once, at the transition into `paid`.

## History

Version 2 added the optional `discount`; version 3 added the `refunded` enum
value and the `auditable` branch. Both are additive — every version 1 instance
still validates, which is the whole test.

Version 4 changed no artifact. The paragraph on references above still described
an older convention — no `$id`, neighbours reached by a relative file path —
that `schema.json` had already stopped using; the description was wrong, not the
model. Nothing about the instances this schema accepts moved, and a referrer
pinned to `@3` is pinned to exactly the shape it reviewed. The number moves
anyway, because a version is a snapshot of the whole directory and this prose is
in the directory.

The version lives in the frontmatter above and nowhere else. `$id` and `x-srn`
carry no version of their own: both are derived from this directory's path and
checked against it, so identity says where the entity is, never which revision
of it you are holding, and there is no second copy to drift.

The schema's `$ref` edges are not repeated under `relations`: the portal derives
the inheritance tree and the reference graph from `schema.json` itself.
