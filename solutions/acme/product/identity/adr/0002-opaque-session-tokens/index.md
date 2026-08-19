---
name: 0002-opaque-session-tokens
kind: adr
version: 2
title: Opaque session references, resolved on every check
summary: A session is an opaque reference looked up per check, not a self-contained token relying services can read.
status: approved
owner: team-identity
decision-status: accepted
date: "2026-07-24"
deciders:
  - team-identity
  - team-platform
  - security-review
relations:
  uses:
    - /product/identity/datamodel/session@4
    - /product/identity/component/session-store
tags:
  - identity
  - sessions
---

# Opaque session references, resolved on every check

## Context

[0001-attribute-based-access](srn://acme/product/identity/adr/0001-attribute-based-access)
made [acl](srn://acme/product/identity/component/acl) the single decision point, which
turned the session into the input of every decision in the solution. What a
session physically *is* then stopped being an implementation detail of
[authentication](srn://acme/product/identity/component/authentication) and became a
solution-wide contract.

The obvious answer was a signed self-contained token: the relying service reads
the account, the tenant, and the strength out of it, verifies a signature, and
never talks to identity. No lookup, no dependency, no latency.

What forced the question open was
[session-revocation](srn://acme/product/identity/requirement/session-revocation). A
self-contained token is valid because it is signed, so it stays valid until it
expires, and there is no acknowledged write anywhere that makes it stop. Every
mitigation for that turns out to be a lookup wearing a disguise — a revocation
list the verifier must fetch, a two-minute expiry that forces a refresh call, a
push channel each relying service must consume correctly.

## Decision

A session is an opaque reference: 128 bits from a CSPRNG, with no structure to
parse and nothing to read out of it. The
[session](srn://acme/product/identity/datamodel/session@4) document lives in
[session-store](srn://acme/product/identity/component/session-store) and is resolved by
[acl](srn://acme/product/identity/component/acl) on every check, uncached.

Grants are cached; the session is not. That split is the decision. The cheap,
slowly-changing part of the answer is cached in-process, and the part that must be
able to change in five seconds is read fresh.

## Consequences

- Revocation becomes a write to one store, and its propagation is bounded by that
  store rather than by a token's lifetime. AC-1 of
  [session-revocation](srn://acme/product/identity/requirement/session-revocation) is
  satisfiable at all, which it was not under the alternative.
- The store is on the critical path of every request in the solution. It is the
  reason [session-store](srn://acme/product/identity/component/session-store) is described
  as a store of record rather than a cache, that a lagging replica refuses instead
  of answering, and that
  [authz-check-latency](srn://acme/product/identity/requirement/authz-check-latency)
  measures at the caller, where the lookup is visible.
- A store outage is a solution outage, by construction, because default deny is
  the safe direction and there is no fallback that preserves the guarantee. This
  is the cost, it was accepted with its eyes open, and it is stated on the
  component so nobody discovers it during an incident.
- Relying services cannot read the account id out of a session, which removed a
  whole class of accidental coupling. A service that needs the principal's
  identity asks for it and is authorized for it.
- Sessions become unforgeable rather than merely tamper-evident. There is no
  signing key to leak, and no algorithm-confusion class of bug to be exposed to.
- The session document can grow without a migration, and it has: impersonation,
  a weaker `recovery` strength, and an idle deadline all arrived after this
  decision and reached every relying service the moment the store returned them.
  Under a self-contained token each of those would have been a format change
  negotiated with every verifier in the solution, which is the cost this decision
  bought out — worth recording, because it is the consequence that keeps paying
  and the one nobody predicted at the time.

## Alternatives considered

- **Signed self-contained tokens with short expiry.** Two-minute lifetimes plus a
  refresh endpoint. Rejected after measurement: the refresh traffic reached 60% of
  the check traffic it was meant to avoid, so the lookup was still there and had
  merely moved to a less predictable place. The revocation guarantee remained
  two minutes rather than five seconds.
- **Self-contained tokens plus a revocation list.** The verifier fetches a
  bloom-filtered deny list every few seconds. Rejected because correctness now
  depends on every relying service implementing the fetch correctly, forever, and
  the one that gets it wrong is invisible until an incident. It also reintroduces
  the network dependency the format existed to remove.
- **Opaque reference cached at the relying service.** Caching the resolved
  session for a few seconds at each caller. Rejected: it moves the staleness
  budget out of identity's control and multiplies it by the number of callers,
  and the five-second bound stops being provable.
- **Hybrid — self-contained for reads, lookup for writes.** Rejected on
  comprehensibility. Two session semantics in one solution means every author has
  to classify their own operation correctly, and the failure mode of a
  misclassification is silent.
