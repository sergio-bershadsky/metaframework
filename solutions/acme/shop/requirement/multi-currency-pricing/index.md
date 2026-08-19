---
name: multi-currency-pricing
kind: requirement
version: 2
title: Per-line currency in a single basket
summary: Recorded non-goal — a basket mixing currencies is out of scope for the current planning window.
status: approved
owner: team-shop
requirement-type: functional
priority: wont
relations:
  uses:
    - /datamodel/money@1
tags:
  - money
  - non-goal
---

# Per-line currency in a single basket

A customer browsing across acme's three storefronts would, in principle, like to
put a sterling item and a euro item in one basket and pay once. This requirement
records that request, its criteria, and the fact that acme has declined it for
now.

`priority: wont` is not deletion. The statement stays readable so that the same
request arriving next quarter meets a recorded answer instead of an empty
catalog, and so that the answer can be revisited by moving one field rather than
by archaeology.

## Acceptance criteria

- A basket accepts lines denominated in different currencies and prices each in
  its own.
- The customer is shown one payable total, in a currency they chose, with the
  conversion rate and its timestamp visible before authorization.
- The [ledger](srn://acme/billing/ledger) records the original currency of every
  line alongside the converted figure and the rate used.
- A refund returns the original currency amount, not a re-conversion at today's
  rate.

## Rationale

Declined because the third and fourth criteria put a rate table, a rate history,
and a rounding policy inside the settlement path, which
[0001-single-currency](srn://acme/adr/0001-single-currency) deliberately kept
out. The commercial upside measured in the pilot did not cover that.

## Out of scope

Multi-currency *pricing display*, which is already live and is a storefront
concern, not a checkout one.
