---
name: authorization-check
kind: protocol
version: 2
title: Authorization check
summary: Synchronous "may this session do this" between a relying component, the ACL, and the session store.
status: approved
owner: team-identity
style: request-response
participants:
  - alias: registration
    ref: /product/identity/component/registration
    role: initiator
  - alias: authentication
    ref: /product/identity/component/authentication
    role: initiator
  - alias: acl
    ref: /product/identity/component/acl
    role: responder
  - alias: session-store
    ref: /product/identity/component/session-store
    role: responder
conforms-to:
  - standard: RFC 9457 Problem Details for HTTP APIs
    url: https://www.rfc-editor.org/rfc/rfc9457
  - standard: RFC 9110 HTTP Semantics
    url: https://www.rfc-editor.org/rfc/rfc9110
relations:
  uses:
    - /environment/production
tags:
  - identity
  - synchronous
  - hot-path
---

# Authorization check

One question, asked constantly: may the principal behind this session reference
perform this action on this resource kind. The caller names
[acl](srn://acme/product/identity/component/acl) and waits for an answer, which is what
makes this `request-response` rather than a bus — a decision nobody waited for is
not a decision.

## The participant list is smaller than the caller list

[shop](srn://acme/product/shop) and [billing](srn://acme/product/billing) both call this
protocol, and neither appears above. That is not an omission, it is the placement
rule doing its job: participants determine the nearest common ancestor, and the
moment a component under shop is listed as a participant this entity belongs at
the solution root rather than in the identity product's bucket.

What is listed is the set whose contract this catalog fixes today — the two
identity components that initiate checks against their own administrative
surfaces, and the two that answer. The relying services outside identity reach
the same protocol through the edge they author on their own pages, exactly as
[ledger](srn://acme/product/billing/component/ledger) is reused without maintaining a list
of its consumers. A decision point that had to enumerate its callers would have
inverted its own dependency direction.

## Deny is an error, not a value

An allow is `204` with an empty body. A deny is `403` carrying an RFC 9457
[problem](srn://acme/datamodel/problem@1) document, the same failure shape
[order-placement](srn://acme/product/shop/protocol/order-placement) uses. There is no
`{"allowed": true}` envelope anywhere in this protocol.

The reason is a failure-direction argument. With a boolean in a `200`, a
transport error and a deny are indistinguishable at the type level, and every
caller's error handling has to be correct twice; with an HTTP status, a timeout,
a `503` and a `403` all land in the path that refuses. The safe reading is the
default reading.

The problem document's `detail` never names the grant that was missing. An
explanation useful enough to debug with is an enumeration oracle for anyone
probing the model, so the useful explanation lives behind `explain-access`, which
is itself an authorized operation.

## What authenticates the check

`mtls` — the calling service's own certificate. The session reference in the
request body is *data*, not a credential for this call, and conflating the two is
how a decision point ends up trusting whatever it was asked to evaluate. A caller
that presents a valid certificate and an invalid session reference gets a clean
deny; one that presents no certificate gets no answer at all.

## Artifacts

`transport.yaml` binds the conversation to HTTPS and enumerates the three
operations. `workflows/check-access.yaml` is the exchange, with the `alt` that
splits allow from deny — and a nested one for the case where the session cannot
be resolved at all, which is a third outcome and deliberately not folded into
deny.

`states.json` is the odd one and worth reading with care. Everywhere else in this
catalog a `states.json` is the state of one conversation; a single check has no
state worth naming, because it is one request and one response. What does have a
lifecycle, and what every check is evaluated against, is the
[session](srn://acme/product/identity/datamodel/session@4) — so the state machine
recorded here is the subject's, from `anonymous` through `authenticated` to
`expired` or `revoked`. Writing it once here beats every relying service
inventing its own reading of what a session reference means.

### The machine caught up with the model

Three things the [session](srn://acme/product/identity/datamodel/session@4) model
grew — a `recovery` strength, an idle deadline, and impersonation — are not
symmetric here, and the asymmetry is the useful part.

`recovery` became a nested state under `authenticated`, because it is a rung on
the elevation ladder and the ladder is what this machine describes. Its two
outward transitions both climb: `CREDENTIAL_VERIFIED` to `single-factor`,
`SECOND_FACTOR_VERIFIED` straight to `multi-factor`. Nothing descends into it,
which is the machine stating the rule
[authentication](srn://acme/product/identity/component/authentication) enforces —
strength never falls in place, because an attacker holding the inbox would
otherwise walk a strong session down to a rung they can satisfy.

`IDLE_ELAPSED` became a second edge into `expired` rather than a state of its
own. Two clocks, one outcome: a reader of a session cannot tell which deadline
fired and has no reason to care, so inventing an `idle-expired` state would have
split a terminal that nothing distinguishes. The guard says when the edge is live
at all, since a service-account session has no idle policy and never takes it.

Impersonation appears nowhere in this machine, deliberately. It is a property of
who is driving a session, not of where the session has got to, and every
transition above is identical whether or not a support agent is behind it. That
is the same argument that kept strength a property of the session on the model
side, applied in the other direction.
