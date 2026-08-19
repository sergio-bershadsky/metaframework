---
name: order-placed
kind: datamodel
version: 1
title: Order placed
summary: The fact that an order was placed, published for any product in the solution to consume.
status: approved
owner: team-shop
usage: exchange
abstract: false
tags:
  - commerce
  - event
---

# Order placed

Shop's one public fact. It extends
[base-record](srn://acme/datamodel/base-record@1) so that every published fact
carries the same identity and creation timestamp as everything else acme writes,
and it carries enough of the order for a consumer to act without calling back
into shop.

"Enough" is the design question. A fact that carries only an identifier forces
every consumer into a synchronous read, which reintroduces exactly the coupling
the [settlement](srn://acme/protocol/settlement) bus exists to remove. A fact
that carries the whole aggregate makes every internal change of
[order](srn://acme/product/shop/component/checkout/component/payment/datamodel/order@3) a public one. This
model sits deliberately in between: identity, total, and lines — the fields a
consumer needs to post a ledger entry or count revenue.

## Evolution

New optional fields may be added here freely; every existing consumer keeps
validating, because readers must tolerate unknown properties from a later
version than they pinned. Removing a field or adding one to `required` is not
available at any version number, and the escape hatch — a successor entity with
a `supersedes` edge — is deliberately expensive so that it is used rarely.
