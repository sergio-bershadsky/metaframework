---
name: audit-trail
kind: requirement
version: 1
title: Settlement is auditable end to end
summary: Every posted ledger entry traces back to the payment fact that caused it, for seven years.
status: approved
owner: team-billing
requirement-type: non-functional
priority: must
relations:
  uses:
    - /environment/production
    - /protocol/settlement
tags:
  - compliance
  - finance
---

Given any [ledger-entry](srn://acme/product/billing/datamodel/ledger-entry@1), an auditor
must be able to reach the payment fact that caused it, the order it belongs to,
and the actor that triggered any manual intervention along the way — without
access to a running system and without a developer in the room.

The obligation is non-functional because it constrains how billing behaves in
general rather than what it does in any one interaction, and it is measured in
[production](srn://acme/environment/production), the only target holding data of
record.

## Acceptance criteria

- Every ledger entry carries the `order-id` of the payment fact that produced it.
- The [settlement](srn://acme/protocol/settlement) topic retains events long
  enough to replay any reconciliation run of the current quarter.
- Ledger entries are retained for seven years and are readable without the
  application that wrote them.
- A manual correction records the acting handle in `changed-by` and a reason in
  `change-reason`, both non-empty.
- The lag between a payment fact and its posted entry is reported, and a lag
  above one hour raises an alert rather than being discovered at the close.

## Rationale

The last criterion is the one that turns "eventually consistent" from an excuse
into a measured property. Without it, the bus's decoupling is indistinguishable
from a consumer that silently stopped.

The fourth criterion is why
[order](srn://acme/product/shop/component/checkout/component/payment/datamodel/order@3) and
[ledger-entry](srn://acme/product/billing/datamodel/ledger-entry@1) compose the
[auditable](srn://acme/datamodel/auditable@1) mixin, whose fields are optional in
the schema precisely because the obligation to fill them belongs here, where it
can be stated with criteria.

## Out of scope

Auditability of the acquirer's own records. Acme reconciles against the
settlement file it receives and states discrepancies; it does not audit
[psp](srn://acme/product/shop/component/checkout/component/payment/component/psp).
