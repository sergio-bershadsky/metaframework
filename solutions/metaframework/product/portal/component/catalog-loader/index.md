---
name: catalog-loader
kind: component
version: 9
title: Catalog loader
summary: The fail-soft walk from filesystem to entity graph — the zod frontmatter contract, relation resolution, the derived inverse index, and the dev fingerprint cache.
status: review
owner: sergio
component-type: library
lifecycle: released
relations:
  depends-on:
    - ../srn
  uses:
    - /product/specification/datamodel/entity-frontmatter@3
  implements:
    - /requirement/zero-error-catalog-load
  realizes:
    - /capability/solution-description
tags:
  - loader
  - validation
---

`src/lib/catalog/` — `load.ts`, `frontmatter.ts`, `types.ts`, `index.ts`,
`fingerprint.ts`, `mentions.ts` and `href.ts`, with `load.ts` carrying most of
it. It is the only reader of `solutions/` in the whole repository, and
everything the portal knows about a catalog it learned here.

## The discovery rule is one sentence

A directory under the catalog root is an entity **iff** it holds `index.md`.
There is no manifest, no registry, no index file to keep in step — which is what
"the filesystem is the database" means in code. Kind buckets are the mirror
image and hold nothing but entity directories.

The one subtlety worth stating: kind-specific frontmatter is validated against
the kind implied by **disk position**, never against the declared `kind`. A
document that says `kind: actor` inside a `datamodel/` bucket is checked as a
datamodel *and* reported as `E_FM_KIND_LOCATION`, so mislabelling cannot be used
to skip a kind's own rules.

## Fail-soft is a contract, not a convenience

Nothing in this module throws. Every violation becomes a `Diagnostic` on
`catalog.diagnostics`, and the portal renders the broken catalog with the reason
visible instead of failing to a blank page —
[0004-fail-soft-catalog-loading](srn://metaframework/product/portal/adr/0004-fail-soft-catalog-loading).
The codes raised from `load.ts` are `E_FM_SCHEMA`, `E_FM_NAME_MISMATCH`,
`E_FM_KIND_LOCATION`, `E_FM_UNKNOWN_FIELD`, `E_FM_EDGE_SOURCE`,
`E_FM_EDGE_TARGET`, `E_SRN_SYNTAX`, `E_SRN_DANGLING`, `E_STRUCT_MISSING_INDEX`,
`E_STRUCT_NESTED_ENTITY`, `E_STRUCT_DUPLICATE_SRN`, `E_STRUCT_BODY_H1`,
`E_MET_NO_SUBJECT`, `E_JRN_ACTOR_KIND`, `W_ARTIFACT_DIALECT`,
`W_MET_SUBJECT_SCOPE`, `W_CAP_UNREALIZED`, `W_CAP_REALIZATION_EDGE`,
`W_REF_DEPRECATED` and `W_REF_STALE_PIN` — the list is the claim, and
`grep -ohE "'[EW]_[A-Z0-9_]+'" src/lib/catalog/load.ts | sort -u` is how to
re-derive it. `W_ARTIFACT_DIALECT` is the one that arrived last, with
[0015-artifact-dialects](srn://metaframework/adr/0015-artifact-dialects), and it
was missing from this list for a release. `E_SRN_VERSION` is deliberately **not** among them: V7 asks
whether a pinned `@N` resolves at all, which only the version→commit index can
answer and this module never opens git. The drift the loader *can* see — a pin
that resolves but is behind its target — is `W_REF_STALE_PIN`, a warning of its
own rather than an error code worn at the wrong severity (decision-record
amendment 2026-08-20-e). `load.test.ts` runs one hermetic temp fixture per
diagnostic class.

## The frontmatter contract as executable code

`frontmatter.ts` is where
[entity-frontmatter](srn://metaframework/product/specification/datamodel/entity-frontmatter)
stops being prose. `commonFrontmatterSchema` is a zod object with
`.catchall(z.unknown())` plus a separate `unknownFields()` pass that tolerates
exactly the `x-` prefix; `KIND_FRONTMATTER` is a
`satisfies Record<EntityKind, z.ZodType>` map, so a kind added to the ontology
without a schema is a compile error rather than a silently unvalidated document.
`EDGE_SOURCE_KINDS` and `EDGE_TARGET_KINDS` are the spec's two edge-legality
tables, transcribed.

**Inverse edges are derived here and never authored.** `resolveRelations()`
builds `catalog.inbound` from the forward edges, which is why `used-by`,
`depended-on-by` and `implemented-by` cannot drift: there is nothing to keep in
step.

## The cache, and why it stats instead of watching

In development every request fingerprints the tree — max mtime plus entry count,
directories included — and re-parses only when that moved. The count is not
redundant: deleting a file leaves every surviving mtime untouched. Directories
are stat'ed because a rename is invisible in file mtimes. Measured inside
`next dev` against the real catalog, 197 entities / 597 entries: **~18ms to
fingerprint against ~2.2s to rebuild**, of which only ~400ms is this module and
the rest is the graph itself, which each rebuild grows the heap by ~250MB to
produce. The walk is synchronous on purpose — the `fs/promises` form of the same
walk measured ~120ms, because 597 awaited operations each need a turn of an
event loop the dev server keeps busy with HMR.

In production the tree is read once per process. There is no watcher, so an edit
made while the server was down, by another process, or through a `git checkout`
is seen exactly like an edit made in the editor.

## What it does not validate

It parses `schema.json` into `artifact.data` and stops. Everything a datamodel
can get wrong belongs to
[schema-registry](srn://metaframework/product/portal/component/schema-registry),
whose diagnostics are folded into this one's list by `withSchemaRegistry()` in
`index.ts:53` — one list, one severity split, so a reader never has to know which
validator found a problem. Protocol artifacts are parsed by
[protocol-model](srn://metaframework/product/portal/component/protocol-model),
and `load.ts` itself does none of that parsing — but the parse no longer stops at
the protocol page. `withKindChecks()` and `withArtifactChecks()` fold the protocol
disciplines into the same list, so `E_PROTO_*` does reach `/diagnostics`. Which
classes arrive there is a question for the fold, not for this module; the codes
`grep -rho "'[EW]_PROTO_[A-Z0-9_]*'" src/lib/protocol` prints are the population,
and `metaframework check` reports the ones the catalog currently trips.

Nothing in `load.ts` compares an entity against its predecessor, and it cannot:
the walk holds one working tree and the predecessor is a commit. That comparison
is a *fold* over the graph this module produces rather than a step inside it, and
`index.ts` now composes one — `withEvolutionChecks()`, the only `async` fold and
the only place the catalog pipeline spawns a subprocess. It hands each datamodel
to `lib/datamodel/additive.ts`, which resolves version N−1 through
[git-history](srn://metaframework/product/portal/component/git-history) and
reports `E_DM_NOT_ADDITIVE` on a schema that has been tightened.

The fold is silent whenever git cannot answer, which is what keeps
[catalog-renders-without-git](srn://metaframework/product/portal/requirement/catalog-renders-without-git)
true of it: with no repository the diagnostics list is the same list, not a
shorter one with a hole in it. And it covers exactly one contract surface. A
removed acceptance criterion, a reversed decision paragraph or a deleted
requirement still passes this loader without a word.
