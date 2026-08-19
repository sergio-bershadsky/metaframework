---
name: auditable
kind: datamodel
version: 1
title: Auditable
summary: Mixin recording who last changed a record and why, for models under audit obligation.
status: approved
owner: team-platform
usage: both
abstract: true
tags:
  - foundation
  - compliance
---

# Auditable

A cross-cutting property set, not a thing: `changed-by` and `change-reason`, both
optional, added to any model whose changes an auditor may have to explain. It is
a mixin only in the way people talk about it — mechanically it is another
`allOf` branch, which is why the framework has no `mixin` flag to set.

Both properties are optional on purpose. Making them required would tighten
every descendant's contract at once and break every instance written before the
mixin was adopted; the obligation to fill them in lives in
[audit-trail](srn://acme/billing/requirement/audit-trail), where it can be stated
with acceptance criteria instead of pretended to by a schema.

## Users

[order](srn://acme/shop/checkout/payment/datamodel/order@3) and
[ledger-entry](srn://acme/billing/datamodel/ledger-entry@1) compose it with
[base-record](srn://acme/datamodel/base-record@1). Order within `allOf` is
irrelevant — conjunction is commutative — so the portal draws both branches as
peers, with the mixin edge dashed purely as a rendering hint.

`changed-by` holds an actor handle, not a database user: `support-agent`,
`release-bot`. That is what makes an audit answerable without a join against a
system nobody in this catalog describes.
