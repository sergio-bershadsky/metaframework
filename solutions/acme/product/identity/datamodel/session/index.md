---
name: session
kind: datamodel
version: 1
title: Session
summary: One authentication episode — opaque to its holder, resolvable only by the store that issued it.
status: approved
owner: team-identity
usage: both
abstract: false
tags:
  - identity
  - public-surface
---

# Session

The identity product's one public datamodel, and the thing every other product
holds. A session says which principal is acting, inside which tenant, how much
they proved, and until when.

## What the holder actually has

Not this document. The holder has an opaque reference — 128 bits of randomness
with no structure to parse — and this schema describes what
[session-store](srn://acme/product/identity/component/session-store) returns when
[acl](srn://acme/product/identity/component/acl) resolves that reference. The
distinction is the whole of
[0002-opaque-session-tokens](srn://acme/product/identity/adr/0002-opaque-session-tokens):
a self-contained token would let a relying service read these fields without a
lookup, and would also let a revoked session keep authorizing until its own
expiry, because nobody would be asking anyone.

## State, and where it is defined

`state` carries the four names that appear in the `states.json` of
[authorization-check](srn://acme/product/identity/protocol/authorization-check):
`anonymous`, `authenticated`, `expired`, `revoked`. The schema enumerates them so
an instance can be validated; the state machine says which transitions are legal,
which the schema deliberately does not attempt. Two artifacts, one vocabulary,
and the portal cross-checks them.

`authentication-strength` is a separate axis from `state`, not a fifth state. A
session is authenticated whether one factor or two were presented; what changes
is which permissions match, because
[permission](srn://acme/product/identity/datamodel/permission@2) branches carry
`requires-multi-factor`. Modelling strength as a state would have forced a
transition for every elevation and left `expired` ambiguous about what it expired
from.

## Tenant on the session, not on the account

`tenant-id` records the tenant the session is acting *inside*, which is not
necessarily the tenant the account belongs to — a support principal with a global
grant acts inside a customer's tenant for the duration of a session. Every
tenant-scoped grant is evaluated against this field. Reading the tenant off the
account instead would have made cross-tenant support work either impossible or
unbounded, with nothing in between.

## Expiry is never extended

`expires-at` is absolute and immutable. A refresh issues a new session with a new
`id` and lets the old one lapse, so the lifetime of any single session is fixed
at issuance and a stolen reference has a hard ceiling. That is also what makes
`created-at` — inherited from [base-record](srn://acme/datamodel/base-record@1) —
worth having alongside `issued-at`: they differ exactly when an anonymous session
was later elevated, which is the case the audit trail cares about.

## Anonymous sessions are real records

A browser that has never logged in still gets a session, in state `anonymous`
with `authentication-strength: none` and no `account-id`. That is not
bookkeeping: [guest-checkout](srn://acme/product/shop/requirement/guest-checkout) requires
a purchase without an account, and the cart that purchase is built from has to
belong to *something* that survives a page load. Making the anonymous case a
first-class state means no component has to special-case a null session, and the
`if` / `then` in the schema states the only asymmetry — an authenticated session
must name an account.
