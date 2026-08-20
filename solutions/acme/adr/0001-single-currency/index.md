---
name: 0001-single-currency
kind: adr
version: 2
title: One currency per order, three currencies in the catalog
summary: An order is denominated in exactly one currency; conversion happens before checkout, never inside it.
status: approved
owner: team-platform
decision-status: accepted
date: "2026-02-03"
deciders:
  - team-platform
  - team-billing
  - sergio
relations:
  uses:
    - /datamodel/money@1
tags:
  - money
  - foundation
---

## Context

Acme sells into the euro zone, the UK, and the US. Early prototypes carried an
amount as a number and the currency as a session attribute, which meant every
sum in the system was correct only by accident of the reader's assumptions. Two
questions forced a decision: may a single order mix currencies, and where does
conversion happen?

The finance team's constraint is that the ledger must never hold a converted
figure whose rate is not recoverable. The commerce team's constraint is that a
customer sees one total, in one currency, before they authorize anything.

## Decision

We denominate an order in exactly one currency, fixed when the cart is created,
and we express every amount as a [money](srn://acme/datamodel/money@1) document
— a decimal string plus an ISO 4217 code. Conversion, where it happens at all,
happens upstream of the cart in the pricing feed; no component described in this
catalog converts between currencies. The currency set is closed at `EUR`, `GBP`,
and `USD`, and widening it is an additive change to the `money` schema.

## Consequences

- Every arithmetic operation in checkout and the ledger has operands in the same
  currency, so no component needs a rate table, a rate cache, or a rounding
  policy for conversion.
- A customer cannot combine a euro item and a sterling item in one basket. The
  storefront must therefore partition a mixed basket into two orders, which is
  visible to the customer and was accepted as a cost.
- The decimal string forces every consumer to parse with a decimal type. A
  consumer that reads it into a double will still work and will still be wrong;
  that risk is real and is not mitigated by the schema.
- Adding a fourth currency touches one schema, but every stored
  [ledger-entry](srn://acme/product/billing/datamodel/ledger-entry@1) predating it keeps
  validating, because widening an enum is additive.

## Alternatives considered

- **Minor units as an integer.** Compact and exact, but meaningless without the
  currency beside it, and the first bug it produced in the prototype was a
  thousand-yen order priced as ten euros. Rejected.
- **A per-line currency with conversion at checkout.** Rejected: it puts a rate
  and a rounding policy inside the checkout path, and the ledger would then hold
  a figure whose provenance is a cache entry that has since expired.
- **Decimal128 on the wire.** Rejected as a transport-specific type: JSON has no
  decimal, Avro's is a byte-encoded logical type, and the two disagree at exactly
  the boundary this catalog cares about.
