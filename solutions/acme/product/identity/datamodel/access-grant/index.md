---
name: access-grant
kind: datamodel
version: 1
title: Access grant
summary: Abstract base for anything that confers access — named, scoped, time-bounded, and never deleted.
status: approved
owner: team-identity
usage: both
abstract: true
tags:
  - identity
  - foundation
---

[role](srn://acme/product/identity/datamodel/role@1) and
[permission](srn://acme/product/identity/datamodel/permission@2) are different things —
one is a bundle an administrator hands to a person, the other is a single
capability over a resource kind — but four properties are true of both, and an
auditor asks about those four rather than about the distinction. This model is
those four properties, and `abstract: true` because nothing is ever a bare
access grant.

## What the base actually carries

`label` for the administrator, `scope` and `tenant-id` for the blast radius, and
`effective-from` / `effective-to` for time. It composes
[base-record](srn://acme/datamodel/base-record@1) for identity and creation time,
and [auditable](srn://acme/datamodel/auditable@1) because a change to a grant is
exactly the class of change an auditor makes somebody explain.

Composing both at this level rather than on each descendant is what makes the
inheritance chain three deep: `base-record` → `access-grant` → `role` and
`permission`. Depth is not a goal, but the alternative — repeating the same two
`allOf` branches on both descendants — is the state that drifts, and a drift
between what a role records about its own history and what a permission records
is exactly the gap an audit falls through.

## Revocation is a timestamp, not a delete

`effective-to` exists because the question an
[identity-admin](srn://acme/actor/identity-admin) has to answer is "who could
have done this on 3 March", and that question is unanswerable against a table
whose rows are removed when access ends. Setting `effective-to` keeps the record,
keeps the [auditable](srn://acme/datamodel/auditable@1) fields that say who ended
it and why, and lets [acl](srn://acme/product/identity/component/acl) evaluate the
interval instead of the row's existence.

The cost is that the store grows without bound and every evaluation carries an
interval test. That is the trade this catalog accepts, and the reason the
[authz-check-latency](srn://acme/product/identity/requirement/authz-check-latency)
requirement is written against a resolved, cached projection rather than against
the store.

## The conditional, and what it is not

An `if` / `then` pair makes `tenant-id` required when `scope` is `tenant`. It is
a shape rule, not a security rule: it stops a tenant-scoped grant being written
with no tenant, which would otherwise read as global to a naive evaluator. The
security rule — that a tenant grant may never be evaluated outside its tenant —
lives in [acl](srn://acme/product/identity/component/acl), because a schema cannot see
the request it is being compared against.

`additionalProperties` is deliberately unset here, for the same reason it is
unset on [base-record](srn://acme/datamodel/base-record@1): a closed base rejects
every property its descendants add, because an `allOf` branch is evaluated
without knowing its siblings.
