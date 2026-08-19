---
name: acme
kind: solution
version: 3
title: Acme Retail Platform
summary: The retail platform describing acme's storefront, checkout, and billing systems as one reviewable catalog.
status: approved
owner: team-platform
vision: |
  One described universe for everything acme sells online: a single catalog in
  which every product, component, protocol, and data model is addressable,
  reviewable in git, and rendered by the portal without a second source of
  truth. The catalog is the contract between the teams — the code repositories
  implement it, they do not define it.
scope:
  in:
    - Customer-facing commerce and checkout systems.
    - Settlement, ledger, and reconciliation for orders placed through them.
    - Internal libraries and tooling those systems depend on.
  out:
    - Corporate IT, HR, and the finance back office.
    - Warehouse robotics and carrier networks acme does not operate.
    - Anything acme neither owns nor operates — modelled as external components.
contacts:
  - role: architect
    handle: s.bershadsky
    channel: "#acme-arch"
  - role: product-lead
    handle: j.okonkwo
  - role: on-call
    handle: team-platform
    channel: "#acme-oncall"
relations:
  uses:
    - /environment/production
    - /datamodel/money@1
tags:
  - retail
  - flagship
---

# Acme Retail Platform

Acme sells physical goods online. This catalog describes the systems that take an
order from a customer's cart to a settled payment and a posted ledger entry. It
is a description, not an implementation: every repository that builds one of
these components is expected to match what is written here, and a divergence is
a defect in one of the two.

Two products divide the universe. [shop](srn://acme/shop) owns everything a
customer touches — cart, checkout, payment orchestration, stock availability.
[billing](srn://acme/billing) owns everything that happens after the money moves
— the double-entry ledger and the reconciliation job that proves it balances.
The two meet on exactly one surface, the solution-level
[settlement](srn://acme/protocol/settlement) bus, which is why that protocol
lives at the solution root rather than inside either product.

## Reading order

Start with the [shop](srn://acme/shop) product, then its
[checkout](srn://acme/shop/checkout) component and the
[payment](srn://acme/shop/checkout/payment) sub-component beneath it. The
vocabulary shared by both products is small on purpose:
[money](srn://acme/datamodel/money@1) for every amount,
[base-record](srn://acme/datamodel/base-record@1) for identity and creation
time, and [problem](srn://acme/datamodel/problem@1) for every failure that
crosses a boundary.

## Boundary

Everything acme does not operate — the card acquirer, the carrier APIs — is
described as an `external` component inside the product that depends on it, at
the fidelity that product needs. No reference in this catalog leaves
`srn://acme`; the solution is a sealed universe, and that is what makes it
movable and reviewable as one unit.

## Conventions

Amounts are decimal strings, never floats. Timestamps are RFC 3339 in UTC.
Identifiers on the wire are UUIDs. Where a rule could not be expressed in a
schema it is written as a requirement with acceptance criteria, and the
component that takes it on says so with an `implements` edge.
