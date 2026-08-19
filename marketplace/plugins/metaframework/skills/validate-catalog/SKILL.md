---
name: validate-catalog
description: This skill should be used when the user asks to "validate the catalog", "check the catalog", "run the catalog check", "why is the catalog failing", "what does E_SRN_DANGLING mean", "fix these diagnostics", or names any metaframework diagnostic code (E_SRN_*, E_FM_*, E_STRUCT_*, E_DM_*, E_VER_*, E_PROTO_*, W_*). It should also be used immediately after any skill or command creates or edits an entity, since the catalog check is the pass condition for that work. It covers running the check, reading its output, mapping each code family to its usual cause and fix, which warnings matter, and what the check deliberately does not cover.
---

# Validate a metaframework catalog

There is no CLI. Integrity is checked when the portal loads the catalog, and the
loader is exercised by a vitest suite that asserts the shipped catalog loads
clean.

```bash
cd framework/portal && npx vitest run src/lib/catalog
```

**Zero `error`-severity diagnostics is the pass condition.** The run takes under
a second. Run it after every edit, not once at the end.

## Running it

- The working directory must be `framework/portal`. The suite resolves the
  catalog as `../../solutions` relative to the working directory and **ignores
  `CATALOG_DIR`** — that variable retargets the running portal, not the test. To
  check a solution repository living outside this monorepo, point the portal at
  it and read `/diagnostics` (below).
- Two files run: `load.test.ts` (hermetic temp fixtures exercising the loader)
  and `fixture-check.test.ts` (the real tree under `solutions/`). Only the second
  can fail because of authored content.
- A pass looks like `Test Files  2 passed (2)`. Test counts drift as the fixture
  grows; the pass/fail line is the signal.

A failure prints the diagnostics as a diff against the expected empty array —
one real example, wrapped here for width:

```text
+   "E_SRN_DANGLING acme/product/fulfilment/index.md — \"/product/fulfilment/requirement/carrier-failover\"
    resolves to srn://acme/product/fulfilment/requirement/carrier-failover, which does not exist",

 ❯ src/lib/catalog/fixture-check.test.ts:27:32
```

Each line is `CODE  catalog-relative-path — message`. The path is relative to
`solutions/`, so prefix it with `solutions/` to open the file. The message names
the reference **exactly as authored** and the SRN it resolved to — comparing the
two is usually the whole diagnosis.

## Read the output in cascade order

Diagnostics are not independent. **Fix in this order and re-run between
stages** — most of a long list usually collapses after the first fix.

1. **`E_SRN_*` on a directory path** — a misplaced or badly-named directory has
   no SRN, so the entity does not exist. Everything referring to it will also be
   reported.
2. **`E_FM_SCHEMA` against the common contract** — the loader stops and never
   registers the entity. One bad `summary` therefore produces `E_SRN_DANGLING` at
   every referrer and `E_STRUCT_MISSING_INDEX` at every child. Those are
   symptoms, not findings.
3. **`E_FM_*` on the entity itself** — name, kind, unknown fields, edge source.
4. **`E_SRN_DANGLING` / `E_FM_EDGE_TARGET`** — genuine reference errors, once
   stages 1–3 are clean.
5. **Warnings** — never fail the check; see below.

A second cascade rule: a wrong `kind:` value yields **three** codes at once,
because the kind-specific schema is selected by disk position rather than by the
declared value. `kind: actor` in a `product/` bucket gives
`E_FM_KIND_LOCATION` + `E_FM_SCHEMA` (missing `lifecycle`) +
`E_FM_UNKNOWN_FIELD` (`actor-type`, `goals`). One edit fixes all three.

## Codes this check emits

Every code below comes from the catalog loader and is what a failing run will
actually show.

| Code                     | Severity | Usual cause                                                                              | Fix                                                                                     |
|--------------------------|----------|------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------|
| `E_SRN_SYNTAX`           | error    | Miscounted `..` in a relative reference; an odd path tail (a bucket with no name); a non-kebab segment; `@version` not on the final segment. | Rewrite the reference solution-absolute (`/product/shop/datamodel/money@1`) instead of recounting dots. |
| `E_SRN_PLACEMENT`        | error    | A directory in a bucket its kind may not occupy — a `component` at solution level, a `product` under a product, an `actor` under a product, a leaf kind owning children. | Correct placement **before publishing**. On a published entity this is a swap, never a `git mv`. |
| `E_SRN_RESERVED`         | error    | One of the eight kinds used as a solution or entity *name*.                              | Rename the directory (unpublished) or swap (published). Kinds are bucket names only.     |
| `E_SRN_CROSS_SOLUTION`   | error    | A network-path reference (`//other-solution/…`) leaving the solution.                    | Solutions are sealed. Model the foreign thing as an `external` component instead.        |
| `E_SRN_DANGLING`         | error    | The reference resolves to an SRN with no entity behind it — typo, entity not created yet, or the target failed to load at stage 2. | Check the target exists **and loads**; fix the target's own diagnostics first.            |
| `E_SRN_VERSION`          | **warning** | A `@N` pin that does not match the target's current `version`.                        | Bump the pin, or leave it if the pin is deliberate — historic versions resolve from git.  |
| `E_FM_SCHEMA`            | error    | Type, enum, shape or requiredness violation — including an authored inverse edge, a string `version`, a multi-line `summary`, a missing per-kind required field, `deciders` absent on an accepted ADR. | Read the message: it names the field path and the constraint. Fix first, always.          |
| `E_FM_NAME_MISMATCH`     | error    | `name` ≠ the directory name.                                                             | Change `name` to match the directory — never the directory to match `name`.               |
| `E_FM_KIND_LOCATION`     | error    | `kind` ≠ the bucket the directory sits in.                                               | Change `kind`, or move the directory if it is unpublished and the placement was the error. |
| `E_FM_UNKNOWN_FIELD`     | error    | A typo; a kind field on the wrong kind (frontmatter is a discriminated union); an invented field. | Fix the spelling, remove the field, or prefix it `x-` if it is genuinely local.            |
| `E_FM_EDGE_SOURCE`       | error    | A kind authoring an edge it may not author — `exposes` or `implements` from anything but a component or product. | Wrong in the file being read. Move the edge to the component or product that owns it.      |
| `E_FM_EDGE_TARGET`       | error    | An edge pointing at an illegal kind — `implements` at anything but a requirement, `uses` at a product or actor, `supersedes` across kinds. | Wrong about the file it points at. Pick the right edge type or the right target.           |
| `E_STRUCT_NESTED_ENTITY` | error    | An `index.md` below a non-container entity (only solution, product and component may own). | Move the child under a real container, or the parent is the wrong kind.                    |
| `E_STRUCT_MISSING_INDEX` | error    | An entity exists below a directory that has no `index.md`.                               | Create the missing parent `index.md` — or fix the parent's `E_FM_SCHEMA`, which is the usual real cause. |
| `E_STRUCT_DUPLICATE_SRN` | error    | Two directories resolving to one SRN — a symlink, or a case-insensitive filesystem.      | Remove the duplicate. Symlinks are never a legitimate reuse mechanism (rule C5).           |
| `W_REF_DEPRECATED`       | warning  | The reference target has `status: deprecated`.                                            | Migrate to the successor named by the target's derived `superseded-by`, or accept it.      |

`E_STRUCT_KIND_PLACEMENT` is **retired** and must never be emitted or cited —
every placement violation is `E_SRN_PLACEMENT` now, raised while the path is
parsed.

## Warnings are drift, not breakage

The check filters on `severity === 'error'`, so warnings never fail it and
**warnings are not printed by a passing run.** To see them, start the portal and
open its diagnostics page, which lists errors and warnings separately:

```bash
cd framework/portal && npm run dev   # then http://localhost:3000/diagnostics
# CATALOG_DIR=/abs/path npm run dev  # to point the portal at another catalog
```

Which warnings matter:

- **`W_REF_DEPRECATED`** — matters. It means a swap is unfinished. Each one is a
  referrer that still has to be migrated before the old entity can rest.
- **`E_SRN_VERSION`** (emitted as a warning by this loader, though the
  specification classes it as an error) — matters when unintentional. A pin at
  `@1` against a current `@4` is either a deliberate freeze or a forgotten
  migration; only the author knows which, so ask rather than bumping silently.
- **`W_DM_CONTRADICTION`, `W_DM_UNION_TAG`** — schema-quality signals from the
  datamodel registry; act on them when touching the schema anyway.

## What this check does not cover

Treating a green run as "the catalog is correct" is the most expensive mistake
available here. The catalog suite proves the tree *loads*. It does not prove
the tree is *right*, and several specified rules are not machine-checked at all.

- **Not exercised against the shipped catalog** — the datamodel schema registry
  (`E_DM_*`), the protocol `states.json` and workflow validators (`E_PROTO_*`),
  and the git version-history check (`E_VER_REGRESSION`) live in separate modules
  whose test suites use their own hermetic fixtures. Running the whole suite
  (`npx vitest run`) proves those validators work; it does **not** run them over
  `solutions/`. They only meet real content when the portal *renders* the page —
  `E_DM_*` in the schema explorer on a datamodel page, `E_PROTO_*` on a protocol
  page — and neither appears on `/diagnostics`, which shows loader diagnostics
  only. After touching a `schema.json`, a `states.json` or a workflow, open that
  entity's page. The one exception is real and useful: `fixture-check.test.ts`
  does assert over the real tree that every datamodel's `$id` equals the URL the
  portal serves it at and that every non-local `$ref` is an absolute schema URL
  naming a real datamodel with a `schema.json` behind it.
- **Specified but not implemented anywhere** — among others: the ADR's four
  required headings (`E_ADR_SECTIONS`), the requirement's `## Acceptance criteria`
  section (`E_REQ_CRITERIA`), `primary-actors` resolving to real actors
  (`E_PROD_ACTOR_TARGET`), protocol participant kinds and duplicate aliases
  (`E_PROTO_PARTICIPANT_KIND`, `E_PROTO_ALIAS_DUP`), protocol NCA placement
  (`W_STRUCT_PROTOCOL_NCA`), unimplemented `must` requirements
  (`W_REQ_UNIMPLEMENTED`), a `library` declaring an environment
  (`E_COMP_LIBRARY_ENVIRONMENT`). These are author discipline. Verify them by
  reading. The full list is in `references/diagnostics.md`.
- **Not a modelling review.** Whether the decomposition, placement and relation
  graph make sense is the `catalog-reviewer` agent's job, not this check's.

## Three failures that are not spec violations

`fixture-check.test.ts` is also a regression guard on the acme fixture
specifically, with hard-coded expectations. Legitimate catalog work can fail it:

- adding a second solution under `solutions/` — one assertion expects exactly
  `['srn://acme']`;
- adding a relation edge toward `srn://acme/product/billing/component/ledger` —
  one assertion pins that entity's exact inbound edge list;
- adding or renaming a protocol artifact — two assertions pin the exact file
  lists of `order-placement` and `settlement`.

When the change is correct, update the assertion in the same commit and say so.
Do not "fix" the catalog to satisfy a stale test.

## Fixing

Apply a fix directly only where the correction is unambiguous: a typo, a missing
required frontmatter field, a mis-typed reference, an authored inverse edge.
Anything that would **remove, rename, narrow or move** an entity is not a fix —
stop and say it requires a swap (successor entity, `supersedes` on the successor,
migrate referrers one at a time, then deprecate; never delete). Re-run the check
after every edit and report the new result, including the count that changed.

## Reference files

- **`references/diagnostics.md`** — the complete code inventory: every code the
  portal emits and which module emits it, every code the specification defines
  that nothing implements, and the retired codes.
- **`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/`** — the contracts behind
  the codes: `srn.md` (`E_SRN_*`), `frontmatter.md` (`E_FM_*`), `structure.md`
  (`E_STRUCT_*`), `schemas.md` (`E_DM_*`), `evolution.md` (`E_VER_*`, the swap).
  When `framework/spec/` is present in the repository it is authoritative and
  wins over all of these.
