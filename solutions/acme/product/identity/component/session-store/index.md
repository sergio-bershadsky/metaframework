---
name: session-store
kind: component
version: 2
title: Session store
summary: The store of record for live sessions, and the reason a revocation is measured in seconds.
status: approved
owner: team-identity
component-type: datastore
lifecycle: released
relations:
  uses:
    - /environment/production
    - /environment/staging
  exposes:
    - /product/identity/protocol/authorization-check
  implements:
    - /product/identity/requirement/session-revocation
    - /product/identity/requirement/authz-check-latency
tags:
  - identity
  - hot-path
x-runtime: redis-cluster
---

Holds every live [session](srn://acme/product/identity/datamodel/session@1), keyed by its
opaque reference, and answers the `resolve-session` operation of
[authorization-check](srn://acme/product/identity/protocol/authorization-check). It is
`component-type: datastore`, which in this catalog means it has no business logic
worth describing and no decision it is allowed to make — it stores, it evicts,
and it answers.

## A store of record, not a cache

The distinction is load-bearing here in a way it usually is not. A cache may be
empty; this may not. If the store loses a session, the principal is logged out,
and if it *silently* loses one and a replica answers from stale state, a revoked
session keeps authorizing — which is the exact failure
[0002-opaque-session-tokens](srn://acme/product/identity/adr/0002-opaque-session-tokens)
chose the lookup in order to prevent. Choosing a store that trades durability for
latency here would give back the whole benefit of that decision.

Hence the posture: writes are acknowledged by a quorum before
[authentication](srn://acme/product/identity/component/authentication) reports a session
issued, reads are served from the primary in the session's own region, and a
replica that has fallen behind refuses rather than answering. Refusing is safe
because [acl](srn://acme/product/identity/component/acl) denies on a resolution failure.

## Two obligations that pull apart

It implements both
[authz-check-latency](srn://acme/product/identity/requirement/authz-check-latency) and
[session-revocation](srn://acme/product/identity/requirement/session-revocation), and
they pull in opposite directions: the first wants reads answered locally without
coordination, the second wants a revocation visible everywhere immediately. The
resolution is asymmetric — reads are local within a region and revocations are
pushed rather than polled, so the propagation cost is paid by the rare operation
instead of by the constant one.

That asymmetry is the reason this is a component in the catalog rather than an
implementation detail of authentication. Two requirements meet here, and a
description that hid the store would have nowhere to say how.

## Expiry is eviction, not a state change

A session whose `expires-at` has passed is evicted by TTL; nothing writes
`state: expired`. The state exists in the model and in `states.json` because it
is the state a *reader* observes — a resolution that finds nothing and a
resolution that finds an expired record are the same answer to
[acl](srn://acme/product/identity/component/acl), and both deny. Revocation is the
opposite case and is written explicitly, because `revoked-at` and
`revocation-reason` have to survive long enough for the principal to be told why.
