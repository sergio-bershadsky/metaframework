---
name: catalog-load-errors
kind: metric
version: 2
title: Catalog load errors
summary: The number of error-severity diagnostics the loader produces over the shipped solutions/ tree, read at one commit.
status: review
owner: sergio-bershadsky
metric-type: count
target: "0"
window: "instant"
direction: lower-is-better
relations:
  measures:
    - /requirement/zero-error-catalog-load
    - /capability/solution-description
  uses:
    - /environment/local
tags:
  - integrity
  - testing
---

How many things are wrong with the description, counted by the only thing in this
repository that can count them. It carries two subjects and it is the same
observation for both:
[zero-error-catalog-load](srn://metaframework/requirement/zero-error-catalog-load)
is the commitment, and
[solution-description](srn://metaframework/capability/solution-description) is
the doing the commitment is about — a description that does not load is not a
description of anything.

The target is not chosen here. AC-1 of the requirement is an assertion in code,
`expect(errors.map(format)).toEqual([])` in
`framework/portal/src/lib/catalog/fixture-check.test.ts`, so the line this
observation is compared against is zero because the repository already says so.
Where this page and the requirement ever disagree, the requirement is right and
this one is stale.

## Definition

`loadCatalog()` over the real `solutions/` tree — every solution, not a hermetic
fixture — composed with `withSchemaRegistry()` and `withArtifactChecks()`, then
filtered to `severity === 'error'`. The count is the length of that list.

Included, because the composition puts them in one list with one severity split:
every code `load.ts` raises, every `E_DM_*` from the schema registry, and
every artifact mini-spec error from a `journey.yaml`, a `workflows/*.yaml` or a
`states.json`.

Excluded: warnings, entirely and by design. A `W_REF_DEPRECATED` pointing at a
deliberately deprecated entity is correct output, and a metric that counted it
would be met only by a catalog with no history.

`window: instant` rather than a rolling period, and the choice is the honest one.
This is a gauge read against a working tree at one commit; there is no series
behind it, because nothing samples it on a schedule. Aggregating over a period
would describe a collection practice that does not exist.

## Rationale

Zero is a defensible target here in a way it usually is not for a defect count,
because every diagnostic in this number is decidable from the files alone. There
is no flake, no environment, and no third party: the same tree produces the same
list on any machine. A non-zero reading is always an edit somebody made, which is
what makes it actionable rather than a weather report.

## Known distortions

- **The number is silence about everything the loader does not check.**
  Specified diagnostic codes with no emitter anywhere are listed, each with its
  gap named, in the `UNIMPLEMENTED` register in
  `framework/portal/src/lib/catalog/diagnostic-coverage.test.ts`; read the count
  there rather than from a figure written here. A reading of zero says the
  catalog is legal against the rules that were built, not against the rules that
  were written. The register has shrunk by most of its length since this metric
  was written — `E_ADR_SECTIONS` and `E_REQ_CRITERIA`, named here as examples,
  are both emitted — and what is left is concentrated in protocol validation.
- **`E_PROTO_*` does appear in it now.** The workflow, state and Arazzo-grounding
  checks are folded into the load by `lib/catalog/artifact-checks.ts`, so a
  broken `states.json` reaches this number as well as the page. This bullet used
  to say the opposite and was true when those parsers ran only while a protocol
  page rendered — a reading taken before that fold is not comparable with one
  taken after it.
- **Nothing samples it.** There is no CI and no pre-commit hook, so the value is
  whatever it was when a person or a model last typed the command. The gap
  between two readings is not an interval, it is a habit.
- **It counts across all three solutions.** `solutions/acme` and
  `solutions/brass` are fixtures rather than deliverables, so a reading can move
  because test data changed and not because anything about this framework did.
  Narrowing the observation to one solution was rejected: the loader's contract
  is over the tree, and a per-solution number would be a second definition of the
  same thing.
