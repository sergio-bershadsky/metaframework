---
name: shared-catalog-access
kind: capability
version: 1
title: Read a described system at a URL, on the branch it was proposed on
summary: Move the catalog off the one machine that can render it, so that reviewing a description becomes something a team does at a link rather than something each person sets up.
status: review
owner: sergio-bershadsky
tags:
  - hosted
  - review
---

Somebody who did not write the catalog, and does not have it checked out, can
read it — the current version, or the version on the branch that proposes
changing it — by opening a link.

Every other capability in this solution is about *what a description contains*
and how well it holds together.
[solution-description](srn://metaframework/capability/solution-description) is
the description itself,
[derived-visualization](srn://metaframework/capability/derived-visualization)
draws it, [guided-authoring](srn://metaframework/capability/guided-authoring)
helps write it, and
[schema-interoperability](srn://metaframework/capability/schema-interoperability)
lets other tools consume it. This one is about *who can get to it*, which had
been assumed rather than provided.

## Why it was missing, and why that mattered

The founding position is that the description lives in the repository and the
portal is a read-only rendering of it. That is right, and it quietly makes
reading a described system conditional on having the repository, a Node
toolchain, and a running process. The catalog's own honesty about this is
already on the page: the only environment is
[local](srn://metaframework/environment/local), the only address that has ever
served a byte is `localhost:3000`.

For the actor this framework is aimed at, that is the binding constraint.
[reviewer](srn://metaframework/actor/reviewer) is defined as somebody reading a
catalog they did not write — and the setup cost falls entirely on exactly the
person least likely to pay it. A description nobody can open is not reviewable,
whatever its quality.

## The branch clause is the substance

"At a URL" alone would be a hosting feature. What makes this a capability worth
naming is *on the branch it was proposed on*: the framework's change model is
git-native
([0012-review-is-git-native](srn://metaframework/adr/0012-review-is-git-native)),
so a proposed change to a description is a branch, and reviewing it means
reading the description **as it would be**. Rendering only the default branch
would give a team the current state and leave every proposal to be read as a
diff — which is precisely the reading this whole framework exists to replace.

## Boundaries

- **Read-only, still.** This adds an address, not an editor. Nothing about
  hosting weakens the rule that the description is files changed through git.
- **No permission model of its own.** Who may read is whatever GitHub says. This
  capability does not include sharing, teams, roles or invitations, and adding
  any of them would be a different capability with a much larger surface.
- **Not a public gallery.** Nothing here is about publishing a catalog to
  readers who have no repository access. That is a coherent product and it is
  not this one.
- **One realizer, and it is unbuilt.** [hub](srn://metaframework/product/hub) is
  `lifecycle: concept`. This capability is currently realized by nothing, which
  makes it the only capability in this solution that describes an ability the
  system does not have.

## The strain: a capability with no delivery

The kind's contract expects a capability to be an ability the solution
*provides*. This one is an ability it has decided to provide. That is legal —
`status` describes the document and a capability may precede its realizer — and
it is worth flagging, because a catalog that accumulates aspirational
capabilities becomes a roadmap wearing a description's clothes.

The test to apply at review: if [hub](srn://metaframework/product/hub) is
rejected, this entity should be deprecated rather than left standing as an
intention. It exists to be the thing the product realizes, and it should not
outlive it.
