---
name: acl
kind: component
version: 4
title: ACL
summary: The decision point — answers "may this session do this" and refuses to answer anything else.
status: approved
owner: team-identity
component-type: service
lifecycle: released
relations:
  uses:
    - /environment/production
    - /environment/staging
    - /datamodel/problem@1
  exposes:
    - /product/identity/protocol/authorization-check
    - /product/identity/datamodel/role@1
    - /product/identity/datamodel/permission@2
  depends-on:
    - /product/identity/component/session-store
  implements:
    - /product/identity/requirement/authz-check-latency
    - /product/identity/requirement/session-revocation
tags:
  - identity
  - hot-path
x-runtime: rust
---

# ACL

A policy decision point and nothing else. It takes a session reference and an
asserted [permission](srn://acme/product/identity/datamodel/permission@2), resolves the
session through
[session-store](srn://acme/product/identity/component/session-store), evaluates the
principal's grants against it, and answers allow or deny. It does not know what
an order is, what a ledger account means, or which service asked.

## The busiest component in the solution

Every request to every product passes through a check here, which makes this the
only component whose latency budget is measured in single-digit milliseconds —
[authz-check-latency](srn://acme/product/identity/requirement/authz-check-latency). Three
design consequences follow, and all three are visible in the models rather than
hidden in the code:

- [role](srn://acme/product/identity/datamodel/role@1) is served resolved, with
  inheritance already flattened into `grants`, because following an id chain per
  check cannot fit in the budget.
- The grant projection is cached in-process with a bounded staleness, which is
  what [session-revocation](srn://acme/product/identity/requirement/session-revocation)
  puts a number on. Caching a *decision* would have been faster and wrong; the
  cache holds grants, and the session is resolved fresh.
- It is `component-type: service` in its own process, not a library linked into
  each caller. A library would have removed the network hop and made every policy
  change a redeployment of the entire solution.

## Deny is a problem document, not a boolean

The protocol answers an allow with `204` and empty body, and a deny with an RFC
9457 [problem](srn://acme/datamodel/problem@1) document. There is no decision
envelope carrying `{"allowed": false}`.

Two reasons. A boolean in a `200` makes a transport failure and a deny
indistinguishable at the type level, and the failure mode of that confusion is
always the same direction — a caller that treats a timeout as a falsy `allowed`
is safe, one that treats an unparsed body as truthy is a breach. And it makes the
failure shape identical to every other protocol in this catalog, so a relying
service's existing error path already handles it.

The `detail` never names the grant that was missing. An explanation precise
enough to be useful to a legitimate caller is precise enough to enumerate the
permission model for an illegitimate one, and the legitimate caller has
`explain-access` for that, which is itself an authorized operation.

## Default deny

An unknown `resource-kind` denies. An unparseable permission denies. A
session-store timeout denies. That last one is the expensive choice — it turns a
store outage into a solution-wide outage rather than a solution-wide open door —
and it is the one this catalog makes deliberately, which is why
[session-store](srn://acme/product/identity/component/session-store) declares its own
availability posture rather than being treated as a cache.

## What it does not own

Sessions belong to
[authentication](srn://acme/product/identity/component/authentication) and
[session-store](srn://acme/product/identity/component/session-store); accounts belong to
[registration](srn://acme/product/identity/component/registration). ACL is a reader of
all three. It exposes
[role](srn://acme/product/identity/datamodel/role@1) and
[permission](srn://acme/product/identity/datamodel/permission@2) because it is the only
component that can say what those documents mean, and an
[identity-admin](srn://acme/actor/identity-admin) authoring a grant needs the
evaluator's own reading of it rather than a second implementation in an admin
tool.
