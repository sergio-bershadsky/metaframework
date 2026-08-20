---
name: shop-admin
kind: actor
version: 2
title: Shop admin (retired role)
summary: Retired catch-all staff role, split into merchant-operator, support-agent, and release-bot.
status: deprecated
owner: team-commerce
actor-type: human
goals:
  - Curate the sellable catalog and correct stock counts.
  - Answer customer contacts about orders and refunds.
  - Run migrations and promote builds between environments.
tags:
  - internal
---

Kept because nothing in this framework is ever deleted, and because the access
reviews of 2025 are only readable if the role they audited still has an address.

The three goals above are exactly the problem this role had: one name carried a
human curating a catalog, a human reading other people's order data, and a
machine credential applying migrations. No single access policy could be correct
for all three, and every review ended in an argument about which one the role
"really" was.

## Where it went

Superseded by [merchant-operator](srn://acme/actor/merchant-operator), which
took the catalog and stock half. The remaining halves are
[support-agent](srn://acme/actor/support-agent) and the
[release-bot](srn://acme/actor/release-bot) credential. The `superseded-by`
pointer rendered on this page is derived from the successor's `supersedes` edge;
it is not authored here. No protocol names `shop-admin` any more, and any new
reference to it is flagged.
