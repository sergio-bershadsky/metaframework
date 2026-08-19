---
name: ledger-entry
kind: datamodel
version: 1
title: Ledger entry
summary: One leg of a double-entry posting — an amount, a direction, an account, and the order that caused it.
status: approved
owner: team-billing
usage: both
abstract: false
tags:
  - finance
  - aggregate
---

# Ledger entry

A single leg. Legs come in balanced sets that sum to zero, posted in one
transaction, per
[0001-double-entry](srn://acme/billing/adr/0001-double-entry). The schema
describes one leg because that is what is stored and what is published; the
balance invariant spans a set of them and lives in
[ledger](srn://acme/billing/ledger), where it can be enforced.

## Composition

Extends [base-record](srn://acme/datamodel/base-record@1) for identity and
creation time and composes [auditable](srn://acme/datamodel/auditable@1), because
a manual correction to the books is the archetypal audited event. `amount` is a
[money](srn://acme/datamodel/money@1) document like every other amount in the
solution.

`usage: both`: entries are stored for seven years *and* published on the
[settlement](srn://acme/protocol/settlement) bus for
[reconciliation](srn://acme/billing/reconciliation) to consume. Declaring
`storage` alone would have been the easy answer and would have been wrong the
moment the topic was added.

## Direction, not sign

`direction` is an enum rather than a signed amount. A negative money amount is
representable and is always a mistake in this domain: sign conventions differ
between accounts, and every reader that guesses one has a fifty per cent chance
of reporting the opposite of the truth. An explicit `debit` or `credit` cannot be
misread.

## Traceability

`order-id` is required. It is the field that makes
[audit-trail](srn://acme/billing/requirement/audit-trail) satisfiable: from any
leg, an auditor reaches the payment fact, and from that fact the order in
[shop](srn://acme/shop).
