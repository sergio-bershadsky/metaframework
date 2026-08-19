---
name: session-revocation
kind: requirement
version: 1
title: A revoked session stops authorizing within five seconds
summary: Revocation takes effect solution-wide within five seconds, and revoking every session of an account is one action.
status: approved
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
