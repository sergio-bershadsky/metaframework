---
name: authentication
kind: component
version: 3
title: Authentication
summary: Verifies credentials and issues, elevates, and revokes sessions — the only writer of session state.
status: approved
owner: team-identity
component-type: service
relations:
  uses:
    - /environment/production
    - /environment/staging
    - /product/identity/protocol/authorization-check
    - /datamodel/problem@1
  exposes:
    - /product/identity/datamodel/session@4
  depends-on:
    - /product/identity/component/session-store
    - /product/identity/component/acl
  implements:
    - /product/identity/requirement/session-revocation
tags:
  - identity
  - login-path
x-runtime: kotlin-jvm
---

# Authentication

Turns a proof into a [session](srn://acme/product/identity/datamodel/session@4). It reads
[credential](srn://acme/product/identity/datamodel/credential@1) records, checks the
presented proof against the verifier behind each one's locator, and writes the
resulting session to
[session-store](srn://acme/product/identity/component/session-store). Nothing else in the
solution writes session state.

## Why it is separate from ACL

They fail in opposite directions under the same load. A credential-stuffing wave
is thousands of expensive password verifications per second, all failing, all
retried; an authorization check is a cheap read that every other product is
already waiting on. Sharing a process would let the first starve the second, and
the blast radius of a login outage is "nobody new can log in" while the blast
radius of a check outage is "nothing works at all".

The split also separates the two secrets that must never meet. Authentication
holds locators into the secret store; ACL holds none and needs none, because a
session reference is not a credential. That is what makes ACL deployable at the
edge and authentication not.

## Elevation, not re-login

A session that presented one factor is elevated in place when a second is
proved: `authentication-strength` moves from `single-factor` to `multi-factor`
and `issued-at` is rewritten, while `id` and `created-at` stay. That is the
nested state pair in the protocol's `states.json`, and it is the reason strength
is a property of the session rather than a state of it — the alternative is a
transition table that has to say what `expired` expired *from*.

Elevation runs in one direction only. A session that reached `recovery` — a
mailbox was proved, nothing else — is elevated by presenting a real factor, and
this component will never write a strength weaker than the one already recorded.
Weakening in place would let an attacker who controls the inbox drag a
multi-factor session down to a level whose permission set they can satisfy, which
is the whole attack the separate `recovery` value exists to make visible.

Expiry, by contrast, is never extended. A refresh issues a new session and lets
the old one lapse, so a stolen reference has a hard ceiling regardless of how
active the thief is. Both facts are stated on
[session](srn://acme/product/identity/datamodel/session@4) itself.

## It is a caller, not a responder

The `uses` edge toward
[authorization-check](srn://acme/product/identity/protocol/authorization-check) says the
direction: authentication *initiates* checks, it does not answer them. Its own
administrative operations — revoking somebody else's session, listing the
sessions of an account — are authorized through the same path every other relying
service uses, with no internal bypass. An identity component that trusted itself
would be the one place in the solution where the access model has a hole, and it
would be invisible in this catalog because there would be no edge to draw.

## Revocation

Revoking a session is a write to
[session-store](srn://acme/product/identity/component/session-store) plus an
invalidation on the revocation channel, and the time between the two is what
[session-revocation](srn://acme/product/identity/requirement/session-revocation) puts a
number on. Revoking every session an account holds is one operation, not a loop —
that is the one thing an
[identity-admin](srn://acme/actor/identity-admin) needs to be able to do during an
incident without thinking.
