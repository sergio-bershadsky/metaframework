---
name: 0001-double-entry
kind: adr
version: 1
title: Keep a double-entry ledger rather than a payment log
summary: Every money movement is recorded as balanced debit and credit legs, never as a single row.
status: approved
owner: team-billing
decision-status: accepted
date: "2026-04-18"
deciders:
  - team-billing
  - finance-controller
relations:
  uses:
    - ../../datamodel/ledger-entry@1
    - /protocol/settlement
tags:
  - finance
  - persistence
---

# Keep a double-entry ledger rather than a payment log

## Context

The first version of billing stored one row per payment: amount, order, status.
It answered "what did this customer pay" and nothing else. It could not answer
"does the money we think we hold match the money the acquirer says it sent us",
which is the question the monthly close actually asks, and the answer was
assembled by hand in a spreadsheet for four months.

Acme's auditor requires that any reported figure be traceable to movements that
sum to it, and that no movement exist without a counterpart.

## Decision

We keep a double-entry ledger. Every money movement is recorded as two or more
[ledger-entry](srn://acme/billing/datamodel/ledger-entry@1) legs that sum to
zero, posted in one transaction. There is no single-row representation of a
payment anywhere in billing, and no component outside
[ledger](srn://acme/billing/ledger) may write an entry.

## Consequences

- The monthly close is a query, not a spreadsheet. Any figure decomposes into
  the legs that produced it.
- Reversals are new legs, never edits or deletes. A refunded order therefore has
  four legs, not two, and reports must aggregate rather than look up.
- Writing is single-threaded per account partition, which caps throughput and is
  the reason the ledger's topology entry says that scaling it out is a
  correctness change rather than a capacity one.
- Every consumer of the [settlement](srn://acme/protocol/settlement) bus must be
  idempotent, because a redelivered event that posted twice would balance
  perfectly and be wrong.

## Alternatives considered

- **Single-row payment log with an audit table.** What existed. Rejected: the
  audit table records that a row changed, not what movement occurred, and it
  cannot be summed.
- **Buy a ledger product.** Genuinely considered and rejected on data residency
  — the two candidates hold entries outside `eu-west-1`, which
  [production](srn://acme/environment/production) forbids for payment data.
- **Event sourcing the ledger.** Rejected as the wrong tool twice over: double
  entry already gives an append-only history with a built-in invariant, and
  [0002-change-data-capture](srn://acme/shop/adr/0002-change-data-capture) had
  just recorded what the projection-rebuild cost looks like at scale.
