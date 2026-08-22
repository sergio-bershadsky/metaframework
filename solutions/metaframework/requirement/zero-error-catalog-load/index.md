---
name: zero-error-catalog-load
kind: requirement
version: 2
title: The shipped catalog loads with zero error diagnostics
summary: Every catalog under solutions/ loads with no error-severity diagnostic, asserted against the real tree rather than a fixture.
status: review
owner: sergio-bershadsky
requirement-type: non-functional
priority: must
relations:
  uses:
    - /product/portal/component/catalog-loader
    - /environment/local
tags:
  - integrity
  - testing
---

The pass condition every skill and every command in the authoring kit ends on,
and — with no CLI in v1 — the only mechanical statement this repository makes
about whether its own content is legal.

"Zero errors" means zero diagnostics of severity `error`. Warnings are permitted
and are expected: a `W_REF_DEPRECATED` pointing at a deliberately deprecated
entity is correct output, not a failure. The distinction is the loader's, not a
convention — loading is fail-soft by design, so every violation becomes a
`Diagnostic` and nothing throws. A broken catalog renders with its errors
visible instead of returning a blank page.

## Acceptance criteria

- **AC-1** `loadCatalog()` over the real `solutions/` tree produces an empty list of error-severity diagnostics.
  - Asserted directly: `framework/portal/src/lib/catalog/fixture-check.test.ts` runs
    `expect(errors.map(format)).toEqual([])`.
- **AC-2** The datamodel schema registry is clean over the same tree, and its diagnostics are folded into the catalog the portal renders.
  - So an `E_DM_*` reaches `/diagnostics` beside an `E_FM_*` and an `E_SRN_*`.
- **AC-3** The registry holds exactly one entry per datamodel entity, so a schema that failed to register cannot hide behind an empty schema view.
- **AC-4** Every `schema.json` in the tree carries an `$id` equal to `srnToSchemaUrl(entity.srn)`, and no `schema.json` contains the string `/schemas/` — that is, identity is never a serving address.
- **AC-5** Every kind in the closed ontology is present somewhere in the tree, so the portal always has one of each to render.
- **AC-6** The check is derived from disk, not hard-coded: adding a solution directory is not a red test, but a directory the loader silently skipped, or a root it invented, still is.

## Measurement

Measured 2026-08-19, on the tree as it stood before this solution was authored:

```text
$ cd framework/portal && npx vitest run src/lib/catalog
Test Files  4 passed (4)
     Tests  74 passed (74)
  Duration  469ms
```

197 entity directories across two solutions. The number will move as this
solution lands; the assertion does not.

## What enforces this

`fixture-check.test.ts` is the only test in the repository that runs against the
shipped catalog rather than a hermetic temp fixture — its own docstring says so:
"the only test that fails when an author breaks a placement rule, a relation
target, or an SRN in a solution file."

And nothing runs it automatically. There is no CI, so this requirement holds
because a person or an agent typed `npm test`, and nothing prevents a commit that
breaks it. That is the same gap
[review-first-change](srn://metaframework/requirement/review-first-change)
records from the process side.

## What "zero errors" does not cover

Stated plainly, because a green check invites the wrong inference:

- **`E_PROTO_*` never runs over `solutions/`.** The workflow and state validators
  meet real content only when the portal *renders* a protocol page, and their
  output does not reach `/diagnostics`.
- **`E_VER_REGRESSION` never runs over `solutions/`** either — see
  [additive-only-evolution](srn://metaframework/requirement/additive-only-evolution).
- **`W_DM_UNION_TAG` can never reach `/diagnostics`.** It is emitted only inside
  `buildSchemaBundle()`, which has no production caller since the Stoplight
  viewer replaced the schema explorer that used to call it.
- **`W_DM_CONTRADICTION` reaches the entity page but not `/diagnostics`.** It is
  written into a local array that `buildLineage()` surfaces, not into
  `catalog.diagnostics`.
- **Some specified codes are implemented nowhere**, and the live list is the
  `UNIMPLEMENTED` register in
  `framework/portal/src/lib/catalog/diagnostic-coverage.test.ts` — read the count
  there rather than from a figure written here. It was roughly fifty when this
  requirement was written, concentrated in protocol, environment, ADR and
  requirement validation; environment, ADR and requirement are gone from it and
  what is left is mostly protocol. `E_ADR_SECTIONS` and `E_REQ_CRITERIA` were
  named here as the pair that mattered, and both are emitted — this document's
  own required `## Acceptance criteria` heading is checked by
  `lib/requirement/requirement.ts`.

## Out of scope

Whether the description is any *good*. Legality and quality are different
questions and the authoring kit splits them deliberately across two skills —
`validate-catalog` asks "is it legal?", `review-solution` asks "is it any good?".
This requirement is the first question only.
