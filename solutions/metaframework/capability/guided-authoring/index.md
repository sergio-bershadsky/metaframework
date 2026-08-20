---
name: guided-authoring
kind: capability
version: 1
title: Get a conformant description written by somebody who has not read the rules
summary: Put a person or a model in front of an empty directory and have them produce a catalog that is legal, without them having read the specification first.
status: review
owner: sergio-bershadsky
tags:
  - authoring
  - llm
---

Somebody who does not know this format — a person arriving at it for the first
time, or a model runtime with no memory of it — can sit down and produce files
that are legal, placed where they will not have to move, and shaped the way a
reader of the rest of the catalog expects. They do it by being told what to do
next, one activity at a time, rather than by reading nearly ten thousand lines
and holding them in their head.

The capability has two halves and they are held by different products.
[specification](srn://metaframework/product/specification) holds the demand:
`framework/spec/index.md:119`, core principle 5, says an AI agent dropped into
the repository with no tooling must be able to navigate, cite and modify the
catalog correctly *using only this spec* — which is a claim about the spec's own
readability and the reason it pairs almost every rule with a worked example.
[authoring-kit](srn://metaframework/product/authoring-kit) holds the delivery: a
procedure per activity, a distilled reference that travels with the plugin, and
one command an author can run to find out whether they were right.

Both halves are inside one sentence because splitting them would let each be
true while the author still got it wrong. A spec nobody reads guides nobody; a
kit that disagrees with the spec guides them somewhere else.

## Boundaries

- **Ends where correctness stops being checkable.** The rules a machine enforces
  are a strict subset of the rules that matter, and this capability covers the
  guidance for both — the four required ADR headings, a requirement's
  acceptance criteria, whether an edit is additive or a swap. None of those fires
  a diagnostic. That asymmetry is described on
  [ai-author](srn://metaframework/actor/ai-author), which is the actor standing
  on the difference.
- **Includes evolving what already exists.** The instinctive fix — rename, move,
  narrow — is exactly what the framework forbids, and nothing in the repository
  compares an entity against its predecessor, so a narrowing edit and a `git mv`
  both pass the check. Being told *before* making the change is therefore part
  of the doing, not a nicety
  ([entity-evolution](srn://metaframework/product/authoring-kit/component/entity-evolution)).
- **Stops at legality plus advice.** Whether the resulting description is any
  *good* is asked by
  [architecture-review](srn://metaframework/product/authoring-kit/component/architecture-review),
  and its answer is a judgement, not a verdict. The judgement is inside this
  capability only as far as "here are fifteen candidates worth looking at";
  deciding is the reader's.
- **Says nothing about which model.** The runtime is
  [ai-author](srn://metaframework/actor/ai-author), an external system whose
  internals this catalog does not describe. Swap it and this page does not
  change.

## Where it is realized weakly, and the evidence

Recorded here rather than in a footnote, because a capability page that only
lists realizers is a marketing sentence:

- **The kit's guidance is stale in a way that a follower would act on.**
  `marketplace/plugins/metaframework/skills/validate-catalog/SKILL.md:25` names
  the two files that run, and `:29` says a pass looks like
  `Test Files  2 passed (2)`. Measured 2026-08-20, `npx vitest run
  src/lib/catalog` from `framework/portal` prints
  `Test Files  10 passed (10)` and `Tests  204 passed | 5 todo (209)`, so a
  model following those two sentences literally reads a correct run as a changed
  one. The obligation it violates is
  [kit-works-without-the-spec](srn://metaframework/product/authoring-kit/requirement/kit-works-without-the-spec),
  which is a `must` with nothing enforcing it.
- **The spec does not meet its own bar for the half of this capability it
  carries.** Eleven of sixty-eight rule-bearing sections carry no example, and
  forty-two of ninety-five error codes are never shown being triggered
  ([every-rule-has-an-example](srn://metaframework/product/specification/requirement/every-rule-has-an-example),
  measured 2026-08-20 over fourteen documents — before `kinds/capability.md`,
  `kinds/journey.md` and `kinds/metric.md` were part of the set, so the
  denominator has since grown and the counts have not been retaken). An example
  is the part of a rule a first-time author can copy, so those sections are where
  this capability is thinnest.
- **The fallback path has never been exercised.** The kit is built to work
  installed into a repository that has no `framework/spec/` on disk. Every
  catalog in this repository was authored beside the spec, so there is no
  evidence at all behind the case the reference bundle exists for.

## Not this

- *Writing the specification* is not this capability — that is somebody
  authoring a normative document, and it is out of scope for the whole solution
  in the sense that no skill and no page describes how to do it.
- *Validating a finished catalog* is not it either. The check the kit ends on
  belongs to
  [catalog-loader](srn://metaframework/product/portal/component/catalog-loader)
  and is a slice of
  [solution-description](srn://metaframework/capability/solution-description);
  what is guided-authoring is knowing which command to run and how to read what
  it printed.
- *A CLI.* There is none, by decision
  ([0011-no-cli-in-v1](srn://metaframework/adr/0011-no-cli-in-v1)). The guidance
  is prose a model reads, and the only executable artifact in the kit is
  `skills/review-solution/scripts/catalog_facts.py` — 838 lines of stdlib-only
  Python, measured 2026-08-20 — which prints candidates for a human to judge.
