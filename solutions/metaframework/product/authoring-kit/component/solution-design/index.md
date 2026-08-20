---
name: solution-design
kind: component
version: 2
title: Solution design
summary: The skill that runs before any file exists — interview, decomposition heuristics, a proposed SRN tree, and a sign-off gate.
status: review
owner: sergio
component-type: library
lifecycle: released
relations:
  uses:
    - ../reference-bundle
tags:
  - decomposition
  - design
---

`skills/solution-design/` — `SKILL.md` (263 lines) plus
`references/worked-example.md` (262). One responsibility, statable in a sentence:
**turn a system described in prose into an agreed SRN tree, and stop at the
entity boundary.**

## Why it is separate from entity-authoring

It is the only part of the kit that runs when there is nothing on disk. Its
output is not files — it is a reviewed tree — and it owns a gate the writing
skills do not have:

> **Never create a directory before the tree has been reviewed.** Entities cannot
> be renamed or moved later — the SRN is the path, and renaming is a full swap
> procedure. A bad name costs a swap; a bad boundary costs many.

Six phases: fix the boundary, interview, draft the decomposition, propose the
tree and **stop**, write targets before referrers, check. Phase 3 is the gate;
phase 4's ordering exists because a referrer authored before its target is an
`E_SRN_DANGLING` the author then has to chase.

Merging this into
[entity-authoring](srn://metaframework/product/authoring-kit/component/entity-authoring)
would fuse a design phase with a writing phase, and would delete the only place
in the kit where the answer "this should not be an entity at all" is a normal
outcome.

## What it hands off

The skill's own words: "This skill stops at the entity boundary. Once the tree is
signed off, hand each entity to the skill that knows its kind: `model-data` for a
datamodel, `protocol-design` for a protocol, `add-entity` for everything else."
All three of those live in
[entity-authoring](srn://metaframework/product/authoring-kit/component/entity-authoring);
this component owns none of the per-kind contracts.

## What it is judgement about

The decomposition heuristics section (`SKILL.md` lines 146–218) is the part that
cannot be derived from the specification: whether a thing is a product or a
component, whether a datamodel should be promoted to a shared bucket, when a
sub-component is modelling a hierarchy and when it is only proving one. The
spec fixes what is *legal*; a legal tree can still be a bad description, and this
component is where that difference is argued.

## What it does not do

It does not validate. Phase 5 is a hand-off to
[catalog-validation](srn://metaframework/product/authoring-kit/component/catalog-validation)'s
command, not an implementation of a check. It does not review an existing
catalog — its own description routes that to
[architecture-review](srn://metaframework/product/authoring-kit/component/architecture-review).
And it does not remember: there is no persisted design document, no state between
sessions. The signed-off tree exists in a conversation until someone writes the
directories, and nothing in the repository records that the sign-off happened.
