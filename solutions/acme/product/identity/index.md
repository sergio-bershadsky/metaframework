---
name: identity
kind: product
version: 2
title: Identity
summary: Registration, authentication, and access control for every human and machine principal in the solution.
status: approved
owner: team-identity
lifecycle: active
primary-actors:
  - /actor/customer
  - /actor/identity-admin
  - /actor/support-agent
relations:
  exposes:
    - /product/identity/datamodel/session@4
  implements:
    - /product/identity/requirement/authz-check-latency
  uses:
    - /datamodel/base-record@1
tags:
  - identity
  - cross-cutting
x-cost-center: "4713"
---

Who is this principal, and may they do this thing. Two questions, four
components, and a deliberate refusal to answer a third — identity never decides
*what* a resource is or *what* an action means, only whether the principal
holding this session has been granted it.

This is the solution's first cross-cutting product. [shop](srn://acme/product/shop) and
[billing](srn://acme/product/billing) are vertical: each owns a slice of the business and
the two meet on one bus. Identity is horizontal, and that changes the rule that
governs its dependencies.

## Identity depends on nothing

There is no `depends-on` edge on this page, and there will not be one. Every
product may depend on identity, so identity may depend on no product — the
moment it did, an outage of that product would become an outage of every login
in the solution, and the dependency graph would contain a cycle that no
deployment order can satisfy.

The rule is enforceable rather than aspirational because it is visible: a
`depends-on` toward [shop](srn://acme/product/shop) or [billing](srn://acme/product/billing)
appearing anywhere under this product is a review failure, and the portal draws
it. What identity *does* consume is the solution's shared vocabulary —
[base-record](srn://acme/datamodel/base-record@1),
[auditable](srn://acme/datamodel/auditable@1),
[problem](srn://acme/datamodel/problem@1) — which are datamodels owned at solution
level precisely so that a cross-cutting product can use them without acquiring a
product dependency.

## Components

- [registration](srn://acme/product/identity/component/registration) — creates accounts,
  verifies handles, and is the only writer of
  [account](srn://acme/product/identity/datamodel/account@1).
- [authentication](srn://acme/product/identity/component/authentication) — verifies
  credentials and issues, refreshes, and revokes sessions.
- [acl](srn://acme/product/identity/component/acl) — the decision point. It answers
  [authorization-check](srn://acme/product/identity/protocol/authorization-check) and
  nothing else.
- [session-store](srn://acme/product/identity/component/session-store) — the store of
  record for live sessions, and the reason a revocation takes effect in seconds
  rather than at token expiry.

The split between `authentication` and `acl` is not layering for its own sake.
They fail differently and they scale differently: a login is a rare, expensive,
write-heavy operation that a customer will retry, and a check is a constant,
cheap, read-only operation on the hot path of every other product, bound by
[authz-check-latency](srn://acme/product/identity/requirement/authz-check-latency). Putting
them in one process would let a credential-stuffing wave take the whole solution
down.

## Public surface

One datamodel, [session](srn://acme/product/identity/datamodel/session@4) — the thing a
relying service holds and presents. The authorization surface itself is the
[authorization-check](srn://acme/product/identity/protocol/authorization-check) protocol,
exposed by the components that serve it rather than restated here, so the
portal's surface list for this product is the derived union of both.

[account](srn://acme/product/identity/datamodel/account@1),
[role](srn://acme/product/identity/datamodel/role@1) and
[permission](srn://acme/product/identity/datamodel/permission@2) are exposed by their
owning components for administration.
[credential](srn://acme/product/identity/datamodel/credential@1) is exposed by nobody and
never will be.

The pin on that edge is `@4` rather than latest, and it is re-pinned deliberately
rather than left to float. A product's `exposes` list is the statement other
teams read before they build against it, so it should name the revision this
product has actually reviewed and is prepared to defend — three additive
revisions later, that is version 4. Consumers still pinned at `@1` keep working,
because every step between was additive; what they do not get is any claim from
this page that `@1` is what identity supports today.

## Stability of the addresses

Other products are about to reference these SRNs from their own frontmatter, and
a reference is a promise about a name, not about a version. The four components
sit directly under this product with the names they will keep; the datamodels sit
in the product's own bucket rather than under whichever component happens to
write them today, so moving the writer does not move the contract. That is why
[session](srn://acme/product/identity/datamodel/session@4) is at
`/product/identity/datamodel/session` and not under
[session-store](srn://acme/product/identity/component/session-store), even though the store
is the obvious owner.
