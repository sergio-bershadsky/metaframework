---
name: entity-evolution
kind: component
version: 2
title: Entity evolution
summary: The only part of the kit permitted near a published entity — it decides additive edit versus swap, then carries out whichever it is.
status: review
owner: sergio
component-type: library
lifecycle: released
relations:
  uses:
    - ../reference-bundle
tags:
  - evolution
  - swap
---

`skills/evolve-entity/` — `SKILL.md` (234 lines) plus
`references/swap-walkthrough.md` (279). Two mechanisms carry every change: an
additive edit in place with a `version` bump, and a **swap** — a successor entity
that supersedes the old one. Nothing is ever deleted, moved or renamed.

## Why it owns a component of its own

It is the only part of the kit allowed to touch something that already exists.
All three creation skills and both commands hand off to it by name, and the
reason they do is stated in `commands/entity-new.md`: "the framework forbids
removing, renaming, narrowing and moving, and the instinctive fix is usually one
of those."

The decision it owns — additive or swap — is the one the framework's central rule
turns on. Its classification table is a contract-surface test, not a diff test,
and it carries a mechanical form for datamodels: **version N+1 MUST accept every
instance version N accepted.** A document that validated yesterday and fails
today is a swap, at any version number.

## The swap, and the window it defines

Six ordered steps: name the successor, create it (`version: 1`, `status: draft`,
`supersedes` on the *successor* only), census the referrers, migrate them one at
a time, deprecate the predecessor, verify. The skill's own framing of why the
order matters — "The window between step 1 and step 4 is where nothing breaks:
both entities are live and referrers move one at a time."

The census recipe is the part that would be wrong if it were derived from the
spec instead of from the repository. References reach an entity in four
syntaxes — solution-absolute, relative, `srn://` prose links and canonical schema
URLs — so the skill greps the **bare name** rather than any one path form, then
classifies each hit: a `relations` edge or a schema `$ref` is a live referrer, a
schema's own `x-srn` is self-identification, a prose mention may stay.

Verification hands off to
[catalog-facts](srn://metaframework/product/authoring-kit/component/architecture-review/component/catalog-facts):
`R_DEPRECATED_LIVE_REF` and `R_SWAP_UNFINISHED` name exactly the two ways a swap
is left half-done.

## Two positions worth reading in full

**`title` is free, `name` is the address.** When the complaint is that something
is called the wrong thing, the skill fixes `title` and `summary` in place and
leaves the path alone; the rename-swap is reserved for when the concept changed,
not the wording. Renaming a container is named as the most expensive change in
the framework — every descendant's path changes, so a product with twelve
entities beneath it costs thirteen swaps.

**Never delete, with one honest exception.** If `git log --oneline -- <path>`
comes back empty, no commit ever contained the entity, so removing the directory
undoes an edit rather than deleting an entity. The skill requires running the
command rather than assuming it, and forbids stretching the reasoning to
something a colleague may already have pulled. That is not a loophole in the
spec; it is a judgement about what the catalog has actually seen, and it is the
kind of thing only a procedure document can say.

## What nothing enforces

The additive rule this component exists to uphold is checked by nobody.
`E_VER_REGRESSION` is implemented in `framework/portal/src/lib/history/git.ts`
and is never run over `solutions/`. Nothing in the repository compares a schema,
a frontmatter contract or an acceptance criterion against its predecessor, so
removing a property, narrowing an enum or `git mv`-ing a directory produces no
diagnostic at all — only a wrong catalog. The whole obligation is carried by this
skill being read, which is the condition
[additive-only-evolution](srn://metaframework/requirement/additive-only-evolution)
records at solution level.

The skill also assumes a git repository present and unshallow where the portal
runs, because `@N` pins resolve through the version→commit index. It says so; it
cannot check it.
