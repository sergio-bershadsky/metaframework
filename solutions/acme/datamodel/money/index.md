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
promotion rule prescribes. It is now referenced by twelve datamodels in four
products — every one of
[shop](srn://acme/product/shop)'s priced shapes, from
[order-line](srn://acme/product/shop/datamodel/order-line@1) through
[cart](srn://acme/product/shop/component/checkout/datamodel/cart@1) to
[order](srn://acme/product/shop/component/checkout/component/payment/datamodel/order@3);
[billing](srn://acme/product/billing)'s
[ledger-entry](srn://acme/product/billing/datamodel/ledger-entry@1);
[fulfilment](srn://acme/product/fulfilment)'s carrier quote and shipment; and all
four of [growth](srn://acme/product/growth)'s discount shapes. One definition,
one place to change the currency set.

The count is stated and the list is not, deliberately. Those references are not
repeated under `relations` either: the portal derives the schema `$ref` edges
from `schema.json` itself, so an enumeration written out here would be a second
copy of a fact the catalog already holds — and a hand-written list beside a
number is how a page ends up disagreeing with itself. `grep -rl
"acme/datamodel/money" solutions/acme --include=schema.json` is the answer that
cannot go stale.

## Invariants the schema cannot state

- `amount` is exact: no rounding is applied on the wire, and any rounding a
  component performs is its own documented behaviour.
- Both operands of any comparison carry the same `currency`. Cross-currency
  arithmetic is not defined here and is refused by
  [0001-single-currency](srn://acme/adr/0001-single-currency).
