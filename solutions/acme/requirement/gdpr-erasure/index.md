---
name: gdpr-erasure
kind: requirement
version: 2
title: Erasure of personal data on request
summary: A verified erasure request removes or anonymizes a customer's personal data across every component within 30 days.
status: approved
owner: team-platform
requirement-type: functional
priority: must
relations:
  uses:
    - /environment/production
    - /product/shop/component/checkout/component/payment/datamodel/order@3
tags:
  - compliance
  - privacy
---

# Erasure of personal data on request

A [customer](srn://acme/actor/customer) may demand that acme stop holding their
personal data. When that demand is verified, every component in this solution
that holds data identifying them must either delete it or anonymize it beyond
re-identification, within the statutory window.

The obligation is solution-wide because no single component can discharge it:
[checkout](srn://acme/product/shop/component/checkout) holds contact and address data,
[payment](srn://acme/product/shop/component/checkout/component/payment) holds tokenized instruments, and
[ledger](srn://acme/product/billing/component/ledger) holds entries it is legally required to keep
for seven years. The last of these is why the requirement says "or anonymize":
the accounting record survives, the person in it does not.

## Acceptance criteria

- **AC-1** A verified erasure request completes within 30 calendar days of
  verification, measured from the timestamp on the request.
  - **Given** a verified request for customer `c-1`
  - **When** 30 days have passed
  - **Then** no component returns a name, address, email, or payment instrument
    for `c-1`
- **AC-2** Ledger entries survive erasure with their amounts and account
  references intact, and with every customer identifier replaced by a stable
  pseudonym.
- **AC-3** An erased customer's orders remain countable for financial reporting
  — erasure never changes a total.
- **AC-4** Erasure is idempotent: a repeated request for an already-erased
  customer succeeds and changes nothing.
- **AC-5** Every erasure action is recorded in the audit trail with the actor
  that performed it, and the record itself contains no erased data.

## Rationale

AC-2 and AC-3 exist because the first draft of this requirement said "delete",
and deleting a ledger entry would have broken the double-entry invariant that
[0001-double-entry](srn://acme/product/billing/adr/0001-double-entry) is built on. The
statement was widened rather than narrowed, which is legal in place; had it been
narrowed, this entity would have been superseded instead.

## Out of scope

Erasure of data held by systems acme does not operate — the acquirer keeps its
own transaction record under its own obligation, and
[psp](srn://acme/product/shop/component/checkout/component/payment/component/psp) is described here only as far as that
boundary.
