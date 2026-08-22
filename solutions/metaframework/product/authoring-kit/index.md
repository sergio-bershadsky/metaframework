---
name: authoring-kit
kind: product
version: 4
title: Authoring kit
summary: A Claude Code plugin distributed through a Claude marketplace — seven skills, three commands, one agent and a distilled copy of the spec, teaching a model to author and evolve a catalog.
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
  realizes:
    - /capability/guided-authoring
tags:
  - plugin
  - claude-code
  - authoring
---

`marketplace/plugins/metaframework/` — a Claude Code plugin, distributed through
the Claude marketplace at `marketplace/`: seven skills, three commands, one
agent, nine shared reference files, nine skill-local reference files and one
Python script — markdown and Python, and nothing that compiles. `plugin.json`
is a short manifest and the only file in the tree that is neither.

It ships no build, no binary and no runtime. Its whole substance is prose
written to be read by a model at the moment it is about to write a catalog
file. That is a real, well-known structure — `skills/`, `commands/`, `agents/`,
`.claude-plugin/` — and this catalog names it as what it is rather than as an
agnostic authoring tool it is not.

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
instructions for writing files inside a product whose stated design claim is
that it only reads them.

## What it is made of

Two components, because the product contains exactly one boundary along which
its parts ship, fail and drift separately:

- [plugin](srn://metaframework/product/authoring-kit/component/plugin) — the
  deliverable itself: the seven skills, the three commands, the reviewer agent,
  the `catalog_facts.py` script and the manifest. A skill is a feature of the
  plugin, not a component — it cannot ship, version, fail or be owned
  separately from the plugin that carries it — so the skills are a table in
  that component's prose and their `SKILL.md` files are its artifacts, the same
  way `schema.json` is a datamodel's artifact.
- [reference-bundle](srn://metaframework/product/authoring-kit/component/reference-bundle)
  — the distilled spec, carried so the rules travel with the plugin. It earns
  the separate component because it has a failure mode nothing else in the
  plugin has: it distils another product, an installed plugin cannot read
  `framework/spec/`, and drift between spec and bundle has already happened
  twice in this project's history.

How the skills are cut — by activity, never by entity kind — is a recorded
decision,
[0001-skills-organised-by-activity](srn://metaframework/product/authoring-kit/adr/0001-skills-organised-by-activity),
and the seam is stated in `marketplace/README.md`: the three creation skills
are disjoint by kind, the two audit skills disjoint by question.

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

The kit documents enforcement it does not perform. Its `validate-catalog` skill
is a reader's manual over `framework/portal/src/lib/catalog`, which belongs to
a different product; the pass condition it teaches is
`cd framework/portal && npx vitest run src/lib/catalog`, run by a human or a
model. That cross-product edge is authored on
[plugin](srn://metaframework/product/authoring-kit/component/plugin), where it
belongs, and it is the honest picture rather than an embarrassment: the kit's
job is to know what the check means, not to be the check.

## Where it is already drifting

`skills/validate-catalog/SKILL.md:26` says "Two files run";
the suite under `framework/portal/src/lib/catalog` has grown well past two, and
the run prints what it finds. Nothing in the repository detects that: no test, no lint, no CI
compares the kit's claims against the portal or the spec.
[kit-works-without-the-spec](srn://metaframework/product/authoring-kit/requirement/kit-works-without-the-spec)
records the obligation and the fact that nothing enforces it.

## What does not exist

No release. Zero git tags, no changelog, no publish step, no registry entry;
the documented install path in `marketplace/README.md` is an absolute local
filesystem path on the author's machine, with "from a git remote, point
`marketplace add` at the repository instead" offered untested.
`marketplace/.claude-plugin/marketplace.json` lists this one plugin with
`source: "./plugins/metaframework"` — a relative path inside this repository,
not a remote anyone else can reach. `lifecycle: incubating` is that fact, not a
hedge.

No runtime but Claude, either. Portability to other agent runtimes is
aspiration, and this catalog does not model aspiration.

There is also no packaging component in this tree. `marketplace.json` plus
`plugin.json` is about forty lines of declaration with no behaviour, no test
and no consumer inside the repository; install and distribution are stated
here, in prose, rather than given a directory. That omission is a decision,
recorded so it is not read as an oversight.
