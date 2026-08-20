---
name: billing
kind: product
version: 2
title: Billing
summary: Double-entry ledger and reconciliation for every payment the shop takes.
status: approved
owner: team-billing
lifecycle: active
primary-actors:
  - /actor/support-agent
relations:
  exposes:
    - /product/billing/datamodel/ledger-entry@1
  depends-on:
    - /product/shop/component/checkout/component/payment
  implements:
    - /product/billing/requirement/audit-trail
  uses:
    - /datamodel/money@1
tags:
  - finance
  - internal
---

Everything that happens to money after the customer has authorized it. Billing
does not take payments and never speaks to a customer; it observes what
[shop](srn://acme/product/shop) did and records what it means in accounting terms.

## Components

- [ledger](srn://acme/product/billing/component/ledger) — the double-entry store, and the only
  writer of accounting truth in the solution.
- [reconciliation](srn://acme/product/billing/component/reconciliation) — a nightly job that proves
  the ledger agrees with the acquirer's settlement file. Still `draft`, and
  therefore declaring only [staging](srn://acme/environment/staging).

## Coupling to shop

One edge, in one direction: billing consumes the
[settlement](srn://acme/protocol/settlement) bus. The `depends-on` edge toward
[payment](srn://acme/product/shop/component/checkout/component/payment) is the structural half of that —
billing requires the publisher to exist — while the protocol edge on each
consuming component is what says which contract they actually speak.

Nothing in shop depends on billing being up. That is the entire design intent of
using a bus here, and it is why a ledger outage is a backlog rather than an
outage of the checkout path.

## Why the ledger is not in shop

Ownership. The product line is the ownership line, and the accounting rules,
their auditor, and the seven-year retention obligation belong to `team-billing`.
Reuse of the ledger by [checkout](srn://acme/product/shop/component/checkout) is by reference — a
`depends-on` edge on checkout's own page — never by a copy in shop's subtree.
