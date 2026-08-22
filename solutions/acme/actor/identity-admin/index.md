---
name: identity-admin
kind: actor
version: 2
title: Identity administrator
summary: Human operator who grants and revokes access, and who must answer to an auditor for both.
status: approved
owner: team-identity
actor-type: human
goals:
  - Give a colleague the least access that lets them do their job today.
  - Cut off every session an account holds, in one action, during an incident.
  - Show an auditor who could have done a given thing on a given date.
relations:
  uses:
    - /product/identity/component/acl
    - /product/identity/component/registration
tags:
  - identity
  - internal
---

The person who hands out access and takes it away. Distinct from
[support-agent](srn://acme/actor/support-agent), who acts *on* customer data
within permissions someone else granted, and from
[merchant-operator](srn://acme/actor/merchant-operator), who runs a shop. An
identity administrator changes what other principals may do, which is the one
power that cannot be delegated to the system it governs.

## Why this actor exists separately

Because the blast radius is different in kind. Every other human actor in this
catalog can do damage bounded by their own grants; this one can widen anybody's.
Keeping the role separate is what lets a reviewer ask the only question that
matters about an access-control system — how many people hold this actor's
grants, and does the number go down — without disentangling it from ordinary
operations work.

The third goal is the one that shapes the design rather than the process. "Who
could have done this on 3 March" is a question about grants that were in force
at a past instant, not about grants that are in force now, which is why
[access-grant](srn://acme/product/identity/datamodel/access-grant@1) carries
`effective-from` and `effective-to` instead of being deleted on revocation.

## Boundaries

- The administrator is never the decision point. They author
  [role](srn://acme/product/identity/datamodel/role@1) and
  [permission](srn://acme/product/identity/datamodel/permission@2) documents;
  [acl](srn://acme/product/identity/component/acl) evaluates them. An administrator who
  could override a single decision would make every decision unexplainable.
- They hold no standing access to customer data. Reading an
  [account](srn://acme/product/identity/datamodel/account@1) is itself an authorized
  action, checked through the same
  [authorization-check](srn://acme/product/identity/protocol/authorization-check) path
  every other caller uses, and recorded through the
  [auditable](srn://acme/datamodel/auditable@1) fields on the record they touched.
- Machine administration — a pipeline that provisions service accounts — is
  [release-bot](srn://acme/actor/release-bot) borrowing a principal, not this
  actor with a script.

## No protocol names this actor

`W_ACTOR_ORPHAN` is raised against this page and the finding is true. The only
protocol the identity product owns is
[authorization-check](srn://acme/product/identity/protocol/authorization-check),
whose four participants are all components evaluating a decision between
themselves, and neither acme journey — [first-purchase](srn://acme/journey/first-purchase),
[coupon-redemption](srn://acme/journey/coupon-redemption) — gives an
administrator a step. Nothing in this catalog describes granting or revoking
access as a conversation.

Adding this actor to `authorization-check`'s participant list would clear the
warning by misstating that protocol, which has no human in it and is not where a
grant is authored. The honest way to clear it is to write the
access-administration protocol the three goals above imply, and nobody has. That
is a modelling gap, not a missing edge, so the warning stays until it is closed.
