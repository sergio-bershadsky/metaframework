---
name: base-record
kind: datamodel
version: 1
title: Base record
summary: Identity and creation timestamp shared by every persisted or exchanged record in the solution.
status: approved
owner: team-platform
usage: both
abstract: true
tags:
  - foundation
---

# Base record

Every record that acme persists or puts on the wire carries a UUID identity and
a creation timestamp. This model exists only to be extended: it is never stored
or exchanged on its own, hence `abstract: true`, and the portal keeps it out of
the "what does this component store" views for exactly that reason.

## Why it does not close itself

`additionalProperties` is deliberately unset. In JSON Schema an `allOf` branch is
evaluated independently of its siblings, so a closed base would reject every
property its descendants add — the classic composition trap, and the reason the
framework names it as its own error class rather than leaving it to review.

## Descendants

[cart](srn://acme/product/shop/component/checkout/datamodel/cart@1),
[order](srn://acme/product/shop/component/checkout/component/payment/datamodel/order@3),
[order-placed](srn://acme/product/shop/datamodel/order-placed@1), and
[ledger-entry](srn://acme/product/billing/datamodel/ledger-entry@1) all extend it with a
root-level `allOf`. That set of edges is the inheritance graph the portal draws;
it is derived from the schemas, never authored in frontmatter.

The `id` is assigned by the writer, not by a database. A record therefore has an
identity before it has a row, which is what lets an idempotent retry recognise
its own earlier attempt — see
[idem-cap](srn://acme/product/shop/component/checkout/requirement/idem-cap).
