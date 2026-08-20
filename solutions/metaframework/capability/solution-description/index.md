---
name: solution-description
kind: capability
version: 1
title: Say what a system is, and why it is that
summary: Write down a system's current structure and the decisions behind it as files, and have something say when the two stop hanging together.
status: review
owner: sergio-bershadsky
tags:
  - catalog
  - self-describing
---

Whoever owns a system can state, in files that live beside it, what it is
currently made of — the products, the components, the interfaces, the data that
crosses them — and, standing in the same place and addressable the same way, the
decisions that made it that shape rather than another one. Somebody else can then
read the description back, follow a reference to the thing it names, and be told
where the description contradicts itself.

The last clause is the one that separates this from writing documentation. A
description nothing checks is prose: it drifts, and the drift is discovered by a
reader who trusted it. Here the description is parsed, its references are
resolved, and every violation is reported as a coded diagnostic carrying the
catalog-relative path of the offending file — a path and a code, not a line
number, which is what the `Diagnostic` shape in
`framework/portal/src/lib/catalog/types.ts` actually carries. That is why the ability to *read a catalog back* is inside this
sentence rather than in a capability of its own.

Rebuild all of it — a different renderer, a different serialisation, a different
identity syntax — and the paragraph stands. What would break it is deciding that
the description and the thing described may live in two places, which is the
business decision this whole repository exists to refuse
([0002-filesystem-is-the-database](srn://metaframework/adr/0002-filesystem-is-the-database)).

## Boundaries

- **Ends at legality, not at quality.** Whether a catalog is *well-formed* is
  inside this capability and is mechanically decidable
  ([zero-error-catalog-load](srn://metaframework/requirement/zero-error-catalog-load)).
  Whether it is a *good* description of the system is a judgement, it is asked by
  a different skill, and nothing in this repository can answer it — the kit
  splits the two deliberately: `validate-catalog` asks "is it legal?",
  `review-solution` asks "is it any good?".
- **Includes the past.** A description whose earlier versions are unreachable is
  a snapshot, and half of what this catalog claims is that a change can be judged
  by reading its diff. The previous version of an entity is a `git show` and
  nothing else
  ([0009-git-backed-history](srn://metaframework/adr/0009-git-backed-history)),
  which is why
  [git-history](srn://metaframework/product/portal/component/git-history) carries
  a slice of this doing and not merely a feature of the page it feeds.
- **Does not include getting the description written.** Somebody sitting down in
  front of an empty directory and being told what to type is
  [guided-authoring](srn://metaframework/capability/guided-authoring). This
  capability begins with files that exist.
- **Says nothing about a renderer.** That the pages are Next.js and dark-only is
  a fact about [portal](srn://metaframework/product/portal), not about the
  business. The portal's "Realizes" list is where the current answer lives, and
  it is derived.

## Why the four realizers, and not the other twenty-seven

This is the capability most at risk of collecting the whole repository, so the
cut is stated rather than implied. A component realizes this only if the doing is
impossible without it:

- [specification](srn://metaframework/product/specification) — without the
  format there is nothing to write, and nothing addressable to write it about.
- [catalog-loader](srn://metaframework/product/portal/component/catalog-loader)
  — the files become a graph here, and this is the only place in the repository
  that says a description is illegal.
- [entity-view](srn://metaframework/product/portal/component/console/component/entity-view)
  — where a described entity becomes something a person reads.
- [git-history](srn://metaframework/product/portal/component/git-history) — the
  past, per the boundary above.

Deliberately **not** realizers, though each is in the neighbourhood:
[srn](srn://metaframework/product/portal/component/srn), because identity is the
grammar the loader enforces and giving it a second edge would count the same
slice twice;
[diagnostics-report](srn://metaframework/product/portal/component/console/component/diagnostics-report),
because it renders what the loader found and finds nothing itself;
[catalog-tree](srn://metaframework/product/portal/component/console/component/catalog-tree)
and the console chrome, because navigation and colour are how the description is
reached, not what it is.

## Not this

- *Render a catalog* is not the capability, it is what one realizer does. The
  distinction is worth keeping because the day the pages are served by something
  other than Next.js, this page must not need an edit.
- *Draw the system* is
  [derived-visualization](srn://metaframework/capability/derived-visualization),
  and it is separable in exactly the way that matters: delete every diagram and
  the description is still complete, because the requirement is that a picture
  never carries a fact the text does not
  ([every-diagram-has-a-text-equivalent](srn://metaframework/product/portal/requirement/every-diagram-has-a-text-equivalent)).
- *Publish a schema to the outside world* is
  [schema-interoperability](srn://metaframework/capability/schema-interoperability).
  A catalog can be complete, legal and readable while serving nothing to anyone.

## The vacuousness objection, and the answer

A capability this broad, in the solution whose entire subject is this doing, is
one step from "the solution is everything" — which the kind forbids by refusing
`solution` as a source of `realizes`
([capability.md](srn://metaframework/product/specification/component/kind-contracts)).
The answer is the boundary list above: three neighbouring doings were separated
out and can be removed one at a time without touching this sentence, and the four
realizers are four named components in two products rather than the whole
portfolio. It stays a real capability because it can be partly lost — take away
`git-history` and the description survives without its past; take away the
loader and it survives as unchecked prose.
