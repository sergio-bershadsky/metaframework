---
name: 0007-canonical-schema-host-and-x-srn-restored
kind: adr
version: 1
title: Identity is a canonical constant, and the SRN stays in the file
summary: $id and every cross-entity $ref are built on the constant https://schemas.metaframework.dev; SCHEMA_BASE_URL becomes retrieval-only and may not appear in an artifact; x-srn is REQUIRED again.
status: review
owner: sergio-bershadsky
decision-status: accepted
date: "2026-08-19"
deciders:
  - sergio
relations:
  uses:
    - /product/portal/component/schema-registry
    - /product/specification/datamodel/schema-document
tags:
  - json-schema
  - identity
---

# Identity is a canonical constant, and the SRN stays in the file

## Context

[0006](srn://metaframework/adr/0006-dereferenceable-schema-urls) made `$id` the
URL *the portal serves the schema at*, derived from `SCHEMA_BASE_URL`. That
conflated two different questions
(`docs/decision-record.md:335-339`):

|                      | Identity                        | Retrieval                                |
| -------------------- | ------------------------------- | ---------------------------------------- |
| What it answers      | what this schema **is**         | where a copy can be **fetched**          |
| Where it lives       | in the artifact (`$id`, `$ref`) | in deployment config (`SCHEMA_BASE_URL`) |
| Varies by deployment | **never**                       | yes, by definition                       |

Making identity track a deployment variable is a defect, not a configuration
choice. Registries, caches, generated client packages and `$ref` graphs all key
on `$id`. A laptop saying `http://localhost:3000/schemas/acme/datamodel/money`
and a production deployment saying
`https://catalog.acme.example/schemas/acme/datamodel/money` hold **two** schemas
where there is one, and the disagreement surfaces as a resolution failure far
from its cause. The "portability rule" 0006 had to write — rewrite every `$id`
and `$ref` in the catalog whenever the variable moves — existed only because the
configuration was in the artifacts.

The second problem was smaller and more embarrassing. 0006 retired `x-srn`
because `$id` had made it redundant and because two identity fields can
disagree. The SRN then vanished from schema files entirely: identity became
implicit in a URL-parsing rule a reader must know to apply, a schema pasted into
a validator or vendored into a client repo could no longer say where it came from
in the framework's own vocabulary, and
`grep -r 'srn://acme/datamodel/money' solutions/` stopped finding the schema that
*is* that entity.

## Decision

`$id` and every cross-entity `$ref` are built on the constant
**`https://schemas.metaframework.dev`**, defined once at
`framework/portal/src/lib/schema/url.ts:46` (`CANONICAL_SCHEMA_HOST`) and
mirrored at `scripts/migrate_schema_ids.py:45`. `SCHEMA_BASE_URL` still exists
and still controls the `/schemas` route — where *this* deployment hands the bytes
over — and it MUST NOT appear in any artifact; a `$ref` naming a serving address
is `E_DM_REF_TARGET`. The `SCHEMA_BASE_URL` portability rule is retired: there is
nothing per-deployment left in the artifacts to rewrite. And **`x-srn` is
REQUIRED again**, carrying the entity's unversioned SRN, validated against the
file's own path (`E_DM_SRN_MISSING`, `E_DM_SRN_MISMATCH`).

## Consequences

- **Dereferenceability is unaffected, and the argument for that is not
  hand-waving.** In JSON Schema, `$id` is an identifier and retrieval is a
  resolver's problem: a consumer that prefers fetching to trusting a cache maps
  the canonical host onto a serving address in resolver config — one line,
  outside the artifacts. 0006's measurement proved the URL *form*, which is
  unaffected by which host the file names. The portal is itself exactly such a
  mapping: `framework/portal/src/lib/schema/dereference.ts` registers a catalog
  resolver at `order: 1`, ahead of the built-in HTTP resolver, and reads the file
  off disk instead.
- **Two identity fields, and the objection to them does not apply.** `$id` and
  `x-srn` are both derived from, and checked against, the file's own directory at
  load. They are two spellings of one derived fact, not two hand-maintained
  fields, and the disagreement 0006 feared requires a field that is *trusted* —
  neither of these is. `framework/portal/src/lib/schema/registry.ts` raises
  `E_DM_ID_MISSING`/`E_DM_ID_MISMATCH` (lines 359 and 367) and
  `E_DM_SRN_MISSING`/`E_DM_SRN_MISMATCH` (lines 401 and 409) against the derived
  values, never against each other.
- **The diagnostic teaches the split rather than just failing.** When a rejected
  `$ref` is a serving address, `resolveRefUrl` says so and hands back the
  replacement: `"…" is where this portal serves a schema (SCHEMA_BASE_URL), not
  what it is — write "https://schemas.metaframework.dev/…"`
  (`registry.ts:475`). An `$id` that is a serving URL gets the same treatment
  (`registry.ts:367-374`).
- **The catalog was migrated by script, not by hand.**
  `scripts/migrate_schema_ids.py` (269 lines) normalises a catalog written
  against any host or serving address onto canonical identity and adds `x-srn`;
  it is idempotent and doubles as a drift guard with `--check`. It ran against
  the fixtures on the evening of 2026-08-19: commit `07a0813` (21:19) records
  "Schemas migrated to the canonical-host `$id` with `x-srn` restored beside it,
  per amendment d", and `ec0f4be` (21:18) carried the same form into the second
  fixture catalog.
- **The form holds across the whole catalog today.** 66 `schema.json` documents
  under `solutions/`; all 66 declare an `$id` on
  `https://schemas.metaframework.dev` and all 66 carry an `x-srn`; 106
  cross-entity `$ref`s, every one of them a canonical URL, and 123 local `#/`
  pointers untouched. `fixture-check.test.ts` asserts the same thing from the
  other side — every `$ref` matches `^${CANONICAL_SCHEMA_HOST}/`, names a real
  datamodel, and has a `schema.json` behind it, and a served document's `$id` is
  the canonical URL rather than the address it was fetched from.
- **The drift guard is not currently clean, and the reason is cosmetic rather
  than semantic.** `python3 scripts/migrate_schema_ids.py --check` reports
  `5 file(s) would change` — this solution's own five schemas under
  `product/specification/datamodel/`. Re-parsing the script's output against the
  file on disk shows the two documents are identical as JSON in every case; the
  script renders with `ensure_ascii=True` and one key per line, so hand-authored
  em-dashes and single-line sub-objects are re-spelled. `$id`, `x-srn` and every
  `$ref` in those five files are already canonical. It is still a guard that
  exits non-zero on a clean catalog, which makes it unusable as a CI check
  without a formatting pass first — and there is no CI here to run it.
- **The host resolves nowhere, on purpose.** There is no DNS, hosting or
  redirect configuration for `schemas.metaframework.dev` anywhere in this
  repository. Every one of those 66 `$id` values names a host that answers
  nothing. That is the design — identity is not a retrieval address — but it
  means an outside consumer needs one line of resolver configuration before any
  of it dereferences, and the
  [schema-serving](srn://metaframework/product/portal/component/schema-service/protocol/schema-serving)
  protocol's workflow has that branch and an honest `[else]` for consumers
  without it.
- **`deprecated` was named as the lifecycle keyword** in the same amendment,
  previously only implicit: it is a standard 2020-12 meta-data keyword, verified
  present in
  `framework/portal/node_modules/ajv/dist/refs/json-schema-2020-12/meta/meta-data.json`,
  so a deprecated datamodel says so in a keyword stock tooling already
  understands, and setting it is always additive.
- **This record carries no `supersedes` edge to 0006, and that is deliberate.**
  It amends 0006 on two points and leaves the URL form, the one-spelling rule,
  the absent version suffix, the entity-private `$defs` and the local JSON
  Pointers standing. The framework's edge vocabulary is closed and has no
  `amends`
  ([0003-closed-ontology-of-nine-kinds](srn://metaframework/adr/0003-closed-ontology-of-nine-kinds)),
  and authoring `supersedes` would assert a total reversal that did not happen —
  it would also flip 0006 to `decision-status: superseded`, which would be false.
  The partial supersession is therefore carried in prose on both records, which
  is the cost of a closed enum, recorded rather than worked around.

## Alternatives considered

- **Keep `SCHEMA_BASE_URL` in the artifacts and keep the portability rule.**
  Rejected: it makes a schema's identity a property of where it was built,
  guarantees that two deployments of the same catalog disagree about what a model
  is, and pays for that with a repository-wide rewrite on every configuration
  change. The rule was work that existed only to contain a defect.
- **Make the host configurable with a canonical default.** Rejected for the same
  reason in weaker form: a default that can be overridden is still a variable,
  and the failure it produces — a registry holding two entries for one schema — is
  silent and surfaces far from its cause. The constant is stated as MUST NOT be
  made configurable in `framework/spec/kinds/datamodel.md`.
- **Leave `x-srn` retired and derive the SRN from `$id` when needed.** Rejected
  on two observations that only appeared once the files existed without it: the
  derivation is a rule a reader must know rather than a fact the file states, and
  the framework's own primary lookup — grepping for an `srn://` string — stopped
  finding datamodel schemas. The redundancy objection was answered by noting that
  neither field is trusted.
- **Register the domain and serve it.** Not rejected on merit; simply out of
  scope. Nothing in this repository serves the canonical host and nothing here
  proposes to, which is stated in
  [stock-tooling-schema-consumption](srn://metaframework/requirement/stock-tooling-schema-consumption)
  rather than left as an implied future.
- **A `urn:` or other non-HTTP identifier**, which would make the
  never-dereferences property explicit. Rejected: it would discard the one thing
  0006 measured — that an HTTP URL is the form a stock resolver can be pointed at
  — in exchange for honesty about a host that a single line of resolver config
  makes real.
