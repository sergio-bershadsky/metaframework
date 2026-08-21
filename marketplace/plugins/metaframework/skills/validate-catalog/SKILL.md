---
name: validate-catalog
description: This skill should be used when the user asks to "validate the catalog", "check the catalog", "run the catalog check", "why is the catalog failing", "`metaframework check` is red", "how do I check a catalog outside the framework repo", "what does E_SRN_DANGLING mean", "fix these diagnostics", or names any metaframework diagnostic code (E_SRN_*, E_FM_*, E_STRUCT_*, E_DM_*, E_VER_*, E_PROTO_*, E_JRN_*, E_MET_*, W_CAP_*, W_*). It should also be used immediately after any skill or command creates or edits an entity, since the catalog check is the pass condition for that work. It covers running the check, reading its output, mapping each code family to its usual cause and fix, which warnings matter, and what the check deliberately does not cover. This is legality only — for whether the decomposition, placement and relation graph are any GOOD, use `review-solution`.
---

# Validate a metaframework catalog

Integrity is checked by the catalog loader, and the loader ships as a CLI. Run
it from anywhere inside the repository that holds the catalog:

```bash
metaframework check
```

**Zero `error`-severity diagnostics is the pass condition**, and the command
exits non-zero when there are any, so it works as a CI gate unchanged. The run
takes a second or two. Run it after every edit, not once at the end.

## Getting the checker

It is one global install and it carries its own compiled server, so it pulls in
no dependencies and needs nothing else present:

```bash
npm install -g @bershadsky/metaframework
```

If a global install is unwelcome, `npx @bershadsky/metaframework check` is the
same thing without one.

**Do not vendor, symlink, or submodule the framework repository to get a
checker.** Earlier versions of these skills told you to, because the CLI did not
exist yet and the only validator was a vitest suite that resolved the catalog as
`../../solutions` relative to itself. That is why the advice used to involve
copying `framework/` around. It is obsolete: the CLI finds the catalog by
walking up from the working directory the way git finds `.git`, so a
catalog-only repository needs nothing vendored into it.

## Running it

- **No working-directory requirement.** Run it anywhere at or below the
  repository root; it walks up looking for a `solutions/` directory holding at
  least one `<name>/index.md`.
- To check a catalog somewhere else, name it: `metaframework check --dir <path>`,
  or `CATALOG_DIR=<path> metaframework check`.
- If it finds nothing it prints every path it tried and exits 1 — that output is
  the diagnosis, so read it rather than guessing at the working directory.
- `metaframework check --since <ref>` adds the evolution gate: every entity
  whose files changed since `<ref>` must have bumped its `version`, with the
  status-only exemption. Use it in CI against the base of a branch. It needs
  git, and says so rather than passing silently when there is none.

Output is one line per diagnostic and a summary:

```text
error   E_SRN_DANGLING  acme/product/fulfilment/index.md
        "/product/fulfilment/requirement/carrier-failover" resolves to
        srn://acme/product/fulfilment/requirement/carrier-failover, which does not exist

1 error, 6 warnings — 324 entities across 3 solutions.
```

Each entry is `severity  CODE  catalog-relative-path` and then the message. The
path is relative to `solutions/`, so prefix it with `solutions/` to open the
file. The message names the reference **exactly as authored** and the SRN it
resolved to — comparing the two is usually the whole diagnosis.

## Inside the framework repository only

If you are working in the metaframework repository itself, the vitest suite
still exists and asserts the same thing over the shipped catalogs:

```bash
cd framework/portal && npx vitest run src/lib/catalog
```

It resolves `../../solutions` relative to its own location and **ignores
`CATALOG_DIR`**, which is exactly why it is useless for a catalog living
anywhere else. Prefer `metaframework check` even here; this is noted so a red
suite in that repository is recognisable, not as a recommendation.

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

Every code below comes from the catalog load pipeline and is what a failing
run will actually show. The artifact mini-spec families (`E_JRN_*`,
`E_PROTO_*`) run in the same pipeline and fail the same run; their tables live
in `references/diagnostics.md`.

| Code                       | Severity   | Usual cause                                                                                                                                                                                            | Fix                                                                                                                                                                          |
|----------------------------|------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `E_SRN_SYNTAX`             | error      | Miscounted `..` in a relative reference; an odd path tail (a bucket with no name); a non-kebab segment; `@version` not on the final segment.                                                           | Rewrite the reference solution-absolute (`/product/shop/datamodel/money@1`) instead of recounting dots.                                                                      |
| `E_SRN_PLACEMENT`          | error      | A directory in a bucket its kind may not occupy — a `component` at solution level, a `product` under a product, an `actor` under a product, a leaf kind owning children.                               | Correct placement **before publishing**. On a published entity this is a swap, never a `git mv`.                                                                             |
| `E_SRN_RESERVED`           | error      | One of the eleven kinds used as a solution or entity *name*.                                                                                                                                           | Rename the directory (unpublished) or swap (published). Kinds are bucket names only.                                                                                         |
| `E_SRN_CROSS_SOLUTION`     | error      | A network-path reference (`//other-solution/…`) leaving the solution.                                                                                                                                  | Solutions are sealed. Model the foreign thing as an `external` component instead.                                                                                            |
| `E_SRN_DANGLING`           | error      | The reference resolves to an SRN with no entity behind it — typo, entity not created yet, or the target failed to load at stage 2.                                                                     | Check the target exists **and loads**; fix the target's own diagnostics first.                                                                                               |
| `E_FM_SCHEMA`              | error      | Type, enum, shape or requiredness violation — including an authored inverse edge, a string `version`, a multi-line `summary`, a missing per-kind required field, `deciders` absent on an accepted ADR. | Read the message: it names the field path and the constraint. Fix first, always.                                                                                             |
| `E_FM_NAME_MISMATCH`       | error      | `name` ≠ the directory name.                                                                                                                                                                           | Change `name` to match the directory — never the directory to match `name`.                                                                                                  |
| `E_FM_KIND_LOCATION`       | error      | `kind` ≠ the bucket the directory sits in.                                                                                                                                                             | Change `kind`, or move the directory if it is unpublished and the placement was the error.                                                                                   |
| `E_FM_UNKNOWN_FIELD`       | error      | A typo; a kind field on the wrong kind (frontmatter is a discriminated union); an invented field.                                                                                                      | Fix the spelling, remove the field, or prefix it `x-` if it is genuinely local.                                                                                              |
| `E_FM_EDGE_SOURCE`         | error      | A kind authoring an edge it may not author — `exposes` or `implements` from anything but a component or product.                                                                                       | Wrong in the file being read. Move the edge to the component or product that owns it.                                                                                        |
| `E_FM_EDGE_TARGET`         | error      | An edge pointing at an illegal kind — `implements` at anything but a requirement, `uses` at a product or actor, `supersedes` across kinds.                                                             | Wrong about the file it points at. Pick the right edge type or the right target.                                                                                             |
| `E_STRUCT_NESTED_ENTITY`   | error      | An `index.md` below a non-container entity (only solution, product and component may own).                                                                                                             | Move the child under a real container, or the parent is the wrong kind.                                                                                                      |
| `E_STRUCT_MISSING_INDEX`   | error      | An entity exists below a directory that has no `index.md`.                                                                                                                                             | Create the missing parent `index.md` — or fix the parent's `E_FM_SCHEMA`, which is the usual real cause.                                                                     |
| `E_STRUCT_DUPLICATE_SRN`   | error      | Two directories resolving to one SRN — a symlink, or a case-insensitive filesystem.                                                                                                                    | Remove the duplicate. Symlinks are never a legitimate reuse mechanism (rule C5).                                                                                             |
| `W_ARTIFACT_DIALECT`       | warning    | A sibling artifact written before the dialect rule and declaring none, or one whose `$schema` is not the meta-schema URL its role recognises. Never raised on `schema.json` or `examples/*.json`.      | Add the role's declaration as the file's first key — the per-role keys and URLs are in `references/diagnostics.md`. It bumps the owning entity's `version`, once per entity. |
| `W_REF_DEPRECATED`         | warning    | The reference target has `status: deprecated`.                                                                                                                                                         | Migrate to the successor named by the target's derived `superseded-by`, or accept it.                                                                                        |
| `W_REF_STALE_PIN`          | warning    | A `@N` pin that resolves but no longer matches the target's current `version`.                                                                                                                         | Bump the pin, or leave it if the freeze is deliberate — historic versions resolve from git.                                                                                  |

Codes the loader gained with the `capability`, `journey` and `metric` kinds. The
severity split is one rule worth reading as a rule: a violation is an **error**
when the entity is meaningless without the fix, and a **warning** when it is a
true statement about a system still being built, or a judgement call about who
owns a number.

| Code                       | Severity   | Usual cause                                                                                                                                                                                 | Fix                                                                                                                                              |
|----------------------------|------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|
| `E_MET_NO_SUBJECT`         | error      | A metric with no `measures` edge, or an empty one. It is the only relation edge any kind requires.                                                                                          | Add the subject — a capability, component, protocol or requirement. A number with no subject is a figure, not an observation.                    |
| `E_MET_TARGET`             | error      | `target` is not a literal of the grammar its `metric-type` selects: a ratio without `%`, an unknown duration unit, a lowercase or missing currency code, a negative value on a non-`count`. | Fix the literal, not the enum. The unit lives inside the string on purpose.                                                                      |
| `E_MET_WINDOW`             | error      | `window` is neither `instant` nor a rolling duration — usually a calendar period (`"1 month"`) or free text.                                                                                | Pick the rolling window closest to it; calendar alignment is the reporting tool's job.                                                           |
| `E_JRN_ACTOR_KIND`         | error      | A journey's frontmatter `actor` resolves to something that is not an actor.                                                                                                                 | Point it at a solution-level actor. A component is not a protagonist.                                                                            |
| `W_MET_SUBJECT_SCOPE`      | warning    | The metric is filed outside its subject's ownership line — typically a component filing a number about a sibling it does not own.                                                           | Move it up to the container that owns both, or the subject is wrong. Capability subjects never raise it: a capability has no owner.              |
| `W_CAP_UNREALIZED`         | warning    | No product or component `realizes` the capability.                                                                                                                                          | Read it against `status`. On `draft` it is the to-do list; on **`approved`** it means an agreed description of something the business cannot do. |
| `W_CAP_REALIZATION_EDGE`   | warning    | A capability authors `uses` toward a component — the inverse of `realizes` written by hand.                                                                                                 | Delete it and write `realizes` on the component. The portal already derives `realized-by`.                                                       |

**Journey artifact codes are not in this table, and that is the point.**
`E_JRN_SCHEMA`, `E_JRN_NAME`, `E_JRN_STEP_COUNT`, `E_JRN_BRANCH`,
`W_JRN_ACTOR_ABSENT` and `W_JRN_UNDOCUMENTED_INTEGRATION` come from the
`journey.yaml` parser, which runs when the portal **renders** the journey entity
— exactly like `E_PROTO_*`. The catalog loader reads `journey.yaml` only as a
generic artifact (so a YAML *syntax* error surfaces) and never validates it
against the mini-spec, so a green check says nothing about a journey's steps.
Open the entity's page after writing or editing one.

`E_STRUCT_KIND_PLACEMENT` is **retired** and must never be emitted or cited —
every placement violation is `E_SRN_PLACEMENT` now, raised while the path is
parsed.

## Warnings are drift, not breakage

Only `error` severity decides the exit code, so **a run can pass with warnings
outstanding** — they are printed as ordinary entries and counted in the summary
(`0 errors, 6 warnings`), which is the number to watch across edits. The portal's
diagnostics page shows the same list grouped by severity, if reading them that
way is easier:

```bash
metaframework                        # then http://localhost:6363/diagnostics
# CATALOG_DIR=/abs/path metaframework   # to point it at another catalog
```

Which warnings matter:

- **`W_ARTIFACT_DIALECT`** — matters as a **queue**, not as breakage. It says a
  `transport.yaml`, `states.json`, `workflows/*.yaml`, `journey.yaml`,
  `topology.yaml`, `config.yaml` or `openapi.yaml` does not declare which
  grammar its bytes are written in, so the loader read it as the legacy dialect
  — the format the spec defines today — and everything downstream worked
  normally. Nothing is wrong with the file's content; what is missing is the one
  line that would let a reader tell a migration had happened. The fix and the
  exact value per role are in `references/diagnostics.md`; adding it bumps the
  owning entity's `version`, once per entity however many of its files gain the
  line together. Never raised on `schema.json` (whose missing dialect is already
  the error `E_DM_DIALECT`) or on `examples/*.json` (which carries none by rule).
- **`W_REF_DEPRECATED`** — matters. It means a swap is unfinished. Each one is a
  referrer that still has to be migrated before the old entity can rest.
- **`W_REF_STALE_PIN`** — matters when unintentional. A pin at `@1` against a
  current `@4` is either a deliberate freeze or a forgotten migration; only the
  author knows which, so ask rather than bumping silently. It is *not*
  `E_SRN_VERSION`: that error means the pin resolves to no commit at all, it is
  raised by the history layer rather than the loader, and it never appears among
  the warnings.
- **`W_DM_CONTRADICTION`, `W_DM_UNION_TAG`** — schema-quality signals from the
  datamodel registry; act on them when touching the schema anyway.
- **`W_CAP_UNREALIZED`** — matters *read against `status`*, and not otherwise. On
  a `draft` capability it is the expected state of design in flight; on an
  `approved` one it is the catalog's sharpest single number, an agreed
  description of something the business cannot actually do. Never "fix" it by
  deprecating the capability: `status` describes the document, never the world,
  and a business that has stopped being able to do something still needs that
  fact written down.
- **`W_CAP_REALIZATION_EDGE`, `W_MET_SUBJECT_SCOPE`** — both mean the authoring
  is in the wrong file rather than wrong in substance. The first is an inverse
  edge written by hand; the second is a judgement about accountability that
  should be visible rather than blocked.

## What this check does not cover

Treating a green run as "the catalog is correct" is the most expensive mistake
available here. The check proves the tree *loads*. It does not prove the tree is
*right*, and several specified rules are not machine-checked at all.

- **Outside the check: the git history checks.** `E_VER_REGRESSION` and
  `E_VER_UNBUMPED` are decidable only from commits, so a plain
  `metaframework check` cannot see them. They surface on the entity page, where
  the version check streams in beside the version picker; the gate form is
  `metaframework check --since <ref>`, which exits non-zero when an entity's
  files changed since `<ref>` without a `version` bump (a `status:`-only edit
  is exempt). In CI, `<ref>` is the branch base.
- **Two edges inside the check worth knowing.** A **missing** `journey.yaml` is
  not flagged — only artifacts that exist are parsed — and
  `W_PROTO_STATES_EVENT_UNKNOWN` is deliberately disabled at both call sites,
  so nothing emits it.

  Two things that used to sit in this list no longer do:

  - **The datamodel schema registry (`E_DM_*`) now runs over whatever catalog
    is loaded.** `getCatalog()` composes `loadCatalog` with `buildSchemaRegistry`
    (`src/lib/catalog/index.ts`, `withSchemaRegistry`) and folds the registry's
    diagnostics into `catalog.diagnostics`, so the check and `/diagnostics` show
    loader and schema problems in one list. A missing or mismatched `$id`, an
    absent or disagreeing `x-srn`, a `$ref` naming no entity, an inheritance
    cycle and a closed base all surface there. That covers datamodel identity
    over the real tree: `$id` must be the canonical host
    `https://schemas.metaframework.dev` plus the SRN path, `x-srn` `srn://` plus
    the same path, neither carrying a version, and every non-local `$ref` a
    canonical schema URL naming a real datamodel with a `schema.json` behind it.
- **Specified but not implemented anywhere** — among others: the ADR's four
  required headings (`E_ADR_SECTIONS`), the requirement's `## Acceptance criteria`
  section (`E_REQ_CRITERIA`), `primary-actors` resolving to real actors
  (`E_PROD_ACTOR_TARGET`), protocol participant kinds and duplicate aliases
  (`E_PROTO_PARTICIPANT_KIND`, `E_PROTO_ALIAS_DUP`), protocol NCA placement
  (`W_STRUCT_PROTOCOL_NCA`), unimplemented `must` requirements
  (`W_REQ_UNIMPLEMENTED`), a `library` declaring an environment
  (`E_COMP_LIBRARY_ENVIRONMENT`), a journey entity with no `journey.yaml`
  (`E_JRN_ARTIFACT_MISSING`) or with an unrecognised file beside it
  (`W_JRN_ARTIFACT_UNKNOWN`), and the kind checks on a journey step's own
  references (`E_JRN_TOUCHES_KIND`, `E_JRN_PROTOCOL_KIND`,
  `W_JRN_PROTOCOL_UNRELATED` — these need the resolved catalog and no module
  runs them yet). These are author discipline. Verify them by reading. The full
  list is in `references/diagnostics.md`.
- **Not a modelling review.** Whether the decomposition, placement and relation
  graph make sense is the `catalog-reviewer` agent's job, not this check's.

## Two vitest failures that are not spec violations

Inside the metaframework repository only. Its `fixture-check.test.ts` is also a
regression guard on the acme fixture specifically, with hard-coded expectations
that `metaframework check` knows nothing about. Legitimate catalog work can turn
that suite red while the check stays green:

- adding a relation edge toward `srn://acme/product/billing/component/ledger` —
  one assertion pins that entity's exact inbound edge list;
- adding or renaming a protocol artifact — two assertions pin the exact file
  lists of `order-placement` and `settlement`.

(Adding a second solution under `solutions/` is **not** one of these: the
solutions-list assertion derives its expectation from the directories on disk,
so a new solution passes as long as it loads.)

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
  the codes: `srn.md` (`E_SRN_*`), `frontmatter.md` (`E_FM_*`, `E_MET_*`,
  `W_CAP_*`), `structure.md` (`E_STRUCT_*`, `W_ARTIFACT_DIALECT`),
  `schemas.md` (`E_DM_*`), `protocols.md` (`E_PROTO_*`),
  `journeys.md` (`E_JRN_*`, `W_JRN_*`),
  `environments.md` (`E_ENV_*`, `E_ADR_*`, `E_REQ_*`, `W_ACTOR_*`, `E_COMP_*`),
  `evolution.md` (`E_VER_*`, the swap).
  `W_ARTIFACT_DIALECT` is cross-kind, so `structure.md` holds the whole
  contract — role versus dialect, the discriminator table, the strip rule — and
  `protocols.md`, `journeys.md` and `environments.md` each carry the
  declaration their own artifacts owe.
  When `framework/spec/` is present in the repository it is authoritative and
  wins over all of these.
