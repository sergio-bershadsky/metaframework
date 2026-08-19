---
name: session-revocation
kind: requirement
version: 3
title: A revoked session stops authorizing within five seconds
summary: Revocation takes effect solution-wide within five seconds, and revoking every session of an account is one action.
status: review
owner: team-identity
requirement-type: functional
priority: must
relations:
  uses:
    - /environment/production
    - /product/identity/protocol/authorization-check
tags:
  - security
  - incident-response
---

# A revoked session stops authorizing within five seconds

When an [identity-admin](srn://acme/actor/identity-admin) ends a session, the
question is not whether it stops working but when, and "at token expiry" is not
an answer during an incident. Five seconds is the number, measured in
[production](srn://acme/environment/production) from the acknowledged write to
the first denied check in any region.

## Acceptance criteria

- **AC-1** A revoked session is denied by
  [acl](srn://acme/product/identity/component/acl) within five seconds of the revocation
  being acknowledged, in every region the solution serves.
  - **Given** an authenticated session passing checks
  - **When** it is revoked and acknowledged at `t`
  - **Then** no check succeeds for that session after `t + 5s`
- **AC-2** Revoking every session held by one account is a single operation
  bounded by the same five seconds, not a loop over sessions.
- **AC-3** Erasing an account under
  [gdpr-erasure](srn://acme/requirement/gdpr-erasure) revokes its sessions as part
  of the same operation, not as a follow-up job.
- **AC-4** A revoked session's `revoked-at` and `revocation-reason` survive the
  reference itself, long enough for the principal to be told why on their next
  attempt.
- **AC-5** Revocation is idempotent. Revoking an already-revoked session succeeds
  and does not overwrite the original reason or timestamp.
- **AC-6** Revoking an impersonated session ends the session outright. There is
  no operation that ends the impersonation and leaves the session authorizing as
  the account holder.
  - **Given** a session whose `impersonated-by` names a
    [support-agent](srn://acme/actor/support-agent)
  - **When** it is revoked
  - **Then** no check succeeds for that session, whether asserted for the agent
    or for the account holder
- **AC-7** An acknowledged revocation survives a failover of
  [session-store](srn://acme/product/identity/component/session-store), and the
  five-second budget is not restarted by one.
  - **Given** a revocation acknowledged at `t`
  - **When** the store fails over to another replica at any point after `t`
  - **Then** the session is still revoked, and no check succeeds for it after
    `t + 5s` — not after `failover + 5s`

## Rationale

AC-2 is the one that shapes the store. Looping over an account's sessions makes
the bound depend on how many a principal happens to hold, which is exactly the
number nobody knows during an incident — a compromised service account may hold
thousands. A single operation means the account, not the session, is the unit
revocation is indexed by, and that is a decision about the store's key layout
rather than about an API.

AC-4 exists because the alternative is a principal who is silently logged out and
files a support ticket. The reason is written by a human under
[auditable](srn://acme/datamodel/auditable@1) discipline and shown back to them.

AC-5 protects the audit record. A retried revocation that overwrote the first
reason would replace "credential compromise, ticket 4711" with whatever the retry
carried, and the useful sentence would be the one that got lost.

AC-6 closes a hole that opened the moment
[session](srn://acme/product/identity/datamodel/session@4) grew `impersonated-by`.
The tempting operation is "stop impersonating" — end the agent's involvement,
leave the customer logged in — and it is tempting because it is what the agent
wants when they finish a call. It is refused here because revocation during an
incident is aimed at the *session*, and an incident responder who revokes one and
gets a still-live session back has been given a result that looks like success
and is not.

Ending impersonation cleanly is a real need and belongs to a different operation
with a different name, one that is not reachable from the incident-response path
and does not report itself as a revocation. Two operations that differ in whether
anything is still authorized afterwards must not share a verb.

AC-7 makes the word "acknowledged" in AC-1 mean something, which on its own it did
not. Every criterion above is satisfiable by a store that acknowledges as soon as
one replica has the write, and such a store meets all of them right up to the
moment a replica is lost — which is precisely the moment an incident is under way
and the revocation that vanishes is the one that mattered.

Stating it as a criterion rather than leaving it to the component's design is
deliberate. Durability before acknowledgement is a cost paid on every revocation,
it is invisible to every test that does not kill a node, and it is the first thing
an optimisation removes when revocation latency is measured and durability is not.
A requirement that can be met by a faster, wronger implementation is a requirement
missing a criterion.

The budget not restarting is the other half of it. A failover that reset the five
seconds would turn this into a promise about a healthy system, and the promise is
only worth anything about an unhealthy one.

## Why five, and why this is functional rather than non-functional

Five seconds is the propagation budget of the invalidation channel plus the
staleness bound of the grant cache, with margin — it is derived from the design,
not chosen as a round number. If it were only a timing objective this would be a
non-functional requirement; it is functional because AC-2 and AC-3 state what the
system must *do*, and the timing is a qualifier on the behaviour rather than the
whole of it.

The tension with
[authz-check-latency](srn://acme/product/identity/requirement/authz-check-latency) is real
and is resolved asymmetrically in
[session-store](srn://acme/product/identity/component/session-store): reads stay local,
revocations are pushed. The rare operation pays the coordination cost.

## Out of scope

Revoking a session held by a system acme does not operate. The acquirer's own
session with its own console is outside this catalog, and
[psp](srn://acme/product/shop/component/checkout/component/payment/component/psp) is described only as
far as that boundary.
