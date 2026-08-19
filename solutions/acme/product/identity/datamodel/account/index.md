---
name: account
kind: datamodel
version: 1
title: Account
summary: A principal the solution can authenticate, and the roles it has been assigned — never its secrets.
status: approved
owner: team-identity
usage: both
abstract: false
tags:
  - identity
  - privacy
---

# Account

The record of a principal: a handle to log in with, a status, a tenant, and a
list of assigned roles. Written only by
[registration](srn://acme/product/identity/component/registration), read by everything in
identity, and exposed for administration to nothing outside it.

It composes [base-record](srn://acme/datamodel/base-record@1) for identity and
creation time and [auditable](srn://acme/datamodel/auditable@1) because
disabling an account is a human decision somebody has to justify — the
`change-reason` on a disabled account is the difference between an incident
response and an unexplained lockout.

## Handle is not an email address

`handle` is typed as a bounded string with no `format`, and the description says
"usually an email address; never assumed to be one". Service principals log in
with a name that has no `@` in it, and a `format: email` here would have made the
service case a schema violation rather than a modelling decision. The one place
an email address is genuinely required — verification during registration — is a
step in a workflow, not a property of this record.

## Roles by id, and only by id

The account names roles by UUID and never embeds them. The reason is the mirror
image of why [role](srn://acme/product/identity/datamodel/role@1) embeds its permissions:
a role document is a resolved projection with a short cache life, and an account
is a durable record that may sit untouched for years. Embedding a projection in a
durable record produces the worst possible artifact — a snapshot of an
authorization decision, stored, and silently wrong the moment the role changes.

Which roles an account effectively holds, including inherited ones, is answered
by [acl](srn://acme/product/identity/component/acl) at check time, not read off this
record.

## Erasure

`status: erased` and `erased-at` are how this model discharges
[gdpr-erasure](srn://acme/requirement/gdpr-erasure). The row survives with its
`id`, its `created-at`, and its role assignments; `handle` and `display-name` are
replaced. That keeps the pseudonymous identifier that
[order-placed](srn://acme/product/shop/datamodel/order-placed@1) and
[ledger-entry](srn://acme/product/billing/datamodel/ledger-entry@1) point at valid, so
erasure does not break financial reporting — the third acceptance criterion of
that requirement, and the reason the account is not deleted.

`erased` is a terminal status. An erased account cannot be reactivated, because
there is nothing left to prove that the person asking is the person erased.

## What is not here

No password, no hash, no second-factor seed, no session. Credentials live in
[credential](srn://acme/product/identity/datamodel/credential@1) behind a locator, and
sessions in [session](srn://acme/product/identity/datamodel/session@1). Keeping them out
of the account record is what lets an administrative surface return an account
without a redaction pass — a surface that must strip fields before responding
will eventually forget to.
