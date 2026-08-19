---
name: staging
kind: environment
version: 2
title: Staging
summary: Production-shaped rehearsal target with synthetic data — the last gate before real users.
status: approved
owner: team-platform
environment-type: staging
tags:
  - eu
---

# Staging

Same topology and the same protocol versions as
[production](srn://acme/environment/production), one region, and no customer
data of record. It exists so that a protocol change can be rehearsed against the
shape it will meet, not against a toy.

## Guarantees

- Synthetic data only. A production dump landing here is an incident, not a
  convenience: the [gdpr-erasure](srn://acme/requirement/gdpr-erasure)
  obligation has no machinery on this target.
- No availability objective. Staging may be down for a working day without
  anyone being paged.
- The card acquirer is reached through its sandbox endpoint. That is why
  [psp](srn://acme/product/shop/component/checkout/component/payment/component/psp) — an `external` component —
  legitimately declares both environments: the two endpoints are different
  systems wearing the same name.

## What runs here

Everything on the checkout path plus the
[reconciliation](srn://acme/product/billing/component/reconciliation) job, which is still `draft`
and therefore has no business declaring production. Placement detail is in the
sibling `topology.yaml`; there is no `config.yaml` because the target provides
no key beyond the defaults every component ships with.
