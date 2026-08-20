---
name: authoring-kit
kind: product
version: 1
title: Authoring kit
summary: The Claude Code plugin that teaches a model to author and evolve a catalog — seven skills, three commands, one agent, and a distilled copy of the spec.
status: review
owner: sergio
lifecycle: incubating
primary-actors:
  - /actor/ai-author
  - /actor/catalog-author
relations:
  depends-on:
    - /product/specification
  implements:
    - requirement/kit-works-without-the-spec
tags:
  - plugin
  - claude-code
  - authoring
---

`marketplace/plugins/metaframework/` — a Claude Code plugin: seven skills, three
commands, one agent, seven shared reference files, eight skill-local reference
files and one Python script. 7,488 lines of markdown and Python (`wc -l` over
every file in the plugin except `plugin.json`, which is 19 lines of manifest).

It ships no build, no binary and no runtime. Its whole substance is prose written
to be read by a model at the moment it is about to write a catalog file.

## Why this is a product and not a component of the portal

Three axes, and it diverges on all three. **Distribution:** it is installed
(`/plugin marketplace add …` then `/plugin install metaframework@metaframework`),
carries its own manifest and its own version — `plugin.json` and
`marketplace.json` both say `0.1.0` — and moves when neither the portal nor the
spec has. **Audience:** the reader it is written for is
[ai-author](srn://metaframework/actor/ai-author), a model runtime the portal has
no surface for at all; the portal is a read-only renderer aimed at a human
opening a page. **Form:** it is markdown that becomes part of a model's context,
not a Next.js application. Folding it into the portal would put a set of
instructions for writing files inside a product whose stated design claim is that
it only reads them.

## Its decomposition is argued in its own README

`marketplace/README.md` states the seam and this catalog follows it rather than
inventing one:

> The three creation skills are disjoint by kind: `datamodel` → `model-data`,
> `protocol` → `protocol-design`, everything else → `add-entity`. The two audit
> skills are disjoint by question: `validate-catalog` asks "is it legal?",
> `review-solution` asks "is it any good?".

Followed **by responsibility, not by file**. The three creation skills are one
component — [entity-authoring](srn://metaframework/product/authoring-kit/component/entity-authoring)
— because three components whose summaries differ only by which kind they accept
is precisely the "two components whose summaries you cannot tell apart" failure
that the kit's own `agents/catalog-reviewer.md` tells a reviewer to flag. The two
audit skills stay apart because they answer different questions, and the question
is the component boundary here.

## What it is made of

- [reference-bundle](srn://metaframework/product/authoring-kit/component/reference-bundle)
  — the distilled spec, carried so the rules travel with the plugin.
- [solution-design](srn://metaframework/product/authoring-kit/component/solution-design)
  — the phase before any file exists; its output is an agreed SRN tree.
- [entity-authoring](srn://metaframework/product/authoring-kit/component/entity-authoring)
  — one entity, any kind, once its placement is settled.
- [entity-evolution](srn://metaframework/product/authoring-kit/component/entity-evolution)
  — the only part permitted near a published entity.
- [catalog-validation](srn://metaframework/product/authoring-kit/component/catalog-validation)
  — legality: run the check, read the cascade, know what it does not cover.
- [architecture-review](srn://metaframework/product/authoring-kit/component/architecture-review)
  — judgement, with [catalog-facts](srn://metaframework/product/authoring-kit/component/architecture-review/component/catalog-facts)
  underneath it as the only executable artifact in the kit.
- [commands](srn://metaframework/product/authoring-kit/component/commands)
  — 130 lines that route and nothing else.

## The dependency, and its direction

`depends-on: /product/specification`. Every skill, the agent and
`commands/solution-new.md` repeat the same two-source rule in their own words:
read `framework/spec/` when the repository is present, because it is
authoritative; otherwise read
`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/`. The reason is stated in
`marketplace/README.md` — an installed plugin cannot see `framework/spec/` on
disk.

Nothing in the specification depends on the kit. Turn that around and the
distillation stops being a distillation.

## What it owns no code for

The kit documents enforcement it does not perform. `validate-catalog` is a
reader's manual over `framework/portal/src/lib/catalog`, which belongs to a
different product; the pass condition it teaches is
`cd framework/portal && npx vitest run src/lib/catalog`, run by a human. That
cross-product edge is authored on
[catalog-validation](srn://metaframework/product/authoring-kit/component/catalog-validation),
where it belongs, and it is the honest picture rather than an embarrassment: the
kit's job is to know what the check means, not to be the check.

## Where it is already drifting

`skills/validate-catalog/SKILL.md` tells its reader "Two files run" and "A pass
looks like `Test Files  2 passed (2)`". Today `framework/portal/src/lib/catalog`
holds four test files — `fingerprint.test.ts`, `fixture-check.test.ts`,
`load.test.ts`, `tree.test.ts` — and the run prints four. Nothing in the
repository detects that: no test, no lint, no CI compares the kit's claims
against the portal or the spec.
[kit-works-without-the-spec](srn://metaframework/product/authoring-kit/requirement/kit-works-without-the-spec)
records the obligation and the fact that nothing enforces it.

## What does not exist

No release. Zero git tags, no changelog, no publish step, no registry entry;
the documented install path in `marketplace/README.md` is an absolute local
filesystem path on the author's machine, with "from a git remote, point
`marketplace add` at the repository instead" offered untested. `lifecycle:
incubating` is that fact, not a hedge.

There is also no packaging component in this tree. `marketplace.json` plus
`plugin.json` is about forty lines of declaration with no behaviour, no test and
no consumer inside the repository; install and distribution are stated here, in
prose, rather than given a directory. That omission is a decision, recorded so it
is not read as an oversight.
