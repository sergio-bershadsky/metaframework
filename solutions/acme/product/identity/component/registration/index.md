---
name: registration
kind: component
version: 1
title: Registration
summary: Creates accounts and their first credential — the only writer of the account record.
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
    - /product/identity/datamodel/account@1
  depends-on:
    - /product/identity/component/acl
  implements:
    - /product/identity/requirement/self-service-registration
    - /requirement/gdpr-erasure
tags:
  - identity
  - onboarding
x-runtime: kotlin-jvm
---

# Registration

Creates an [account](srn://acme/product/identity/datamodel/account@1), verifies the
handle, and hands over the first
[credential](srn://acme/product/identity/datamodel/credential@1). It is the only writer
of the account record, which is what makes "who created this principal, and on
whose authority" answerable from one place.

## Two ways in, one record out

A person signing up for themselves and an
[identity-admin](srn://acme/actor/identity-admin) provisioning a colleague produce
the same account shape, differing only in `principal-type` and in who is recorded
in `changed-by`. That is the same discipline
[guest-checkout](srn://acme/product/shop/requirement/guest-checkout) imposes on orders,
and for the same reason: a second record shape for the administrative path would
grow a branch in every downstream consumer, and the branches would drift.

The self-service path is the constrained one and is written down as
[self-service-registration](srn://acme/product/identity/requirement/self-service-registration).
The administrative path is the *authorized* one — creating an account for someone
else is an `identity-account` permission with action `create`, checked through
[authorization-check](srn://acme/product/identity/protocol/authorization-check) like
anything else, which is why this component has a `uses` edge toward that protocol
and a `depends-on` toward [acl](srn://acme/product/identity/component/acl).

## Verification before, roles after

An account is created in `pending-verification` and holds no roles. It cannot
authenticate, so it cannot obtain a session, so it cannot pass a check — the
three refusals are independent and none of them relies on the other two being
implemented correctly. Roles are assigned only after the handle is proved, by a
principal holding `grant-role`, and never by this component on its own initiative.

A registration that granted a default role would be the quiet failure mode of
every access-control system: the default is chosen once, for the first use case,
and inherited forever by principals nobody reviewed.

## Erasure

Registration owns [gdpr-erasure](srn://acme/requirement/gdpr-erasure) for the
identity product because it owns the record that holds the personal data —
`handle` and `display-name`. Discharging it sets `status: erased` and `erased-at`
and replaces those two fields, leaving `id`, `created-at`, and the role
assignments intact so that the pseudonymous reference other products hold stays
resolvable and financial totals do not move. Deleting the row instead would
satisfy a naive reading of the requirement and violate its third acceptance
criterion.

The obligation cascades: an erasure also revokes every live session through
[authentication](srn://acme/product/identity/component/authentication), because a session
that outlived the account it speaks for would keep authorizing a principal that no
longer exists.
