---
name: reference-bundle
kind: component
version: 3
title: Reference bundle
summary: Nine distilled reference files carried inside the plugin, because an installed plugin cannot see framework/spec on disk.
status: review
owner: sergio
component-type: library
lifecycle: released
relations:
  uses:
    - /product/specification/component/core-contracts
    - /product/specification/component/kind-contracts
  implements:
    - /product/authoring-kit/requirement/kit-works-without-the-spec
tags:
  - reference
  - distillation
---

`skills/_shared/references/` — nine markdown files, 3,562 lines:
`environments.md` (650), `protocols.md` (648), `journeys.md` (481),
`frontmatter.md` (451), `schemas.md` (388), `structure.md` (354), `srn.md`
(273), `evolution.md` (181), `decomposition.md` (136).

Responsibility in one sentence: **carry the spec where the spec cannot travel.**

## Why it is a component, and the only other one

It holds no `SKILL.md`, so Claude Code does not auto-discover it —
`marketplace/README.md` says so outright: "`skills/_shared/` holds no `SKILL.md`
and is therefore not itself a skill — it is the shared reference bundle the
skills read." It sits under `skills/` only because that is where the plugin
loader looks. `library` is the literal type: consumed by reference, exposing no
interface of its own, running inside its consumers.

It is the one boundary inside this product that earns a component of its own,
against the [plugin](srn://metaframework/product/authoring-kit/component/plugin)
that carries everything else. The test it passes is a distinct failure mode:
this directory distils another product, an installed plugin cannot read
`framework/spec/`, and **drift between spec and bundle is a defect class that
has already occurred** — stale claims in the bundle's consumers were found by
reading, twice, and recorded on
[kit-works-without-the-spec](srn://metaframework/product/authoring-kit/requirement/kit-works-without-the-spec).
Nothing else in the plugin can fail that way.

## What it is a distillation of

9,832 lines of `framework/spec/` become 3,562 — a 2.8× compression (9,832 /
3,562 = 2.76) that drops worked examples, rationale and the spec's own
cross-referencing, and keeps the rules an author must not get wrong. Eight of
the nine files name a spec document in their opening blockquote and concede
precedence to it. `srn.md` opens:

> Distilled from `framework/spec/srn.md` (and the placement projection in
> `framework/spec/structure.md`). **When `framework/spec/` is present in the
> repository, it is authoritative and wins over this file.** This bundled copy
> exists because an installed plugin cannot see the repo spec.

That concession is why the outgoing edges point at
[core-contracts](srn://metaframework/product/specification/component/core-contracts)
and [kind-contracts](srn://metaframework/product/specification/component/kind-contracts)
rather than the other way round. The bundle is downstream of the spec by its own
written admission, per file.

The mapping is not one-to-one. `environments.md` distils four kind documents at
once — environment, actor, ADR and requirement — because those four are the
kinds whose contract is entirely frontmatter fields plus one enforced body
heading, and an author meets them together.

The ninth file, `decomposition.md`, is the exception it declares itself to be:
distilled not from a spec document but "from this repository's own
recomposition history and a measured comparison against Atlassian Compass …
and the Backstage system model", carrying the calls "the spec deliberately
leaves open: `structure.md` says where a component may live, never whether it
deserves to exist." It still opens by conceding precedence to `framework/spec/`
wherever the two overlap.

## The duplication is deliberate, and it is the risk

Two copies of a rule set are two things that can disagree. The kit accepts that
trade because the alternative is a plugin that only works inside this monorepo,
and states the mitigation as a rule rather than a hope: the spec wins wherever
it is visible. What it does not have is a mechanism. **No test, no lint and no
script compares this directory against `framework/spec/`.** A spec bump moves
seventeen documents and leaves the distillations untouched, and nothing goes
red.

That is the whole content of
[kit-works-without-the-spec](srn://metaframework/product/authoring-kit/requirement/kit-works-without-the-spec),
which this component claims, and which is currently met by discipline alone.

## What it does not carry

No procedure. The bundle is rules; the ordering, the judgement calls and the
traps live in the skills that read it, and every skill says "do not restate
those rules back at the user". No `kinds/solution.md`, `kinds/product.md` or
`kinds/component.md` distillation exists as its own file either — the container
kinds' *contracts* are folded into `structure.md` and `frontmatter.md`, because
what an author needs from them is placement and fields; the judgement of what
deserves to be a component is `decomposition.md`'s, and that judgement is
precisely what the kind documents do not legislate.

Nothing in the portal reads this directory, and nothing in this directory reads
the portal.
