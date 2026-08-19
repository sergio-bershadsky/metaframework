---
name: merchant-operator
kind: actor
version: 1
title: Merchant operator
summary: Staff member who curates the sellable catalog and corrects stock counts.
status: review
owner: team-commerce
actor-type: human
goals:
  - Publish a product so customers can buy it, without an engineer in the loop.
  - Correct a stock count that reality disagrees with, and see why it drifted.
relations:
  supersedes:
    - ../shop-admin
  uses:
    - /shop/inventory
tags:
  - internal
  - catalog
---

# Merchant operator

The person who decides what is for sale and at what stock level. They act inside
acme's ownership boundary through internal tooling, and they never see payment
instruments — that separation is the whole reason this role exists as its own
actor.

## Supersession

This actor supersedes [shop-admin](srn://acme/actor/shop-admin), a catch-all
staff role that mixed catalog curation, customer support, and release
automation under one name and therefore under one access policy. The split is a
swap, not an edit: `shop-admin` stays on the filesystem as `deprecated`, this
entity carries the `supersedes` edge, and the derived `superseded-by` pointer on
the old page is computed rather than authored.

The other two halves of the old role are
[support-agent](srn://acme/actor/support-agent) and
[release-bot](srn://acme/actor/release-bot).

## Status

`review`, not `approved`: the stock-correction goal is still being argued over
with team-shop, because it implies a write path into
[inventory](srn://acme/shop/inventory) that no protocol currently describes.
