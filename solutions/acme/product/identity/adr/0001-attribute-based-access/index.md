---
name: 0001-attribute-based-access
kind: adr
version: 1
title: Decide on attributes, not on roles alone
summary: Access is decided by evaluating permissions against resource attributes; roles remain only a distribution mechanism.
status: approved
owner: team-identity
decision-status: accepted
date: "2026-06-11"
deciders:
  - team-identity
  - team-platform
  - security-review
  - sergio
relations:
  uses:
    - /product/identity/datamodel/permission@2
    - /product/identity/datamodel/role@1
tags:
  - identity
  - access-control
---

# Decide on attributes, not on roles alone

## Context

The first access model was roles only: a principal held a set of role names and
each protected operation asserted a name. It survived exactly as long as every
question was "is this person a support agent".

It stopped surviving when the questions acquired objects. A support agent may
refund an order — which orders? Their tenant's. A finance user may read ledger
entries — which ones? The accounts under one chart prefix. A catalog editor may
publish — which SKUs? Their brand's. Under a role-only model each of those
answers becomes a new role, and the roles multiply as the product of tenants,
prefixes, and brands. By the time this record was written there were 140 roles,
of which 118 differed from another role by one tenant identifier, and no
[identity-admin](srn://acme/actor/identity-admin) could say what any of them
meant without reading the code that asserted them.

The failure was not size. It was that the role name had become the only place the
scoping rule was written down, and it was written in the name.

## Decision

Access is decided by evaluating a
[permission](srn://acme/product/identity/datamodel/permission@2) against the attributes
of the resource and the session. A permission names a `resource-kind`, a set of
actions, and the qualifiers that constrain them — `order-range`,
`account-prefix`, `sku-pattern`, `tenant-id`, `requires-multi-factor`.
[acl](srn://acme/product/identity/component/acl) evaluates all of it at check time.

[role](srn://acme/product/identity/datamodel/role@1) survives, demoted. It is a bundle an
administrator hands out and a name a human reasons with. It confers no access on
its own and asserting a role name is not a check any component may perform.

## Consequences

- The `resource-kind` union becomes the extension point, and adding a resource
  kind is an additive change to one schema rather than a new axis of roles.
  Adding the `identity-account` branch — version 2 of that model — cost one
  branch and no roles.
- Every check must carry the resource's attributes, so the caller has to know
  what it is protecting. That is more work at every call site and it is where the
  scoping rule now lives, in the open, instead of inside a role name.
- Evaluation is no longer a set-membership test, which is why
  [authz-check-latency](srn://acme/product/identity/requirement/authz-check-latency) had to
  be written down with a number. Grants are served resolved and cached in-process
  to pay for it.
- Denials become harder to explain, and `explain-access` exists as a separate,
  authorized operation because the useful explanation is an enumeration oracle if
  it is free.
- The 140 roles collapsed to 19. That number is the headline and it is the least
  interesting consequence — the point is that a grant now says what it permits.

## Alternatives considered

- **Keep roles, add scoping to the assignment.** Attach a tenant to the
  *assignment* rather than to the grant, so one "support agent" role is assigned
  per tenant. Genuinely close, and rejected because it scopes only by tenant. The
  ledger prefix and the SKU glob have no assignment to hang on, and the model
  would have grown a second scoping mechanism within a quarter.
- **Per-object access control lists.** Store the permitted principals on each
  order and each ledger entry. Rejected on two grounds: the list has to be
  maintained by whichever product owns the object, which puts access-control
  logic in [shop](srn://acme/product/shop) and [billing](srn://acme/product/billing), and
  answering "who could have done this on 3 March" would require reading every
  object rather than the grants.
- **An external policy engine with its own language.** A real option, and the one
  security review pushed hardest. Rejected for this iteration on operability
  rather than capability: a second language with its own tests, its own
  deployment, and its own failure modes sits on the hot path of every request,
  and nothing in the 19 remaining grants needs a language. The door is left open
  — `resource-kind` branches are the boundary an engine would slot behind.
- **Do nothing.** Rejected. The 118 near-duplicate roles were already producing
  incidents in which a principal held a role for the wrong tenant and nobody
  noticed until a customer did.
