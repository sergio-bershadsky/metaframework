---
name: authz-check-latency
kind: requirement
version: 1
title: Authorization check latency under peak
summary: An authorization check answers within 10 ms at p99, measured at the calling service in production.
status: approved
owner: team-identity
requirement-type: non-functional
priority: must
relations:
  uses:
    - /environment/production
    - /product/identity/protocol/authorization-check
tags:
  - performance
  - hot-path
---

# Authorization check latency under peak

Every request to every product in this solution waits on a check. That makes this
number a tax on all of them, and the reason it is a `must` while
[p99-checkout-latency](srn://acme/product/shop/component/checkout/requirement/p99-checkout-latency)
— a larger budget on a narrower path — is only a `should`. A check that is slow
is not a slow feature; it is a slow solution.

Measured in [production](srn://acme/environment/production), at the calling
service, not at [acl](srn://acme/product/identity/component/acl)'s own handler. The
number that matters includes connection setup, mTLS handshake resumption, and the
session resolution against
[session-store](srn://acme/product/identity/component/session-store) — everything the
caller actually waits for. A figure taken inside the decision function measures
the evaluation and hides the architecture, which is where the milliseconds are.

## Acceptance criteria

- p99 of `check-access` is at most 10 ms over any rolling five-minute window
  during a peak day, measured at the caller.
- p50 is at most 2 ms over the same window.
- The measurement includes session resolution and TLS resumption, and excludes
  nothing the caller cannot skip.
- The objective holds at five times the median hourly check rate of the last 90
  days.
- A check that exceeds 50 ms is denied by the caller's own deadline rather than
  awaited, and that denial is counted separately from a policy deny.

## Rationale

The last criterion is the one that changes behaviour rather than describing it.
Without a caller-side deadline the tail is unbounded and every product inherits
identity's worst minute; with one, a slow check degrades to a deny, which is the
safe direction. It also means the two failure counters must stay separate — a
dashboard that adds timeouts to policy denies makes an outage look like a
tightened policy, and somebody will spend an afternoon in the grant editor.

The fourth criterion carries a headroom factor of five rather than the three
[p99-checkout-latency](srn://acme/product/shop/component/checkout/requirement/p99-checkout-latency)
uses, because check traffic scales with every product's traffic at once and a new
product arrives without warning.

## What this requirement forces

Three design consequences, all recorded elsewhere and all traceable to this
number: [role](srn://acme/product/identity/datamodel/role@1) is served with inheritance
already flattened, the grant projection is cached in-process with a bounded
staleness, and
[0002-opaque-session-tokens](srn://acme/product/identity/adr/0002-opaque-session-tokens)
had to argue explicitly that a per-check lookup fits inside the budget. That ADR
is the one place where this requirement was nearly the losing side.

## Out of scope

The latency of [authentication](srn://acme/product/identity/component/authentication).
Logging in is rare, expensive, and user-initiated; a customer will wait 300 ms for
it and will not notice. Holding both to one number would have forced the wrong
architecture on one of them.
