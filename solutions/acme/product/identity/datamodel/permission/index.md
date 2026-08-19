---
name: permission
kind: datamodel
version: 2
title: Permission
summary: One capability over one resource kind — a union tagged by resource-kind, composed onto the access-grant base.
status: approved
owner: team-identity
usage: both
abstract: false
tags:
  - identity
  - union
---

# Permission

The smallest thing [acl](srn://acme/product/identity/component/acl) can evaluate: a set
of actions over one resource kind, inside a scope, during an interval. Four
branches today — `order`, `ledger-entry`, `catalog-item`, `identity-account` —
each tagged by a distinct `const` on `resource-kind` and each carrying the
qualifiers that only make sense for that kind.

## Two applicators, doing different jobs

The root schema carries both an `allOf` and a `oneOf`, and they are not in
competition. The `allOf` composes
[access-grant](srn://acme/product/identity/datamodel/access-grant@1), which is what every
permission *is* regardless of branch: labelled, scoped, time-bounded, auditable.
The `oneOf` chooses what this one is *about*. In JSON Schema every applicator at
the same level is conjoined, so an instance must satisfy the base and exactly one
branch — which is precisely the sentence a reader wants to be able to say out
loud about the model.

## Why the qualifiers cannot live on the base

`order-range` is meaningful for orders and meaningless for a chart-of-accounts
prefix; `account-prefix` is meaningful for ledger legs and meaningless for a SKU
glob. A flat model would carry all of them as optional properties, and every
consumer would have to know by convention which combinations are real. That is
the whole failure this union exists to prevent, and it is the reason the tag is
required in every branch rather than merely present: an untagged variant makes a
reader guess intent from which optional fields happen to be filled in.

`requires-multi-factor` appears on three branches with two different defaults —
`false` for orders, `true` for ledger and account administration. Putting it on
the base with one default would have made the safe value the wrong one somewhere.
Per-branch defaults let the schema state the house rule instead of a compromise.

## Branches as `$defs`, not as entities

[payment-method](srn://acme/product/shop/datamodel/payment-method@1) puts each branch
in its own entity because
[order](srn://acme/product/shop/component/checkout/component/payment/datamodel/order@3) references
[card-payment](srn://acme/product/shop/datamodel/card-payment@1) directly and needs an
address for it. Nothing references an order-permission on its own — a permission
only ever appears inside a permission — so the branches are local `$defs` and
their `$ref`s are JSON Pointers. The rule that follows from that pair of cases:
a branch earns its own entity when something outside the union addresses it, and
not before.

## Adding a branch is additive; retagging is not

Version 2 added the `identity-account` branch, which is why this entity is at
`@2` while its siblings are at `@1`. Appending a branch with a fresh `const` is
legal in place: every consumer that switches on `resource-kind` falls through to
its default and denies, which is the correct failure direction for an
access-control model. Reusing an existing tag for a different shape is illegal at
any version, because it changes what an already-stored grant means.

Version 2 is also why the default-deny behaviour is stated as a requirement
rather than left to each caller — see
[0001-attribute-based-access](srn://acme/product/identity/adr/0001-attribute-based-access).
