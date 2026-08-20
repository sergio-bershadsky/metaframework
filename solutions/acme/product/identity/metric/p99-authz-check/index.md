---
name: p99-authz-check
kind: metric
version: 1
title: Authorization check p99 latency
summary: p99 wall-clock latency of an authorization check as the calling service experiences it, over a rolling five minutes in production.
status: review
owner: team-identity
metric-type: duration
target: "10ms"
window: "5m"
direction: lower-is-better
relations:
  measures:
    - /product/identity/requirement/authz-check-latency
  uses:
    - /environment/production
    - /product/identity/protocol/authorization-check
tags:
  - performance
  - hot-path
---

# Authorization check p99 latency

[authz-check-latency](srn://acme/product/identity/requirement/authz-check-latency)
is a `must`, and it is a tax every product in the solution pays on every
request. This is the number that says whether acme is paying the tax it agreed
to. The requirement is the promise; this page is the observation, and the two
are kept as separate entities so that tightening one is never mistaken for
having achieved the other.

## Definition

p99 of `check-access` over
[authorization-check](srn://acme/product/identity/protocol/authorization-check),
measured **at the calling service** — the clock starts when the caller hands the
request to its client and stops when an answer comes back. Connection setup,
mTLS handshake resumption, and the session resolution against
[session-store](srn://acme/product/identity/component/session-store) are all
inside the number, because they are all inside the wait.

Checks that exceed the caller's 50 ms deadline are counted **at their deadline
value**, not dropped. A timed-out check is the slowest thing that happened to
that request, and a percentile computed only over the checks that returned is a
percentile that improves as the system gets worse. Policy denies are included —
a deny is an answer, and it costs the same evaluation. The two counters the
requirement insists on keeping apart are counted apart *elsewhere*; this metric
is about latency and does not care which way the answer went.

## Rationale

The measurement point is the whole argument, and it is the requirement's
argument restated: a figure taken inside
[acl](srn://acme/product/identity/component/acl)'s decision function measures
the evaluation and hides the architecture, and the milliseconds are in the
architecture. Two numbers under one name — one from the handler, one from the
caller — would let a dashboard be green while every product in the solution
waited.

Filed in [identity](srn://acme/product/identity)'s bucket rather than on
[acl](srn://acme/product/identity/component/acl), even though acl is the
component whose work is being timed. The number is not observed there, no single
caller owns it, and `team-identity` is who answers for it — which is what
placement records.

## Known distortions

- A caller with a tighter deadline than 50 ms truncates the tail before this
  metric can see it, and its requests look fast by disappearing early.
- The five-minute window is the requirement's, and it is short: at low check
  rates a single slow minute is most of the sample. The number is meant to be
  read during peak, which is when the requirement binds.
- Warm callers flatter it. A service that has just deployed pays full handshake
  cost on every check for the first seconds, and a rolling five minutes is long
  enough to hide that inside a busy fleet and short enough to be dominated by it
  in a quiet one.
