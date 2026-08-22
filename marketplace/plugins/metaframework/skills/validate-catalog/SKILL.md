---
name: validate-catalog
description: This skill should be used when the user asks to "validate the catalog", "check the catalog", "run the catalog check", "why is the catalog failing", "`metaframework check` is red", "how do I check a catalog outside the framework repo", "what does E_SRN_DANGLING mean", "fix these diagnostics", or names any metaframework diagnostic code (E_SRN_*, E_FM_*, E_STRUCT_*, E_DM_*, E_ENV_*, E_VER_*, E_PROTO_*, E_JRN_*, E_MET_*, E_ADR_*, E_REQ_*, E_COMP_*, E_PROD_*, E_SOL_*, W_CAP_*, W_ENV_*, W_*). It should also be used immediately after any skill or command creates or edits an entity, since the catalog check is the pass condition for that work. It covers running the check, reading its output, mapping each code family to its usual cause and fix, which warnings matter, and what the check deliberately does not cover. This is legality only — for whether the decomposition, placement and relation graph are any GOOD, use `review-solution`.
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

1 error, 6 warnings — <n> entities across <n> solutions.
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
| `W_ARTIFACT_DIALECT`       | warning    | A sibling artifact declaring no dialect, or one no row of its role recognises — `transport.yaml` has two rows and either satisfies it. Never on `schema.json` or `examples/*.json`.                    | Add the role's declaration as the file's first key — the per-role keys and URLs are in `references/diagnostics.md`. It bumps the owning entity's `version`, once per entity. |
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

Codes from the environment lane. They run in the check because
`withEnvironmentChecks` composes them into the catalog after the schema
registry: `topology.yaml` and `config.yaml` are validated against their content
models, and each `config.yaml` entry is then joined against the hosted
component's **configuration contract** — the `usage: config` datamodel in that
component's own `datamodel/` bucket.

| Code                         | Severity | Usual cause                                                                                                                                                                                      | Fix                                                                                                                                                  |
|------------------------------|----------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| `E_ENV_TOPOLOGY_SCHEMA`      | error    | `topology.yaml` does not parse, or breaks its content model: an unknown non-`x-` key, a region name that is not kebab-case or is declared twice, `replicas.min` above `max`, no `hosts:` at all. | Read the message — it carries the position (`hosts[2].tier`) and the constraint.                                                                     |
| `E_ENV_CONFIG_SCHEMA`        | error    | `config.yaml` the same way: a key that is not `SCREAMING_SNAKE_CASE`, a list-valued `value:`, the same `(key, for)` pair twice, `secret: true` with no `source:`.                                | Same. A key holds one scalar; a list is a delimiter convention the runtime owns and the contract types as a string.                                  |
| `E_ENV_TARGET_KIND`          | error    | A host's `component:` or an entry's `for:` naming something that is not a `component` or a `product` — an actor, a datamodel, or an artifact address.                                            | Name the deployable container. Placement and configuration are about things that run.                                                                |
| `E_ENV_REGION_UNKNOWN`       | error    | A host names a region the file's own `regions:` list does not declare.                                                                                                                           | Declare the region or fix the typo. An absent `regions:` on a host is legal and means "not recorded".                                                |
| `E_ENV_SECRET_VALUE`         | error    | An entry marked `secret: true` carrying a literal `value:`.                                                                                                                                      | Delete the value, name a `source:`. Absolute: the file is public the moment it is committed, so treat the value as leaked.                           |
| `E_ENV_CONFIG_VALUE`         | error    | A `value:` that fails its key's subschema in the resolved contract — an unknown enum member, a number out of range.                                                                              | Fix the value, or the contract if the contract is the wrong one. A quoted scalar is read in its declared type, so `"8000"` for an `integer` is fine. |
| `E_ENV_SECRET_MISMATCH`      | error    | The entry's `secret:` disagrees with the contract's `writeOnly:` for that key, in either direction.                                                                                              | Decide which file is wrong. If it is this one, the value has been in git and is burned.                                                              |
| `E_DM_CONFIG_SHAPE`          | error    | A `usage: config` datamodel that is not one flat process environment: a kebab-case key, a nested property, a `$ref` below the root — or two concrete contracts in one `datamodel/` bucket.       | Flatten it and `SCREAMING_SNAKE` the keys. A surface several components share is `abstract: true`, reached by a root `allOf`.                        |
| `E_DM_CONFIG_SECRET_DEFAULT` | error    | A `writeOnly` property carrying `default`, `const`, `examples` or a one-member `enum`; or an `examples/*.json` instance carrying a key the contract marks `writeOnly`.                           | Delete the value. `writeOnly` says the value arrives at deploy time; the catalog's job was to say the key is expected.                               |

The four `W_ENV_*` warnings this lane emits are in the warnings section below.

Codes from the **kind disciplines**. Six modules — `lib/adr/`,
`lib/requirement/`, `lib/actor/`, `lib/structure/`, `lib/journey/artifacts.ts`
and `lib/datamodel/` — folded in by `withKindChecks` and `withDatamodelChecks`
(`src/lib/catalog/index.ts`). They are grouped by **input** rather than by kind:
every one is answerable from the resolved catalog plus, for four of them, a
directory listing, and none could live in the loader's per-entity pass because
each asks about a *second* entity, a sibling, or a file the loader chose not to
read. Until this release every code below was a rule the specification stated and
nothing enforced.

| Code                         | Severity | Usual cause                                                                                                                                                      | Fix                                                                                                                               |
|------------------------------|----------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| `E_ADR_DATE`                 | error    | `date` is not a bare calendar date — a typo'd day, or a timestamp with a time of day in it. An **unquoted** YAML date is fine now; it was `E_FM_SCHEMA` before.  | Write `YYYY-MM-DD`. Quoting is the habit worth keeping but is no longer load-bearing.                                             |
| `E_ADR_DECIDERS`             | error    | `decision-status` is `accepted` or `rejected` with `deciders` absent or empty. `superseded` does not trigger it.                                                 | Name who took the call. A *mistyped* `deciders` is `E_FM_SCHEMA` instead — read which code you got.                               |
| `E_ADR_SECTIONS`             | error    | A missing `## Context`, `## Decision`, `## Consequences` or `## Alternatives considered` — usually the right text at level 3, or `## Alternatives Considered`.   | One finding per missing section, and the message names the near miss. Fix the heading, not the prose. Order is not enforced.      |
| `E_REQ_CRITERIA`             | error    | No `## Acceptance criteria`, two of them, one that does not open with a bullet list, `- [ ]` task syntax, or a bullet whose first line runs past 200 characters. | One heading, level 2, that casing, opening straight into an unordered list. Detail goes *nested under* a criterion, not into it.  |
| `E_COMP_LIBRARY_ENVIRONMENT` | error    | A `component-type: library` with a `uses` edge to an environment.                                                                                                | Delete the edge. A library runs inside its consumers — this is a category mistake, not a stale fact, which is why it is an error. |
| `E_COMP_EXTERNAL_CHILD`      | error    | A `component-type: external` owning a child **component**.                                                                                                       | Describe the boundary, never the insides. Child datamodels and protocols are fine — that is how the seam gets documented.         |
| `E_COMP_SYMLINK`             | error    | A symlink in a `component/` bucket. Nothing else in the portal can see it: the walk never descends, so the whole subtree is invisible.                           | Make it a real directory. Reuse is a `depends-on` edge on the reusing side (rule C5).                                             |
| `E_PROD_ACTOR_TARGET`        | error    | A `primary-actors` entry naming something that is not an actor, or addressing an artifact of one.                                                                | Point it at a solution-level actor. A dangling entry is `E_SRN_DANGLING` and a bad suffix `E_SRN_ARTIFACT`, on the same field.    |
| `E_SOL_NO_ROOT`              | error    | A directory directly under the catalog root with no `index.md`.                                                                                                  | Write the solution document, or the directory does not belong there. Every SRN beneath it is named against it.                    |
| `E_DM_EXAMPLE_INVALID`       | error    | A file under `examples/` that does not parse as JSON, or fails the entity's own `schema.json`.                                                                   | Fix the instance, or the schema if the instance is right. One finding per file, listing the ajv reasons.                          |
| `E_JRN_ARTIFACT_MISSING`     | error    | A `journey` entity directory with no `journey.yaml`. This is new — a green check now **does** prove the artifact exists.                                         | Write the file. A path under design carries a short one and `status: draft`; frontmatter alone asserts nothing.                   |

The thirteen warnings these modules add are in the warnings section below.

**Journey and protocol artifact codes fail this check too.** `E_JRN_SCHEMA`,
`E_JRN_NAME`, `E_JRN_STEP_COUNT`, `E_JRN_BRANCH`, `W_JRN_ACTOR_ABSENT`,
`W_JRN_UNDOCUMENTED_INTEGRATION` and the `E_PROTO_*` families come from the
mini-spec parsers, and `withArtifactChecks` runs those parsers over every
artifact during the load — the same dispatch table the entity page uses, so the
check and the page derive the same findings from the same file. A broken
`journey.yaml` therefore exits non-zero. `W_PROTO_ARAZZO_UNGROUNDED` rides the
same dispatch without being a mini-spec parser at all: nothing checks an
`arazzo.yaml`'s grammar, and that one branch asks only whether its references
land inside artifacts the entity carries. One thing a green check still does not
prove: that a step's `touches`, `protocol` or `actor` resolves to the right
*kind* — the parser refuses an artifact address there and leaves the kind
question to nobody. (That a journey entity **has** a `journey.yaml` used to be
the second item here; it is `E_JRN_ARTIFACT_MISSING` now.)

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
  `topology.yaml`, `config.yaml`, `openapi.yaml` or `arazzo.yaml` does not
  declare which grammar its bytes are written in, so the loader read it as the
  legacy dialect — the format the spec defines today — and everything downstream
  worked normally. Nothing is wrong with the file's content; what is missing is
  the one line that would let a reader tell a migration had happened. The fix and the
  exact value per role are in `references/diagnostics.md`; adding it bumps the
  owning entity's `version`, once per entity however many of its files gain the
  line together. Never raised on `schema.json` (whose missing dialect is already
  the error `E_DM_DIALECT`) or on `examples/*.json` (which carries none by rule).
  One role has **two** recognised dialects: a `transport.yaml` satisfies this
  code with the framework's `$schema` **or** with AsyncAPI's own
  `asyncapi: 3.1.0`, and neither is the deprecated one. Never "fix" a warned
  transport by converting the document — add the mini-spec `$schema`, which is
  the line the message names and the right answer for every wire.
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
- **`W_ENV_CONFIG_MISSING`** — matters most of the four environment warnings. It
  says a component deployed to this environment requires a key that has no
  default and that no entry here declares: a process that will not start. The
  fix is an entry for the key, with a `source:` if it is a secret — **a
  declaration with no value counts as provided**, because the value arrives at
  deploy time and the catalog's job was to say the key is expected.
- **`W_ENV_HOST_UNDECLARED`, `W_ENV_CONFIG_ORPHAN`** — both mean the two sides of
  membership disagree: a `topology.yaml` host entry, or a config entry's `for:`,
  naming a container that declares no `uses` edge to this environment. Warnings
  rather than errors because during a rollout the environment file may lead the
  component's own declaration by a commit or two. Standing ones are dead
  configuration; add the `uses` edge or delete the entry.
- **`W_ENV_CONFIG_UNDECLARED`** — a `for:`-scoped key that is no property of that
  component's config contract, usually a key renamed or dropped in the component
  and left behind here. Land the contract change first, then the environment: the
  reverse order flags the same key as `W_ENV_CONFIG_MISSING` in between.

The kind disciplines add thirteen more, and they arrive all at once on a catalog
that has never been checked against them. **Expect the warning count to jump the
first time, and triage before you edit** — most of these are true statements
about a system still being built, which is exactly why they are warnings:

- **`W_REQ_UNIMPLEMENTED`** — a `priority: must` requirement nothing
  `implements`. Normally the ordinary order of work: the obligation is written
  before the thing that meets it, and this is the number a solution dashboard
  leads with. It is a finding when the requirement is old, and a *sharp* one when
  its implementers all migrated away in a swap and left the priority stale. There
  is no `status: deprecated` exemption, deliberately.
- **`W_REQ_WONT_IMPLEMENTED`** — the inverse, and it is never routine: the
  catalog claims to satisfy something it recorded as out of scope. Either the
  priority is stale or the `implements` edge is wrong.
- **`W_ACTOR_ORPHAN`** — no protocol lists this actor among its `participants`
  and no journey step gives it a move. Usually a leftover from a swap. Journey
  steps count, so an actor who is the protagonist of a journey is not orphaned;
  the actor's own `uses` edges and a product's `primary-actors` do **not** count,
  because they describe reach rather than a modelled conversation.
- **`W_ACTOR_PARTICIPATION_EDGE`** — the actor authors `uses` toward a protocol.
  The actor mistake authors make most, and the fix is to delete the edge:
  participation is authored once, in the protocol's own `participants`, and a
  copy on the actor is a second list to keep in step.
- **`W_ADR_ORDINAL`** — two ADRs in one bucket claiming one ordinal. Ordinals are
  the shorthand a reader cites and are never reused. Per bucket, not per
  solution, and compared as numbers, so `0002` and `002` collide.
- **`W_ADR_SUPERSESSION`** — supersession bookkeeping disagreeing with itself in
  either direction. Fires legitimately for the one commit between accepting the
  successor and marking the predecessor, so read the successor's standing in the
  message before acting; a standing one means the swap stopped half-done.
- **`W_PROSE_MEASUREMENT`** — a number somebody obtained by running a command,
  typed into a document that claims to describe the present. It was true when it
  was written and nothing keeps it true. The fix is editorial and never a
  re-measurement: keep the claim, drop the digit ("the largest module in
  `src/lib`"), because *largest* stays true while *895 lines* does not. Where the
  count is over the **catalog graph** — entities beneath a container, artifacts
  beneath it — the portal already derives and renders it beside the prose. An
  SLO, a target, a design constant or a domain figure is never this: it was
  decided, not measured, and it does not drift.
- **`W_ADR_MEASUREMENT`** — the same subject in the one bucket allowed to carry
  it. An ADR is a dated snapshot by construction, so it MAY state a measured
  number and MUST say when. Anchor it to a **commit** where you can — `ec0f4be`
  answers in 2030, a working-tree measurement was only ever true for one
  afternoon — and state the anchor once per section: it scopes the heading it
  sits under and everything below, so a census's table rows carry bare digits.
  The frontmatter `date` does not count; it moves when `decision-status` does.
- **`W_COMP_NO_ENVIRONMENT`** — a `service`, `ui`, `job`, `datastore` or
  `gateway` naming nowhere it runs. Exempt at `lifecycle: planned` and `retired`,
  where naming one would be the lie — so a standing one means the environment
  edge was simply never written.
- **`W_COMP_DEP_CYCLE`** — a cycle in `depends-on` among components. Legal and
  flagged, so it is a deliberate choice rather than an accident. One finding per
  cycle, with the path spelled out; pick the edge to cut from it.
- **`W_STRUCT_PROTOCOL_NCA`** — a protocol not filed at the nearest common
  ancestor of its participants. **Below** the NCA is the harmful direction: a
  participant sits outside the protocol's owning subtree, so the contract is
  invisible from the side of the tree that speaks it. **Above** is over-general,
  and costs the reader the one thing placement is for. Moving a published
  protocol is a swap, never a `git mv`.
- **`W_DM_USAGE_MISMATCH`** — a `usage: storage` or `usage: config` datamodel
  named as a protocol message payload. On `storage` the protocol may just be
  ahead of the datamodel's review; on **`config`** it is almost always a real
  finding — either the protocol names the wrong model, or a process is sending
  its own settings to somebody.
- **`W_DM_ABSTRACT_USE`** — an `abstract: true` model carrying `examples/`, named
  as a payload, or the target of an `exposes` edge. Point the referrer at a
  concrete descendant, or the model is not really a base. A `relations.uses` edge
  toward an abstract model is *not* this — that is the pinned-review-target
  idiom, and it is correct.
- **`W_JRN_ARTIFACT_UNKNOWN`** — an unrecognised file or subdirectory beside
  `index.md` and `journey.yaml`. Matters more than it looks: `journey.yml` or
  `place-an-order.yaml` is a path the portal will never read, silently, while the
  author believes it is authored.
- **`W_JRN_PROTOCOL_UNRELATED`** — a step's named protocol lists neither end of
  the hop among its `participants`. The usual cause is a copy-paste from the step
  above. Not restricted to product crossings.

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
- **One edge inside the check worth knowing.** `W_PROTO_STATES_EVENT_UNKNOWN`
  needs `workflowMessages`, which neither call site passes, so nothing emits it.
  A **missing** `journey.yaml` used to sit beside it and no longer does: it is
  `E_JRN_ARTIFACT_MISSING`, an error, raised from the entity directory listing.

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
- **Specified but not implemented anywhere.** This list is a fraction of what it
  was — the kind disciplines above took twenty-four classes out of it — and what
  is left is almost entirely **one kind and one missing reader**:

  - **The protocol kind, sixteen classes.** Nothing validates `transport.yaml`
    at all (`E_PROTO_TRANSPORT_SCHEMA`, `E_PROTO_TRANSPORT_BINDING`,
    `E_PROTO_TRANSPORT_SPEC_CONFLICT`, and the AsyncAPI profile rules that
    arrived with ADR 0017), nothing inspects a protocol entity directory
    (`E_PROTO_SPEC_FILE`, `W_PROTO_ARTIFACT_UNKNOWN`), and nothing judges the
    `participants` list — duplicate aliases (`E_PROTO_ALIAS_DUP`), participant
    kinds (`E_PROTO_PARTICIPANT_KIND`), payload kinds (`E_PROTO_PAYLOAD_KIND`),
    the `exposes`/`uses` cross-check (`W_PROTO_PARTICIPANT_MISSING`,
    `W_PROTO_PARTICIPANT_UNLINKED`), or `style` against the workflows beneath it
    (`W_PROTO_STYLE_MISMATCH`). Three modules now *resolve* that list for their
    own purposes, which is not the same as checking it.

    `W_PROTO_ARAZZO_UNGROUNDED` left this bullet: `lib/protocol/arazzo-grounding.ts`
    emits it, and an `arazzo.yaml` whose source or step references miss the
    siblings its entity carries now warns. Nothing else about the file is
    checked — the framework states no field table for an Arazzo Description, so
    drawing a picture of your document is still not the portal agreeing with it.
  - **`E_DM_NOT_ADDITIVE`**, the only rule in the spec that no input the load
    pipeline has can answer: it diffs `schema.json` at version N−1 out of git
    against the document on disk, and `metaframework check` never spawns git.
  - **The *kind* half of a journey step's own references** —
    `E_JRN_TOUCHES_KIND`, `E_JRN_PROTOCOL_KIND` and `E_JRN_ACTOR_KIND`. Each
    fires on the clause a pure parser can decide (the reference carries an
    artifact suffix) and is silent on the other (the target is the wrong kind),
    which needs the resolved catalog no module hands the parser. A code you see
    is therefore not proof the whole rule ran.

  These are author discipline. Verify them by reading. The full list, with the
  gap named per class, is in `references/diagnostics.md` section 2.
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
  that nothing implements, and the retired codes. Section 1 is organised by
  module, and the newly enforced classes are grouped there under "The kind
  disciplines". Its header carries the one-line `grep` that re-derives the whole
  inventory from source — run it rather than trusting either file if you are
  inside the framework repository.
- **`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/`** — the contracts behind
  the codes: `srn.md` (`E_SRN_*`), `frontmatter.md` (`E_FM_*`, `E_MET_*`,
  `W_CAP_*`), `structure.md` (`E_STRUCT_*`, `W_ARTIFACT_DIALECT`,
  `W_PROSE_MEASUREMENT`, and the ADR half `W_ADR_MEASUREMENT`),
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
