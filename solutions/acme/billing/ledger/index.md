---
name: ledger
kind: component
version: 3
title: Ledger
summary: The double-entry store — the only writer of accounting truth in the solution.
status: approved
owner: team-billing
component-type: service
relations:
  uses:
    - /environment/production
    - /protocol/settlement
    - /datamodel/money@1
  exposes:
    - ../datamodel/ledger-entry@1
    - protocol/refund-request
  implements:
    - ../requirement/audit-trail
    - /requirement/gdpr-erasure
tags:
  - finance
  - datastore
---

# Ledger

Consumes paid-order facts from the
[settlement](srn://acme/protocol/settlement) bus and turns each into a balanced
set of [ledger-entry](srn://acme/billing/datamodel/ledger-entry@1) legs, posted
in one transaction. Nothing else in the solution writes an entry, and the
component exposes no write surface to anyone.

## Shared by two products

Its derived reuse list spans both products: [shop](srn://acme/shop) declares a
`depends-on` toward it and so does
[checkout](srn://acme/shop/checkout). Neither of those edges is authored here —
the reusing side owns the edge, and this page shows the inverse the portal
computes. That asymmetry is what keeps a shared component from accumulating a
list of consumers it has to maintain.

## Single writer per partition

Postings are serialized per account partition. That is a correctness property,
not a performance compromise: two concurrent writers can each produce a balanced
set while together violating the account's invariant, and no amount of retrying
fixes a wrong answer. The topology entry for
[production](srn://acme/environment/production) says as much, so nobody scales
it out during an incident.

## Erasure

The ledger implements [gdpr-erasure](srn://acme/requirement/gdpr-erasure) by
pseudonymization rather than deletion — entries survive with amounts and accounts
intact and every customer identifier replaced. Deleting them would break the
double-entry invariant that
[0001-double-entry](srn://acme/billing/adr/0001-double-entry) rests on, which is
why that requirement says "or anonymize" and why widening it was the right move
rather than superseding it.
