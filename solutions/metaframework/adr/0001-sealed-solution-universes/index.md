---
name: 0001-sealed-solution-universes
kind: adr
version: 1
title: Solutions are sealed universes
summary: No reference of any kind may cross from one solution into another, on any surface, and the parser enforces it.
status: review
owner: sergio-bershadsky
decision-status: accepted
date: "2026-08-19"
deciders:
  - sergio
relations:
  uses:
    - /product/portal/component/srn
tags:
  - identity
  - founding
---

# Solutions are sealed universes

## Context

The framework was designed as a monorepo holding many catalogs: `solutions/`
contains one directory per described system, and a single portal renders all of
them. That immediately raises the question of what one catalog may say about
another. A shared `money` datamodel across two solutions is an obvious
convenience, and the first thing anyone reaches for.

It is also the thing that makes a catalog un-reviewable. A solution whose
description depends on a sibling cannot be read, moved, extracted or handed over
as a unit — the reader has to have the other tree, at the right revision, to
know what the first one means. Cross-solution sharing was already on the founding
record's deferred list; what was undecided was whether crossing was merely
discouraged or impossible.

## Decision

Solutions are sealed universes. **No reference of any kind may cross a solution
boundary, on any surface** — frontmatter `relations`, JSON Schema `$ref`,
protocol and workflow YAML, prose markdown links, and kind-specific reference
fields alike. A crossing reference is `E_SRN_CROSS_SOLUTION`.

A real dependency on a system outside the solution is described *locally*, at the
fidelity this solution needs, as an `external` component or as an
`external-system` actor.

## Consequences

- The rule is **grammar, not review**. `resolveRef()` in
  `framework/portal/src/lib/srn/srn.ts` throws `E_SRN_CROSS_SOLUTION` when a
  parsed `srn://` names a different authority, and again when a reference begins
  `//`, which would change the authority by network-path. Nothing downstream has
  to remember the rule.
- `..` cannot climb out either. From `srn://acme/product/shop` the path is two
  segments, so `../..` lands exactly on the solution and `../../..` is
  `E_SRN_SYNTAX` — the parser rejects the climb rather than clamping it at the
  root, so an over-deep relative path is a visible error rather than a silent
  re-target.
- A schema crosses the boundary in a form that is *plain to read* rather than
  counted: the first path segment after the canonical host is the solution, so a
  foreign `$ref` is caught on inspection with no normalisation involved.
- The cost is duplication, and it is accepted. Two solutions that both talk to
  the same payment processor describe it twice, and the two descriptions may
  disagree. That is a smaller problem than a catalog that cannot be read alone.
- This catalog pays the cost immediately. It describes the tool that renders
  `solutions/acme` and `solutions/brass`, and it may not reference either of
  them — so every claim about them here is prose citing a path, never an edge.
  Nothing in this repository is more tempted to break the rule, which is why the
  rule is in the parser.
- Extraction becomes trivial: a solution directory plus its `.git` history is a
  complete, self-contained artifact.

## Alternatives considered

- **A shared or global solution that others may reference.** Rejected: it
  reintroduces the coupling under a different name. Every catalog would depend on
  the shared one, which then cannot be changed without reviewing all of them, and
  a "global" entity has no owner accountable for it.
- **Discourage crossing in prose, do not enforce it.** Rejected on evidence about
  this repository specifically. Unenforced rules in this framework have drifted
  within a day — the plugin's reference bundle already disagrees with the spec it
  distils, because nothing checks it. A boundary that matters is a boundary the
  parser holds.
- **Allow crossing with an explicit opt-in field.** Rejected: it makes the
  sealing conditional, so a reader can no longer answer "is this catalog
  self-contained?" without reading every file in it. The property is only worth
  anything if it is unconditional.
- **Allow prose links to cross while forbidding structured references.** Rejected
  because prose links are how a reader actually navigates. A description whose
  paragraphs point outside the tree is not extractable in any useful sense, even
  if its graph is.
