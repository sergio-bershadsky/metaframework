---
name: role
kind: datamodel
version: 1
title: Role
summary: A named bundle of permissions an administrator can hand out — resolved by value on the wire.
status: approved
owner: team-identity
usage: both
abstract: false
tags:
  - identity
---

# Role

What an [identity-admin](srn://acme/actor/identity-admin) actually assigns. A role
is a bundle of [permission](srn://acme/product/identity/datamodel/permission@2) documents
with a stable `code`, and it exists because humans reason about jobs — "refund
desk", "catalog editor" — while
[acl](srn://acme/product/identity/component/acl) reasons about capabilities.

## The same base as permission, on purpose

Role composes
[access-grant](srn://acme/product/identity/datamodel/access-grant@1) through `allOf`,
exactly as permission does. That is not tidiness: a role is itself a grant, it is
scoped to a tenant or global, it starts and ends at a moment, and someone is
answerable for having created it. Every question an auditor asks about a
permission has the same answer shape when asked about a role, and sharing the
base is what guarantees the two answers cannot drift apart.

The two descendants then diverge completely. Permission adds a `oneOf` over
resource kinds; role adds a bundle and a graph. Neither knows about the other's
additions, which is what makes the base worth having rather than a place to
dump fields.

## Grants by value, references by id

`grants` embeds whole permission documents. `inherits` and `assignable-by` carry
bare UUIDs. The asymmetry is deliberate and it is a latency decision.

A caller inside the
[authz-check-latency](srn://acme/product/identity/requirement/authz-check-latency) budget
cannot follow a chain of id references and stay under 10 ms, so what
[acl](srn://acme/product/identity/component/acl) serves is the *resolved* projection:
inheritance is already flattened into `grants` before the document leaves the
service. The store keeps permissions normalized; the contract on the wire is
denormalized. Both facts are true and they belong to different layers.

`inherits` survives on the wire anyway, because an administrator inspecting a
role needs to see where a grant came from, and a flattened bundle with no
provenance is unreviewable. It carries ids rather than documents for the obvious
reason: the graph has diamonds, and inlining it would make one role's document
exponential in the depth of the hierarchy.

## Code is forever

`code` is matched on; `label` — inherited from the base — is displayed. Renaming
a role means creating a new one and moving assignments, because somewhere in the
solution a deployment manifest or a break-glass procedure has the old code
written down, and a silent rename turns those into a permission-denied at the
worst possible moment.

## Why roles did not turn out to be enough

They are a distribution mechanism, not a decision procedure. The moment a grant
had to depend on a property of the resource — this order, this tenant, this
account prefix — the role-only model started producing roles per combination, and
[0001-attribute-based-access](srn://acme/product/identity/adr/0001-attribute-based-access)
records where that ended.
