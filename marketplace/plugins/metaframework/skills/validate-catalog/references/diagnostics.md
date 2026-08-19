# Diagnostic code inventory

> Two lists that are deliberately different: what the portal **emits**, and what
> the specification **defines**. The gap between them is the part of the contract
> no machine enforces, and it is where authored catalogs actually go wrong.
>
> Verified against `framework/portal/src/lib/` and `framework/spec/`. When the
> repository is present, re-derive rather than trust this file — a code can be
> implemented between releases of the plugin:
>
> ```bash
> cd framework/portal/src && grep -rhoE "code: '(E|W)_[A-Z0-9_]+'" lib/ | sort -u
> ```

## 1. Codes the portal emits

### `lib/srn/srn.ts` — the SRN parser

Raised while a path or a reference is parsed, therefore **before** any
frontmatter is read. Re-raised by every caller: the catalog loader (on directory
paths and on `relations` references) and the schema registry (on `$ref` URLs).

| Code                   | Raised when                                                                                                            |
|------------------------|-------------------------------------------------------------------------------------------------------------------------|
| `E_SRN_SYNTAX`         | Bad segment; missing `srn://` scheme; query, fragment or percent-encoding; empty SRN; odd path tail; a first-of-pair that is not one of the eight kinds; `@version` off the final segment or repeated; `..` climbing above the solution root. |
| `E_SRN_PLACEMENT`      | P1 a non-container owning something; P2 a `product` pair that is not first; P3 a `component` pair that is first; P4 `actor` or `environment` not first. Messages read literally: `a datamodel cannot own a component`, `a product must be a direct child of the solution`, `a component must live inside a product`, `actor may only live at solution level`. |
| `E_SRN_RESERVED`       | A reserved kind used as the solution name or as an entity name.                                                          |
| `E_SRN_CROSS_SOLUTION` | A network-path reference (`//other/…`) that changes the solution.                                                        |

### `lib/catalog/load.ts` — the catalog loader

What `npx vitest run src/lib/catalog` asserts to be empty of errors.

| Code                     | Severity | Raised when                                                                                       |
|--------------------------|----------|-----------------------------------------------------------------------------------------------------|
| `E_FM_SCHEMA`            | error    | The common frontmatter schema rejects the document (**aborts the entity**), or the kind-specific schema does (does not abort). Message is `field.path: constraint`. |
| `E_FM_UNKNOWN_FIELD`     | error    | A top-level key that is neither a common field, nor a field of the kind implied by disk position, nor `x-` prefixed. |
| `E_FM_NAME_MISMATCH`     | error    | `name` ≠ the directory's basename.                                                                  |
| `E_FM_KIND_LOCATION`     | error    | `kind` ≠ the kind implied by disk position.                                                         |
| `E_FM_EDGE_SOURCE`       | error    | The entity's kind may not author that edge type.                                                    |
| `E_FM_EDGE_TARGET`       | error    | The resolved target's kind is illegal for that edge type.                                           |
| `E_SRN_DANGLING`         | error    | A relation reference resolves to an SRN with no entity in the map.                                  |
| `E_SRN_VERSION`          | **warning** | A `@N` pin ≠ the target's current `version`.                                                     |
| `E_STRUCT_NESTED_ENTITY` | error    | A child `index.md` directly below a non-container entity.                                           |
| `E_STRUCT_MISSING_INDEX` | error    | An entity's computed parent SRN has no entity behind it.                                            |
| `E_STRUCT_DUPLICATE_SRN` | error    | A second directory resolving to an already-registered SRN.                                          |
| `W_REF_DEPRECATED`       | warning  | The relation target has `status: deprecated`.                                                       |

Loader behaviours worth knowing:

- The walk **skips** any directory whose name starts with `.` or `_`.
- Only `.json`, `.yaml`, `.yml` and `.md` files are read as artifacts.
- A directory with no `index.md` and no entity below it produces **no
  diagnostic** — it is indistinguishable from an asset directory.
- `E_FM_SCHEMA` against the *common* contract returns early: the entity is never
  registered, and its absence cascades as `E_SRN_DANGLING` at every referrer and
  `E_STRUCT_MISSING_INDEX` at every child.
- The kind-specific schema is chosen by **disk position**, not by the declared
  `kind`, so a mislabelled entity still gets its real kind's rules applied.

### `lib/schema/registry.ts` — datamodel schemas

Exercised when the portal renders a datamodel page and by hermetic tests — **not
by the catalog suite** over the shipped tree. The catalog suite's
`fixture-check.test.ts` independently asserts, over the real tree, that every
datamodel's `$id` equals its served URL and that every non-local `$ref` is an
absolute schema URL naming a real datamodel with a `schema.json` behind it.

| Code                  | Severity | Raised when                                                                                       |
|-----------------------|----------|-----------------------------------------------------------------------------------------------------|
| `E_DM_SCHEMA_MISSING` | error    | A `datamodel` entity with no `schema.json` — "a datamodel with no schema is prose".                 |
| `E_DM_SCHEMA_INVALID` | error    | Not a JSON object, or ajv rejected the document.                                                    |
| `E_DM_DIALECT`        | error    | `$schema` is not JSON Schema 2020-12.                                                               |
| `E_DM_KEYWORD`        | error    | A forbidden keyword — `$dynamicRef`, `$dynamicAnchor`, `$anchor`, `$vocabulary`.                     |
| `E_DM_ID_MISSING`     | error    | No root `$id`. It must be the URL the portal serves the schema at.                                  |
| `E_DM_ID_MISMATCH`    | error    | Root `$id` ≠ `SCHEMA_BASE_URL` + `/schemas/` + the entity's SRN path.                                |
| `E_DM_ID_FORBIDDEN`   | error    | A nested `$id`, which would re-base every `$ref` beneath it onto a second identity.                 |
| `E_DM_SRN_RETIRED`    | error    | The retired `x-srn` annotation is still present — `$id` carries identity now.                        |
| `E_DM_REF_TARGET`     | error    | A `$ref` that is not an absolute schema URL of this portal, or whose path after `/schemas/` is not a legal entity address. |
| `E_DM_REF_ESCAPE`     | error    | A `$ref` leaving the `/schemas/` namespace.                                                          |
| `E_DM_FOREIGN_DEFS`   | error    | A `$ref` pointing into another entity's `$defs`. Promote the shared shape to its own datamodel.       |
| `E_DM_INHERIT_CYCLE`  | error    | A root-`allOf` inheritance cycle.                                                                    |
| `E_DM_CLOSED_BASE`    | error    | `"additionalProperties": false` on a schema used as an `allOf` base.                                 |
| `W_DM_CONTRADICTION`  | warning  | A property constrained to disjoint types by the conjunction — no instance can satisfy it.            |
| `W_DM_UNION_TAG`      | warning  | A `oneOf` with no shared `const` tag, rendered as an opaque union.                                   |

### `lib/protocol/states.ts` and `lib/protocol/workflow.ts`

Exercised when the portal renders a protocol page. Not run by the catalog suite.

| Code                          | Severity | Artifact                                     |
|-------------------------------|----------|----------------------------------------------|
| `E_PROTO_STATES_SUBSET`       | error    | `states.json` — unsupported XState key        |
| `E_PROTO_STATES_ID`           | error    | `states.json` — bad or missing state id       |
| `E_PROTO_STATES_TARGET`       | error    | `states.json` — transition to unknown state   |
| `E_PROTO_STATES_EVENT_NAME`   | error    | `states.json` — malformed event name          |
| `W_PROTO_STATES_EVENT_UNKNOWN`| warning  | `states.json` — event maps to no known message |
| `W_PROTO_STATES_UNREACHABLE`  | warning  | `states.json` — unreachable state             |
| `E_PROTO_WF_SCHEMA`           | error    | `workflows/*.yaml` — shape violation           |
| `E_PROTO_WF_NAME`             | error    | `workflows/*.yaml` — bad workflow name         |
| `E_PROTO_WF_STEP_SHAPE`       | error    | `workflows/*.yaml` — malformed step            |
| `E_PROTO_WF_ALIAS`            | error    | `workflows/*.yaml` — `from`/`to` is not a declared participant alias |
| `E_PROTO_WF_EMPTY_BRANCH`     | error    | `workflows/*.yaml` — a branch with no steps    |
| `E_PROTO_WF_FANOUT`           | error    | `workflows/*.yaml` — illegal fan-out           |
| `E_PROTO_WF_DEPTH`            | error    | `workflows/*.yaml` — nesting past the limit    |
| `W_PROTO_WF_ORPHAN_RETURN`    | warning  | `workflows/*.yaml` — a return with no request  |

### `lib/history/git.ts` — version history

Needs unshallow git history at the portal's location; degrades gracefully.

| Code               | Severity | Raised when                                                                        |
|--------------------|----------|--------------------------------------------------------------------------------------|
| `E_VER_REGRESSION` | error    | Across the commits of an entity's `index.md`, `version` decreased or jumped by more than 1. Skipped when the log was truncated. |
| `E_SRN_VERSION`    | error    | A pinned `@N` resolves to no commit. With a shallow clone the message carries a "shallow history" hint — the fix is `git fetch --unshallow`, not a catalog edit. |

## 2. Specified but not implemented

Nothing emits these. They are real rules of the specification and a catalog can
violate every one of them with a green check. Verify by reading.

**Entity body and frontmatter**

| Code                  | Rule that goes unchecked                                                                 |
|-----------------------|--------------------------------------------------------------------------------------------|
| `E_ADR_SECTIONS`      | An ADR body carries exactly `## Context`, `## Decision`, `## Consequences`, `## Alternatives considered`. |
| `E_ADR_DATE`          | `date` is a bare `YYYY-MM-DD`. *(Partially covered — the zod schema enforces the format and reports it as `E_FM_SCHEMA`.)* |
| `E_ADR_DECIDERS`      | `deciders` non-empty once accepted/rejected/superseded. *(Same — surfaces as `E_FM_SCHEMA`.)* |
| `E_REQ_CRITERIA`      | `## Acceptance criteria` appears exactly once, level 2, that casing, content beginning with a non-empty unordered list, no task-list syntax, each item's first line ≤ 200 chars. |
| `E_PROD_ACTOR_TARGET` | Every `primary-actors` entry resolves to a solution-level `actor`.                          |
| `E_SOL_NO_ROOT`       | Every directory directly under `solutions/` contains an `index.md`.                         |

**Structure and components**

| Code                        | Rule that goes unchecked                                                        |
|-----------------------------|-----------------------------------------------------------------------------------|
| `W_STRUCT_PROTOCOL_NCA`     | A protocol sits at the nearest common ancestor of its component/product participants. |
| `E_COMP_LIBRARY_ENVIRONMENT`| A `library` component does not declare `uses: /environment/…`.                     |
| `E_COMP_EXTERNAL_CHILD`     | An `external` component contains no child component entities — its insides are not described. |
| `E_COMP_SYMLINK`            | A component directory is a real directory, never a symlink (rule C5).             |
| `W_COMP_NO_ENVIRONMENT`     | A runtime-bearing component (`service`, `ui`, `job`, `datastore`, `gateway`) declares at least one environment. |
| `W_COMP_DEP_CYCLE`          | No cycle in `depends-on`.                                                          |

**Protocols**

`E_PROTO_PARTICIPANTS` (≥ 2 — *covered by the zod schema, surfaces as
`E_FM_SCHEMA`*), `E_PROTO_ALIAS_DUP`, `E_PROTO_PARTICIPANT_KIND`,
`E_PROTO_PAYLOAD_KIND`, `E_PROTO_TRANSPORT_SCHEMA`, `E_PROTO_TRANSPORT_BINDING`,
`E_PROTO_TRANSPORT_SPEC_CONFLICT`, `E_PROTO_SPEC_FILE`,
`W_PROTO_ARTIFACT_UNKNOWN`, `W_PROTO_PARTICIPANT_MISSING`,
`W_PROTO_PARTICIPANT_UNLINKED`, `W_PROTO_STYLE_MISMATCH`,
`W_PROTO_WF_CHANNEL_UNKNOWN`.

**Environments**

`E_ENV_TARGET_KIND`, `E_ENV_TOPOLOGY_SCHEMA`, `E_ENV_CONFIG_SCHEMA`,
`E_ENV_SECRET_VALUE` (a `config.yaml` entry marked `secret: true` carrying a
literal `value` — worth checking by hand every single time),
`E_ENV_REGION_UNKNOWN`, `W_ENV_HOST_UNDECLARED` (a `topology.yaml` host entry for
a component that has not declared this environment), `W_ENV_CONFIG_ORPHAN`.

**Data models**

`E_DM_EXAMPLE_INVALID` (every file in `examples/` validates against
`schema.json`), `E_DM_NOT_ADDITIVE` (the change tightens the schema — needs a
swap, not a version bump), `W_DM_ABSTRACT_USE`, `W_DM_UNPINNED_REF`,
`W_DM_USAGE_MISMATCH`.

**Graph-level warnings**

`W_ACTOR_ORPHAN` (an actor in no protocol participant list and no workflow step),
`W_ACTOR_PARTICIPATION_EDGE` (an actor authoring a `uses` edge to a protocol —
participation belongs to the protocol's own artifacts, and this is the actor
mistake authors make most), `W_ADR_ORDINAL` (a duplicate ordinal within one
`adr/` bucket), `W_ADR_SUPERSESSION`, `W_REQ_UNIMPLEMENTED` (a `priority: must`
requirement nothing `implements`), `W_REQ_WONT_IMPLEMENTED` (a `priority: wont`
requirement something does implement).

The `catalog-reviewer` agent covers most of this list by reading rather than by
running — invoke it when the check is green but confidence is not.

## 3. Retired codes

Never emit or cite these; a mention in older prose is stale.

| Code                      | Superseded by                                                    |
|---------------------------|--------------------------------------------------------------------|
| `E_STRUCT_KIND_PLACEMENT` | `E_SRN_PLACEMENT` — placement is grammar, checked while parsing.  |
| `E_VER_ID_MISMATCH`       | Nothing. The rule it guarded no longer exists.                    |
| `E_DM_SRN_MISMATCH`, `E_DM_ID_INVALID`, `E_DM_REF_KIND` | `E_DM_ID_MISMATCH`, `E_DM_REF_TARGET` under the served-URL convention. |

## 4. Spec discrepancies to be aware of

- **`E_SRN_VERSION` severity.** The specification classes a stale pin as error
  V7. The catalog loader emits it as a **warning** (a pin that does not match the
  current version is not fatal, because historic versions resolve from git);
  `lib/history/git.ts` emits it as an error when the commit genuinely does not
  exist. A green catalog check therefore does not mean every pin is current.
- **`framework/spec/evolution.md` version 2** still illustrates schema examples
  with the retired form (no `$id`, relative `$ref`s). Its *versioning* rules are
  current; its schema snippets are not. `_shared/references/schemas.md` has the
  current conventions.
