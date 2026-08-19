---
name: money
kind: datamodel
version: 1
title: Money
summary: A monetary amount and its currency — the only way an amount is expressed anywhere in acme.
status: approved
owner: team-platform
usage: both
abstract: false
tags:
  - foundation
  - vocabulary
---

# Money

Every amount in this solution is a `money` document: a decimal **string** and an
ISO 4217 currency code. Never a float, never a bare integer of minor units
without the currency next to it.

The string is not stylistic. Binary floating point cannot represent `0.10`, and
half of the arithmetic in a checkout is addition of exactly such numbers; the
string keeps the value exact end to end and forces every consumer to parse it
with a decimal type instead of silently accepting a double. Minor units alone
were rejected because they are meaningless without the currency — `1000` is ten
euros or a thousand yen, and the bug that follows is discovered by a customer.

## Where it appears

Promoted out of `$defs` the moment a second entity needed it, exactly as the
promotion rule prescribes. It is now referenced by
[order-line](srn://acme/product/shop/datamodel/order-line@1),
[order-confirmation](srn://acme/product/shop/datamodel/order-confirmation@1),
[cart](srn://acme/product/shop/component/checkout/datamodel/cart@1),
[order](srn://acme/product/shop/component/checkout/component/payment/datamodel/order@3), and
[ledger-entry](srn://acme/product/billing/datamodel/ledger-entry@1) — five entities, one
definition, one place to change the currency set.

Those references are not repeated under `relations`: the portal derives the
schema `$ref` edges from `schema.json` itself, and authoring them twice is the
kind of double bookkeeping that drifts within a sprint.

## Invariants the schema cannot state

- `amount` is exact: no rounding is applied on the wire, and any rounding a
  component performs is its own documented behaviour.
- Both operands of any comparison carry the same `currency`. Cross-currency
  arithmetic is not defined here and is refused by
  [0001-single-currency](srn://acme/adr/0001-single-currency).
