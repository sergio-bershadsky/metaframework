---
name: reference-bundle
kind: component
version: 2
title: Reference bundle
summary: Seven distilled spec files carried inside the plugin, because an installed plugin cannot see framework/spec on disk.
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

# Reference bundle

`skills/_shared/references/` — seven markdown files, 2,571 lines:
`environments.md` (650), `protocols.md` (648), `schemas.md` (388),
`structure.md` (260), `srn.md` (229), `frontmatter.md` (218), `evolution.md`
(178).

Responsibility in one sentence: **carry the spec where the spec cannot travel.**

## Why it is a component and not a skill

It holds no `SKILL.md`, so Claude Code does not auto-discover it —
`marketplace/README.md` says so outright: "`skills/_shared/` holds no `SKILL.md`
and is therefore not itself a skill — it is the shared reference bundle the
skills read." It sits under `skills/` only because that is where the plugin
loader looks. `library` is the literal type: consumed by reference, exposing no
interface of its own, running inside its consumers.

## What it is a distillation of

7,279 lines of `framework/spec/` become 2,571 — a 2.8× compression that drops
worked examples, rationale and the spec's own cross-referencing, and keeps the
rules an author must not get wrong. Each file names its source in its opening
blockquote. `srn.md` opens:

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
once — environment, actor, ADR and requirement — because those four are the kinds
whose contract is entirely frontmatter fields plus one enforced body heading, and
an author meets them together.

## The duplication is deliberate, and it is the risk

Two copies of a rule set are two things that can disagree. The kit accepts that
trade because the alternative is a plugin that only works inside this monorepo,
and states the mitigation as a rule rather than a hope: the spec wins wherever it
is visible. What it does not have is a mechanism. **No test, no lint and no
script compares this directory against `framework/spec/`.** A spec bump moves
fifteen documents and leaves seven distillations untouched, and nothing goes red.

That is the whole content of
[kit-works-without-the-spec](srn://metaframework/product/authoring-kit/requirement/kit-works-without-the-spec),
which this component claims, and which is currently met by discipline alone.

## What it does not carry

No procedure. The bundle is rules; the ordering, the judgement calls and the
traps live in the skills that read it, and every skill says "do not restate those
rules back at the user". No `kinds/solution.md`, `kinds/product.md` or
`kinds/component.md` distillation exists as its own file either — the container
kinds are folded into `structure.md` and `frontmatter.md`, because what an author
needs from them is placement and fields, not the C1–C7 rationale.

Nothing in the portal reads this directory, and nothing in this directory reads
the portal.
