# Diagnostic code inventory

> Two lists that are deliberately different: what the portal **emits**, and what
> the specification **defines**. The gap between them is the part of the contract
> no machine enforces, and it is where authored catalogs actually go wrong.
>
> Verified against `framework/portal/src/lib/`, `framework/portal/bin/` and
> `framework/spec/`. None of them is needed to run the check — but if you happen
> to be working inside the metaframework repository, re-derive rather than trust
> this file, since a code can be implemented between releases of the plugin:
>
> ```bash
> cd framework/portal && \
>   grep -rhoaE "'[EW]_[A-Z0-9_]+'" --include='*.ts' --include='*.mjs' \
>     --exclude='*.test.ts' --exclude='*.test.mjs' src/lib bin | sort -u
> ```
>
> Four details of that command are load-bearing, and the version printed here
> before this release got two of them wrong. Many emitters hand the code to a
> local helper — `error('E_JRN_BRANCH', …)`, `at('E_DM_CONFIG_SHAPE', …)` — rather
> than writing `code:`, so matching the bare literal is the only total pattern;
> `-a` is required because a source file carrying a raw NUL byte reads as *binary*
> and **grep then skips it in silence**, dropping every code it emits; excluding
> the test files keeps a fixture's expectations out of the inventory; and `bin`
> belongs in the search path because the `--since` gate raises a class of its own
> from there. Today that last one changes nothing — `bin/since.mjs` raises
> `E_VER_UNBUMPED`, which `src/lib/history/git.ts` raises too, so both spellings
> print the same set — but a class added only to the CLI would otherwise be
> invisible to the command this file tells you to trust. (The size of that set is
> deliberately not written here: it moves whenever a class gains an emitter, and
> a number restated beside the command that derives it is a number that goes
> stale between one release of this plugin and the next.)
>
> Section 1 below carries a row for every code that command prints and no row
> for anything else — one row each, with a single deliberate exception:
> `E_JRN_ACTOR_KIND` is emitted by two modules on two different fields, so it is
> listed under each. Section 2 is its complement — documented by the spec,
> emitted by nothing — so a code in neither section is a code this file has
> fallen behind on.
>
> **Both claims are machine-checked, and neither is checked in this file.** Two
> gates own it, and they answer different questions:
>
> - `framework/portal/src/lib/catalog/diagnostic-coverage.test.ts` asks whether
>   the **spec** and the **portal** agree. It reads the spec's own definition
>   tables at run time, intersects them with the code literals in the shipped
>   source, and fails on any documented code with no emitter that is not named in
>   its `UNIMPLEMENTED` register. The register is a ratchet rather than an
>   exemption list — a second assertion fails the moment an entry gains an emitter
>   — so a rule cannot be implemented without its line coming out.
> - `framework/portal/scripts/repo-hygiene.mjs` asks whether **this file** agrees
>   with both, and it runs on every push. Four comparisons: every emitted code has
>   a section 1 row; nothing section 2 calls a gap has an emitter; nothing section
>   3 retires has an emitter; and section 2's gap set equals `UNIMPLEMENTED`
>   exactly. This inventory desynced from the portal six times during 0.2.0, and
>   every one of the six was one of those four.
>
> **Section 2 is that register, in prose.** It holds no classes at all: the kind
> disciplines under `lib/{adr,requirement,actor,structure,datamodel}/`,
> `lib/journey/artifacts.ts` and the four modules under `lib/protocol/` moved the
> last forty-one into section 1. What is left is two-and-a-half journey rules and
> two payload-reference gaps, none of which is a whole code.
>
> **The drift test, if you are re-verifying this file by hand.** Intersect the
> codes section 2 *names as gaps* with the codes that grep prints: it must be
> empty. A whole-section regex prints five instead, and all five are expected —
> `E_JRN_TOUCHES_KIND`, `E_JRN_PROTOCOL_KIND` and `E_JRN_ACTOR_KIND` are the
> three **Half** rules, whose first clause genuinely fires, and `E_FM_SCHEMA` and
> `E_VER_UNBUMPED` are cited only as the codes that fire *instead of* a gap. A
> sixth is a defect. The gate draws that same line without keeping a list of
> exceptions to rot: each of the five already has a **section 1 definition row**,
> and a row is the claim "this code is emitted" where a mention in prose is only a
> cross-reference. In the other direction the test is exact and has no exceptions:
> **every code grep prints appears somewhere in section 1.**

## 1. Codes the portal emits

### `lib/srn/srn.ts` — the SRN parser

Raised while a path or a reference is parsed, therefore **before** any
frontmatter is read. Re-raised by every caller: the catalog loader (on directory
paths and on `relations` references) and the schema registry (on `$ref` URLs).

| Code                   | Raised when                                                                                                                                                                                                                                                                                                                                                                                                  |
|------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `E_SRN_SYNTAX`         | Bad segment; missing `srn://` scheme; query, fragment or percent-encoding; empty SRN; odd path tail; a first-of-pair that is not one of the eleven kinds; `@version` off the final segment or repeated; `..` climbing above the solution root.                                                                                                                                                               |
| `E_SRN_PLACEMENT`      | P1 a non-container owning something; P2 a `product` pair that is not first; P3 a `component` pair that is first; P4 a solution-level kind (`actor`, `environment`, `capability`, `journey`) not first. Messages read literally: `a datamodel cannot own a component`, `a product must be a direct child of the solution`, `a component must live inside a product`, `actor may only live at solution level`. |
| `E_SRN_RESERVED`       | A reserved kind used as the solution name or as an entity name.                                                                                                                                                                                                                                                                                                                                              |
| `E_SRN_CROSS_SOLUTION` | A network-path reference (`//other/…`) that changes the solution.                                                                                                                                                                                                                                                                                                                                            |
| `E_SRN_ARTIFACT`       | V5, the artifact role table: a dot suffix on a kind that owns no roles at all (`/actor/customer.profile`), a role that kind does not own, or a known role at the wrong depth (`….workflows` without a name, `….examples.a.b`). The vocabulary is static and this is decided without reading the catalog, which is why it precedes every surface class that also refuses a suffix.                            |

The role table and its `assertArtifactRole` fence live one file over, in
`lib/srn/artifacts.ts`; `srn.ts` declares the code and re-exports the error.
Every reference surface in the framework calls that fence, which is why a suffix
outside the table fails identically in `relations`, in `primary-actors`, in a
journey step and in an environment file.

### `lib/catalog/load.ts` — the catalog loader

What `metaframework check` reports. The `error` rows are the ones that make it
exit non-zero; the `warning` rows print and are counted, and pass.

| Code                       | Severity   | Raised when                                                                                                                                                         |
|----------------------------|------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `E_FM_SCHEMA`              | error      | The common frontmatter schema rejects the document (**aborts the entity**), or the kind-specific schema does (does not abort). Message is `field.path: constraint`. |
| `E_FM_UNKNOWN_FIELD`       | error      | A top-level key that is neither a common field, nor a field of the kind implied by disk position, nor `x-` prefixed.                                                |
| `E_FM_NAME_MISMATCH`       | error      | `name` ≠ the directory's basename.                                                                                                                                  |
| `E_FM_KIND_LOCATION`       | error      | `kind` ≠ the kind implied by disk position.                                                                                                                         |
| `E_FM_EDGE_SOURCE`         | error      | The entity's kind may not author that edge type.                                                                                                                    |
| `E_FM_EDGE_TARGET`         | error      | The resolved target's kind is illegal for that edge type.                                                                                                           |
| `E_SRN_DANGLING`           | error      | A relation reference resolves to an SRN with no entity in the map.                                                                                                  |
| `E_STRUCT_NESTED_ENTITY`   | error      | A child `index.md` directly below a non-container entity.                                                                                                           |
| `E_STRUCT_MISSING_INDEX`   | error      | An entity's computed parent SRN has no entity behind it.                                                                                                            |
| `E_STRUCT_DUPLICATE_SRN`   | error      | A second directory resolving to an already-registered SRN.                                                                                                          |
| `E_STRUCT_BODY_H1`         | error      | A level-1 heading in the prose; the page already renders `title` as the h1.                                                                                         |
| `W_ARTIFACT_DIALECT`       | warning    | An artifact whose role carries a discriminator declares none, or declares one that role does not recognise. Pathed at the file, raised on the entity that owns it.  |
| `W_REF_DEPRECATED`         | warning    | The relation target has `status: deprecated`.                                                                                                                       |
| `W_REF_STALE_PIN`          | warning    | A `@N` pin that resolves but is behind the target's current `version`.                                                                                              |

**`W_ARTIFACT_DIALECT` — the fix is one line, and the line differs per role.**
A role names a *file*, never a format, so every addressable artifact declares in
its own bytes which grammar it is written in. The cross-kind contract is
`framework/spec/structure.md`, "The dialect behind the role", distilled into the
shared bundle's `structure.md` as "Artifact dialects — the grammar inside the
file"; the per-kind half sits in `protocols.md`, `journeys.md` and
`environments.md` beside each artifact it applies to. The loader reads that
declaration in the same pass that reads
the artifacts, records it, and — for the framework's own key — deletes it before
any mini-spec parser is handed the document, which is why
`E_PROTO_STATES_SUBSET` and `E_JRN_SCHEMA` stay strict with nothing carved out
for it. Writing `{meta}` for
`https://schemas.metaframework.dev/metaframework/product/specification/datamodel`,
the declaration to add is:

| Artifact                | Key        | Value to add                    |
|-------------------------|------------|---------------------------------|
| `transport.yaml`        | `$schema`  | `{meta}/transport-document`     |
| `transport.yaml`        | `asyncapi` | `3.1.0` (an AsyncAPI document)  |
| `states.json`           | `$schema`  | `{meta}/state-machine-document` |
| `workflows/<name>.yaml` | `$schema`  | `{meta}/workflow-document`      |
| `journey.yaml`          | `$schema`  | `{meta}/journey-document`       |
| `topology.yaml`         | `$schema`  | `{meta}/topology-document`      |
| `config.yaml`           | `$schema`  | `{meta}/config-document`        |
| `openapi.yaml`          | `openapi`  | `3.1.0`                         |
| `arazzo.yaml`           | `arazzo`   | `1.1.0`                         |

**`transport.yaml` is the one role with two live dialects, and it is not a
migration window with an end** (ADR 0017): `in-process` and `grpc` transports
have no AsyncAPI expression at all, so the framework mini-spec is permanent
beside it. Which one a file is in is the file's own statement, and the order
above is load-bearing twice — a *headerless* transport is told to add the
mini-spec `$schema`, which is the right advice for every wire AsyncAPI does not
describe, and a file declaring **both** keys is read as the mini-spec, where
`asyncapi:` is then an unknown non-`x-` top-level key its field table rejects.
Declare one.

`openapi:` and `asyncapi:` are their formats' own keys, so they are never
stripped, and each is recognised across the band its own standard promises:
`3.1.x` for OpenAPI, which versions the *document* (a patch release to `3.1.1` is
the same dialect and is not warned; `3.0` is a different grammar), and the whole
of `3.x` for AsyncAPI, whose version-string section says a minor increment should
not interfere with tooling written for a lower minor and that the patch version
is not to be considered at all. A value outside the band is the second message
form below — declared, unrecognised, read as the legacy dialect. The six
framework URLs carry **no `@version`**: they name a dialect, not a revision of
one.

Two roles never raise this code. `schema.json` answers the same question with an
error already — `$schema` there is JSON Schema's own key and any value but
`https://json-schema.org/draft/2020-12/schema` is `E_DM_DIALECT` — and
`examples/*.json` carries no discriminator **at all, by rule**: an example is an
instance of its sibling schema, so a `$schema` in it is one more property the
schema would have to admit.

There are two message forms, and both end in the same clause — that clause is
the contract:

```text
warning W_ARTIFACT_DIALECT  acme/protocol/settlement/transport.yaml
        transport.yaml declares no dialect — read as the legacy dialect; add
        `$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/transport-document`

warning W_ARTIFACT_DIALECT  acme/protocol/settlement/states.json
        states.json declares dialect "https://example.com/foo", which is not a
        known dialect of the states role — read as the legacy dialect
```

The path is the **artifact file**, not the entity's `index.md` — an artifact is
not an entity and has no diagnostics of its own, so the finding is raised on the
entity that owns it and pathed at the file that caused it. The file is still
parsed, still rendered and still checked against the grammar the spec defines
today, so nothing in this class can make a catalog that loads today stop
loading — treat a run full of them as a migration queue, not as breakage.

On a native-discriminator role the absent form names that role's own key
instead, because that is what an author has to paste:

```text
openapi.yaml declares no dialect — read as the legacy dialect; add `openapi: 3.1.0`
```

Adding the line is a content change to a sibling artifact, so it bumps the
owning entity's `version` by exactly 1, **once per entity** however many of its
files gain a header in the same commit.

Graph-shape checks the loader gained with the `capability`, `journey` and
`metric` kinds (`checkGraphShape` in the same module; `E_MET_TARGET` and
`E_MET_WINDOW` come from `lib/catalog/frontmatter.ts`, which carries the literal
grammars because everything a zod schema rejects would otherwise be
`E_FM_SCHEMA`):

| Code                     | Severity | Raised when                                                                                                                                                                                                     |
|--------------------------|----------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `E_MET_NO_SUBJECT`       | error    | A `kind: metric` entity has no `measures` relation. The only relation edge any kind requires.                                                                                                                   |
| `E_MET_TARGET`           | error    | `target` does not match the grammar its `metric-type` selects. Checked only when `metric-type` is itself a valid enum value — a bad enum is already `E_FM_SCHEMA` and saying so twice helps nobody.             |
| `E_MET_WINDOW`           | error    | `window` is neither `instant` nor `decimal + ms/s/m/h/d`.                                                                                                                                                       |
| `E_JRN_ACTOR_KIND`       | error    | A journey's frontmatter `actor` resolves to an entity whose kind is not `actor`. (A dangling one is `E_SRN_DANGLING`; the reference is a plain frontmatter field, not a relation, so nothing else resolves it.) |
| `W_MET_SUBJECT_SCOPE`    | warning  | The metric's owning container is neither the subject's owner nor an ancestor of it. A `capability` subject is exempt — it is solution-level and owned by nobody, so the rule would say nothing.                 |
| `W_CAP_UNREALIZED`       | warning  | No inbound `realizes` edge on a `kind: capability` entity.                                                                                                                                                      |
| `W_CAP_REALIZATION_EDGE` | warning  | A capability authors `uses` toward a `component` — the inverse of `realizes` written by hand.                                                                                                                   |

Edge legality for the two new edge types is ordinary `E_FM_EDGE_SOURCE` /
`E_FM_EDGE_TARGET`: `realizes` may be authored only by a product or component and
may point only at a capability; `measures` may be authored only by a metric and
may point at a capability, component, protocol or requirement.

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
- `E_STRUCT_BODY_H1` covers both spellings of a level-1 heading — `# Title` and
  a `=` underline — and ignores anything inside a fenced block, where a `#` is a
  path comment. The fix is to delete the heading: it repeated frontmatter
  `title`, which the page renders as the h1.

### `lib/schema/registry.ts` — datamodel schemas

Built on every catalog load: `getCatalog()` composes `loadCatalog` with
`buildSchemaRegistry` (`withSchemaRegistry` in `src/lib/catalog/index.ts`) and
folds the registry's diagnostics into `catalog.diagnostics`, so these codes
reach `/diagnostics` beside the loader's. `metaframework check` runs the same
composition, so every datamodel's `$id` and `x-srn` are checked against its own
path and every non-local `$ref` against the registry on every run.

Identity is derived from the directory and *checked*, never trusted from the
file. The host in `$id` is the canonical constant
`https://schemas.metaframework.dev` — **not** `SCHEMA_BASE_URL`, which governs
only the portal's `/schemas` serving route.

| Code                  | Severity | Raised when                                                                                                                                                                                    |
|-----------------------|----------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `E_DM_SCHEMA_MISSING` | error    | A `datamodel` entity with no `schema.json` — "a datamodel with no schema is prose".                                                                                                            |
| `E_DM_SCHEMA_INVALID` | error    | Not a JSON object, or ajv rejected the document.                                                                                                                                               |
| `E_DM_DIALECT`        | error    | `$schema` is not JSON Schema 2020-12.                                                                                                                                                          |
| `E_DM_KEYWORD`        | error    | A forbidden keyword — `$dynamicRef`, `$dynamicAnchor`, `$anchor`, `$vocabulary`.                                                                                                               |
| `E_DM_ID_MISSING`     | error    | No root `$id`. It must be the entity's canonical schema URL.                                                                                                                                   |
| `E_DM_ID_MISMATCH`    | error    | Root `$id` ≠ `https://schemas.metaframework.dev/` + the entity's SRN path — wrong entity, wrong host (a serving address such as `http://localhost:3000/schemas/…` included), or a version pin. |
| `E_DM_ID_FORBIDDEN`   | error    | A nested `$id`, which would re-base every `$ref` beneath it onto a second identity.                                                                                                            |
| `E_DM_SRN_MISSING`    | error    | No `x-srn`. It is required and carries the entity's unversioned SRN.                                                                                                                           |
| `E_DM_SRN_MISMATCH`   | error    | `x-srn` ≠ the unversioned SRN of the directory the file sits in (a `@N` pin included).                                                                                                         |
| `E_DM_REF_TARGET`     | error    | A `$ref` that is not a canonical schema URL, or whose path after the host is not a legal entity address.                                                                                       |
| `E_DM_FOREIGN_DEFS`   | error    | A `$ref` pointing into another entity's `$defs`. Promote the shared shape to its own datamodel.                                                                                                |
| `E_DM_INHERIT_CYCLE`  | error    | A root-`allOf` inheritance cycle.                                                                                                                                                              |
| `E_DM_CLOSED_BASE`    | error    | `"additionalProperties": false` on a schema used as an `allOf` base.                                                                                                                           |
| `W_DM_CONTRADICTION`  | warning  | A property constrained to disjoint types by the conjunction — no instance can satisfy it.                                                                                                      |
| `W_DM_UNION_TAG`      | warning  | A `oneOf` with no shared `const` tag, rendered as an opaque union.                                                                                                                             |

### `lib/schema/config-contract.ts` — `usage: config` contracts

A component's configuration contract is an ordinary `datamodel` entity in that
component's own `datamodel/` bucket carrying `usage: config`
(`framework/spec/kinds/datamodel.md`). This module reads them — one flattened,
joinable view per component — and checks the discipline the kind document states.
It runs **after** the registry (`withEnvironmentChecks` in
`src/lib/catalog/index.ts`), because it reads the *flattened* contract — the
conjunction with every root `allOf` branch resolved, so a `writeOnly` inherited
from a mixin is as much a secret as one written in place — and flattening needs
resolutions only the registry has. Both codes reach `metaframework check` and
`/diagnostics`.

| Code                         | Severity | Raised when                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
|------------------------------|----------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `E_DM_CONFIG_SHAPE`          | error    | The contract is not one flat process environment: root `type` is not `object`; a property name is not `SCREAMING_SNAKE_CASE`; a property is not a scalar (typed `object`/`array`, carrying `properties`/`items`/`required`/`contains`/…, or an `enum`/`const` over non-scalars); a `$ref` sits below the root; or one `datamodel/` bucket holds **two concrete** contracts, which is filed once against each of them, on `index.md` rather than on the schema. |
| `E_DM_CONFIG_SECRET_DEFAULT` | error    | A secret value in git: a `writeOnly` property carrying `default`, `const`, `examples` or a single-member `enum`, or an `examples/*.json` instance carrying a key the flattened contract marks `writeOnly`.                                                                                                                                                                                                                                                     |

Both are checked on abstract mixins too, because a mixin's keys become somebody's
contract the moment it is `allOf`-referenced. The one rule that treats a mixin
differently is the bucket cap, which counts concrete models only.

Fixes: a nested shape is not flattened by convention here — promote it to its own
datamodel and let the runtime parse a string, or spell the leaves out as separate
keys. A surface several components share is `abstract: true` and reached by a root
`allOf`, which is also the fix for two contracts in one bucket. For a secret,
delete the value: `writeOnly` says the value arrives at deploy time, and the
catalog's job was to say the key is expected. A property that declares no type at
all is deliberately **not** flagged — it constrains nothing and joins by name like
any other key.

### `lib/environment/environment.ts` — `topology.yaml` and `config.yaml`

The environment artifacts, and the join against the contract above. Composed into
the catalog by the same `withEnvironmentChecks` call, so all eleven codes reach
`metaframework check` and `/diagnostics` — the seven errors failing the run, the
four warnings printed and counted. ENV4–ENV8 and the syntactic
half of ENV11 are decidable from the file alone; ENV9, ENV10 and ENV12–ENV15 need
the resolved catalog, and the last four need a second entity's schema.

| Code                      | Severity | Rule        | Raised when                                                                                                                                                                                                                                                                                                  |
|---------------------------|----------|-------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `E_ENV_TOPOLOGY_SCHEMA`   | error    | ENV4        | `topology.yaml` does not parse as YAML, or breaks its content model: no `hosts:` key at all (it is required; `regions:` is not), an unknown non-`x-` key at file, region, host or `replicas` level, a region name that is not kebab-case or is declared twice, `replicas.min` above `replicas.max`.          |
| `E_ENV_CONFIG_SCHEMA`     | error    | ENV5        | `config.yaml` does not parse, or breaks its content model: a key that is not `SCREAMING_SNAKE_CASE`, a `value:` that is not a scalar, an unknown non-`x-` key, the same `(key, for)` pair declared twice, or `secret: true` with no `source:`.                                                               |
| `E_ENV_TARGET_KIND`       | error    | ENV6, ENV11 | A host entry's `component:` or a config entry's `for:` resolves to an entity that is neither a `component` nor a `product` — or addresses an **artifact** of one (`….transport`), which has no kind to be either. A suffix outside the addressed kind's role table fails earlier still, as `E_SRN_ARTIFACT`. |
| `E_ENV_REGION_UNKNOWN`    | error    | ENV7        | A host entry names a region the same file's `regions:` list does not declare. An absent `regions:` on a host is "placement not recorded", never "everywhere", and raises nothing.                                                                                                                            |
| `E_ENV_SECRET_VALUE`      | error    | ENV8        | An entry marked `secret: true` carries a `value:`. Absolute, at any `status`: the file is reviewable in git, so everything in it is public.                                                                                                                                                                  |
| `E_ENV_CONFIG_VALUE`      | error    | ENV12       | A declared `value:` fails its key's subschema in the resolved contract. Every value is read as written **and** in the literal reading its declared type licenses, so `"8000"` against `{"type": "integer"}` passes; the reading is lexical and never semantic, so `"1"` against `{"type": "boolean"}` fails. |
| `E_ENV_SECRET_MISMATCH`   | error    | ENV13       | The entry's `secret:` disagrees with the contract's `writeOnly:` for that key — in **either** direction, both errors. One of the two files is wrong now, and the cost of assuming the relaxed reading is a credential in a public repository.                                                                |
| `W_ENV_HOST_UNDECLARED`   | warning  | ENV9        | A host entry names a container that declares no `uses` edge to this environment. Membership is authored on the component side; a warning because during a rollout the topology may lead the component's own declaration by a commit or two.                                                                  |
| `W_ENV_CONFIG_ORPHAN`     | warning  | ENV10       | A `for:` target that declares no `uses` edge to this environment — dead configuration, warned for the same rollout reason.                                                                                                                                                                                   |
| `W_ENV_CONFIG_MISSING`    | warning  | ENV14       | A component hosted here requires a key that carries no `default`, and no entry's scope covers that component. Pathed at the file with no line, because the finding is an absence; the message names the component and the keys.                                                                              |
| `W_ENV_CONFIG_UNDECLARED` | warning  | ENV15       | A `for:`-scoped key that is no property of that target's contract — usually a key renamed or dropped in the component and left behind here. An entry with **no** `for:` never raises it: a platform key no modelled component reads is the ordinary reason an entry has no `for:`.                           |

An unresolvable reference in either file is re-raised as the SRN parser's own
code — `E_SRN_DANGLING` for a well-formed reference to nothing, `E_SRN_SYNTAX`
for one that never parsed — exactly as in `relations`.

Two properties of the join are worth knowing before reading a report:

- **Which contract an entry is checked against.** A `for:` naming a component
  uses that component's contract; a `for:` naming a product uses the contract of
  each component beneath it; an entry with no `for:` is checked against every
  hosted contract **that declares the key**, which is what makes an
  environment-wide entry checkable without inventing findings for platform keys.
- **A component with no `usage: config` datamodel produces none of ENV12–ENV15.**
  There is nothing to join against, so silence there is a missing contract rather
  than a clean environment — and a bucket holding two concrete contracts is
  skipped for the same reason, its own finding already being
  `E_DM_CONFIG_SHAPE`.

### `lib/protocol/states.ts` and `lib/protocol/workflow.ts`

Run by `metaframework check` and `/diagnostics` — `withArtifactChecks`
(`src/lib/catalog/artifact-checks.ts`) folds these parsers into the catalog
composition with the same dispatch table the entity page uses, so both surfaces
derive the same findings from the same file. One deliberate gap:
`W_PROTO_STATES_EVENT_UNKNOWN` needs `workflowMessages`, which neither call
site passes, so nothing emits it.

| Code                           | Severity | Artifact                                                             |
|--------------------------------|----------|----------------------------------------------------------------------|
| `E_PROTO_STATES_SUBSET`        | error    | `states.json` — unsupported XState key                               |
| `E_PROTO_STATES_ID`            | error    | `states.json` — bad or missing state id                              |
| `E_PROTO_STATES_TARGET`        | error    | `states.json` — transition to unknown state                          |
| `E_PROTO_STATES_EVENT_NAME`    | error    | `states.json` — malformed event name                                 |
| `W_PROTO_STATES_EVENT_UNKNOWN` | warning  | `states.json` — event maps to no known message                       |
| `W_PROTO_STATES_UNREACHABLE`   | warning  | `states.json` — unreachable state                                    |
| `E_PROTO_WF_SCHEMA`            | error    | `workflows/*.yaml` — shape violation                                 |
| `E_PROTO_WF_NAME`              | error    | `workflows/*.yaml` — bad workflow name                               |
| `E_PROTO_WF_STEP_SHAPE`        | error    | `workflows/*.yaml` — malformed step                                  |
| `E_PROTO_WF_ALIAS`             | error    | `workflows/*.yaml` — `from`/`to` is not a declared participant alias |
| `E_PROTO_WF_EMPTY_BRANCH`      | error    | `workflows/*.yaml` — a branch with no steps                          |
| `E_PROTO_WF_FANOUT`            | error    | `workflows/*.yaml` — illegal fan-out                                 |
| `E_PROTO_WF_DEPTH`             | error    | `workflows/*.yaml` — nesting past the limit                          |
| `W_PROTO_WF_ORPHAN_RETURN`     | warning  | `workflows/*.yaml` — a return with no request                        |

### `lib/protocol/arazzo-grounding.ts` — the one rule an `arazzo.yaml` can break

Run by the same `withArtifactChecks` composition, on the same two surfaces.
Nothing validates an Arazzo Description — the framework states no field table
for one and no published JSON Schema for Arazzo 1.1 was located — so this module
asks the single question `kinds/protocol.md` does state about the file: do its
references land inside artifacts the entity carries.

| Code                        | Severity | Artifact                                                             |
|-----------------------------|----------|----------------------------------------------------------------------|
| `W_PROTO_ARAZZO_UNGROUNDED` | warning  | `arazzo.yaml` — a source or step reference this entity cannot ground |

Both clauses of the rule are this one class:

1. `sourceDescriptions[].url` names a **sibling artifact of this entity**. A
   leading `./` is the convention, not the rule; an absolute URL, a `../`
   escape, and a file that is not there all warn.
2. Every operation, channel or workflow **a step names** resolves — into a
   document `sourceDescriptions` names, or into a workflow of this same file.

Resolution is per grammar, and the checker reads only what it can name:
an `operationId` against an **OpenAPI** source is an `operationId` under
`paths`; against an **AsyncAPI** source it is a key of the `operations` map.
`operationPath` and `channelPath` are JSON pointers, and they must **land on** a
channel or an operation rather than merely walk — a member of the source's
`channels` or `operations` map, or a `paths.<route>.<method>` in an OpenAPI
source. `{$sourceDescriptions.<name>.url}#/channels/<channelId>` is keyed by
channelId and never by a channel's `address`; `#/info/title` and
`#/channels/<channelId>/messages` reach a node and no channel, so neither
grounds. A pointer written without the `{$sourceDescriptions.<name>.url}` prefix
names no source and is searched across all of them. A `workflowId` resolves
inside the same `arazzo.yaml`, because a split Description is not a shape this
kind recognises.

Four silences are deliberate. A source whose document is in a grammar this
module does not read grounds and judges no step reference — a **mini-spec**
`transport.yaml`, whose `channels` is a surface list rather than AsyncAPI's map,
and a sibling that failed to parse, whose complaint is already the loader's;
warning on either would report the Arazzo file for a defect in the other, and
nothing validates a `transport.yaml` yet in any case. A `sourceDescriptions`
entry with no `url` names no document and is not judged. A source that already
failed clause 1 takes one finding, not one per step naming it — as does a
document whose sources ground nothing at all, which is reported once against
`sourceDescriptions` while every later reference is still judged.

And the rule says nothing about `dependsOn`, or about the `stepId`/`workflowId`
of an `onSuccess`/`onFailure` action: those are intra-workflow control flow, and
the portal reports an unresolved one as a note under the step graph rather than
as a finding on the catalog.

### `lib/protocol/transport-checks.ts` — `transport.yaml`, in both dialects

Run by the same `withArtifactChecks` composition, on the same two surfaces. The
role carries two live dialects and this module is the reader for both — the
branch is taken from the dialect the **loader** recorded, never from sniffing the
document, which is what makes a file declaring `$schema` *and* `asyncapi:` the
mini-spec. The two grammars share no rule, because the spec shares none between
them.

| Code                              | Severity | Artifact                                                                                 |
|-----------------------------------|----------|------------------------------------------------------------------------------------------|
| `E_PROTO_TRANSPORT_SCHEMA`        | error    | `transport.yaml` (mini-spec) — unknown non-`x-` key, or a value of the wrong type        |
| `E_PROTO_TRANSPORT_BINDING`       | error    | `transport.yaml` (mini-spec) — block key ≠ `kind`, block missing, required field absent  |
| `E_PROTO_TRANSPORT_SPEC_CONFLICT` | error    | `transport.yaml` (mini-spec) — `spec` and a surface list both present                    |
| `E_PROTO_TRANSPORT_ASYNCAPI`      | error    | `transport.yaml` (AsyncAPI) — one of the six profile rules, or a wire this dialect omits |
| `W_PROTO_TRANSPORT_HOST`          | warning  | `transport.yaml` (AsyncAPI) — a server declares a literal `host`                         |

Four things worth knowing before writing one:

- **A missing binding block is `E_PROTO_TRANSPORT_BINDING`, not `SCHEMA`.** The
  definition row puts "block missing, or a required binding field absent" in the
  BINDING class, so `kind: http` with no `base-path` is BINDING. A required field
  of an *entry* one level deeper — an operation with no `method` — is SCHEMA,
  because "binding field" reads as a field of the block.
- **`kafka.topics` is required unless the document links a `spec`.** It is the
  one surface list the field tables mark conditionally required; the other five
  are optional outright, and a transport declaring neither a `spec` nor a surface
  list is legal.
- **`W_PROTO_TRANSPORT_HOST` fires on a literal host only.** The prose beside the
  rule also discourages a `default` on the host variable, but the definition row
  says "declares a literal `host`", so `{host}` with a default is not warned.
- **An unrecognised `asyncapi:` value falls back to the mini-spec**, because
  `structure.md` says an artifact declaring "one unknown for its role" is "read
  as the legacy dialect" and "still checked against the legacy grammar". That is
  honest and noisy: an AsyncAPI 2.6 document was never valid under the mini-spec
  field table either, so it draws several `E_PROTO_TRANSPORT_SCHEMA` errors on
  top of its `W_ARTIFACT_DIALECT`. Declare `asyncapi: 3.x` or write the mini-spec.

### `lib/protocol/participants-checks.ts` — the participant list, judged

Run by `withKindChecks`, over the resolved catalog. Three modules already
*resolved* a protocol's `participants` before this one existed — `lib/structure`
for the nearest-common-ancestor rule, `lib/actor` for the orphan rule,
`lib/journey/artifacts` for the hop rule — and each treated a participant it
could not use as somebody else's finding. This module is the somebody else.

| Code                           | Severity | Fires on                                                                         |
|--------------------------------|----------|----------------------------------------------------------------------------------|
| `E_PROTO_PARTICIPANTS`         | error    | `participants` absent, or fewer than two entries                                 |
| `E_PROTO_ALIAS_DUP`            | error    | a later entry repeats an earlier entry's `alias`                                 |
| `E_PROTO_PARTICIPANT_KIND`     | error    | a `ref` resolving outside {component, product, actor}, or to a legal artifact    |
| `W_PROTO_PARTICIPANT_UNLINKED` | warning  | a component/product participant whose `index.md` carries no back-edge            |
| `W_PROTO_PARTICIPANT_MISSING`  | warning  | a component/product with an `exposes`/`uses` edge here that is not a participant |

- **`E_PROTO_PARTICIPANTS` reaches its own class only because the kind schema
  gave up `.min(2)`** — the manoeuvre `metric` and `adr` took before it. Entry
  *shape* is still zod's: a `participants` that is not a list, an alias that is
  not kebab-case, a `ref` that is not a string are `E_FM_SCHEMA` as they were.
- **Aliases are compared as authored, never case-folded.** `Checkout` beside
  `checkout` is already `E_FM_SCHEMA`, since the alias pattern is kebab-case.
- **Actors are exempt from both warnings**, per `kinds/protocol.md`: an actor is
  a persona or an external system, not a catalogued implementation, and requiring
  a back-edge from one is bookkeeping with no reader.
- **Both joins are by identity, not containment.** The rules are stated over "a
  component or product that `exposes`/`uses` this protocol", with no clause
  letting a parent stand in for a child — so a product that `exposes` a protocol
  whose participants are its own components draws
  `W_PROTO_PARTICIPANT_MISSING`. Five findings on the shipped catalog are that
  shape. JRN15 spells containment out where it means it; this rule does not.

### `lib/protocol/payload-checks.ts` — payload refs and workflow channels

Run by `withKindChecks`. Both rules are joins the artifact parsers cannot make:
one needs the entity graph, the other needs two artifacts of one entity at once.

| Code                         | Severity | Fires on                                                                          |
|------------------------------|----------|-----------------------------------------------------------------------------------|
| `E_PROTO_PAYLOAD_KIND`       | error    | a `payload`/`request`/`response`/`message`/`x-srn-payload` naming a non-datamodel |
| `W_PROTO_WF_CHANNEL_UNKNOWN` | warning  | a workflow step `channel` the transport's surface does not offer                  |

- **Payload surfaces are read structurally, not by key scan.** The loose scan
  `lib/datamodel/datamodel.ts` uses is right for a *join* and wrong for a
  diagnostic: `message:` is an arrow label in a workflow step and an SRN in a
  transport surface entry, and a diagnostic may not guess which.
- **A legal artifact role on a payload is `E_PROTO_PAYLOAD_KIND`; an illegal one
  is silence**, because V5/`E_SRN_ARTIFACT` is static and precedes every surface
  class.
- **W9 is skipped when there is nothing to check against** — no `transport.yaml`,
  a mini-spec one linking a `spec`, or one declaring no surface list at all. The
  kind document enumerates the first two; the third is the same condition and is
  implemented from the governing clause, because warning about the absence of an
  optional declaration would report a legal document as the catalog's error.
- **A document declaring a `spec` *and* a surface list** is
  `E_PROTO_TRANSPORT_SPEC_CONFLICT`, and its channels are matched against the
  list it did declare.

### `lib/protocol/spec-file-checks.ts` — the protocol entity directory and `style`

Run by `withKindChecks`, with the protocol directory listings
`lib/catalog/listings.ts` now takes alongside the journey ones — recursive, and
by path, because a linked spec file may sit in a subdirectory and a
`pricing.proto` never becomes an artifact at all.

| Code                       | Severity | Fires on                                                                     |
|----------------------------|----------|------------------------------------------------------------------------------|
| `E_PROTO_SPEC_FILE`        | error    | `spec.file` absolute, containing `..`, or naming nothing in the directory    |
| `W_PROTO_SPEC_ASYNCAPI`    | warning  | a mini-spec transport on an AsyncAPI-capable wire linking `format: asyncapi` |
| `W_PROTO_ARTIFACT_UNKNOWN` | warning  | an unrecognised file or subdirectory in the protocol entity directory        |
| `W_PROTO_STYLE_MISMATCH`   | warning  | step kinds contradicting the declared `style`                                |

- **The recognised set is closed and short**: `index.md`, the four fixed bare
  names (`transport.yaml`, `openapi.yaml`, `arazzo.yaml`, `states.json`), any
  `*.md` prose sibling, `workflows/` holding one `*.yaml` per workflow, and
  whatever `transport.yaml` links under `spec.file`. `order-placement.transport.yaml`
  and `arazzo.json` are each a file the portal will never read.
- **`..` is a literal substring test**, which is what the field table, this
  bundle and `transport-document/schema.json` all say ("MUST NOT contain `..`").
- **The directory rule goes silent when `transport.yaml` did not parse.** With
  the link unreadable, a legitimately linked `pricing.proto` is indistinguishable
  from litter.
- **`style` has exactly two cross-checks**, because the kind document states two:
  `bus` with any `kind: call` step, and `request-response` where no workflow
  anywhere answers a call. `point-to-point` has none. The `bus` check is literal
  — a step whose `from` and `to` name the same participant is still a `call`, and
  the two findings on the shipped catalog are that shape.

### `lib/journey/journey.ts` — the `journey.yaml` parser

Run by the check via the same artifact composition as the protocol validators:
a broken `journey.yaml` fails `metaframework check` and shows on
`/diagnostics`. The loader still reads the file as a generic artifact first, so
a YAML *syntax* error carries the loader's own complaint and the mini-spec
parser is skipped for that file. A journey entity with **no** `journey.yaml` at
all used to be the gap here; it is now `E_JRN_ARTIFACT_MISSING`, raised from the
directory listing by `lib/journey/artifacts.ts` below.

The module deliberately owns the rules checkable from the file alone, plus the
three that need only the SRN *grammar* — `W_JRN_ACTOR_ABSENT` compares two
resolved SRNs, `W_JRN_UNDOCUMENTED_INTEGRATION` needs each `touches` target's
owning product, which is the `product/{name}` pair at the head of its pair chain,
and the three kind fences below fire on the clause a pure parser can decide.
What needs the resolved catalog is left out: `lib/journey/artifacts.ts` picks up
three of those rules, and the kind clauses that remain are in section 2.

| Code                             | Severity | Raised when                                                                                                                                                                                                    |
|----------------------------------|----------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `E_JRN_SCHEMA`                   | error    | Shape or type violation; an unknown top-level or step key without an `x-` prefix.                                                                                                                              |
| `E_JRN_NAME`                     | error    | `name` ≠ the entity's directory name.                                                                                                                                                                          |
| `E_JRN_STEP_COUNT`               | error    | Fewer than 2 or more than 12 steps. Both bounds are errors, deliberately.                                                                                                                                      |
| `E_JRN_BRANCH`                   | error    | A step key of `alt`, `opt`, `loop`, `when`, `otherwise`, `branches`, `parallel`.                                                                                                                               |
| `E_JRN_TOUCHES_KIND`             | error    | A step's `touches` addresses an **artifact** of an entity — a legal role on a legal kind, where a step names entities. The other half of the rule, "resolves to a component or a product", is not implemented. |
| `E_JRN_PROTOCOL_KIND`            | error    | The same clause on a step's `protocol`. Same missing half.                                                                                                                                                     |
| `E_JRN_ACTOR_KIND`               | error    | The same clause on a step's `actor`. The *frontmatter* protagonist is checked in full, by the loader, and that is a different check in a different module.                                                     |
| `W_JRN_ACTOR_ABSENT`             | warning  | The frontmatter protagonist is the `actor` of no step.                                                                                                                                                         |
| `W_JRN_UNDOCUMENTED_INTEGRATION` | warning  | Consecutive steps whose owning products differ, and the later names no `protocol`.                                                                                                                             |

A step reference that fails to parse is re-raised as the SRN parser's own code
(`E_SRN_SYNTAX`, `E_SRN_PLACEMENT`, …), exactly as elsewhere — and a suffix
outside the addressed kind's role table is `E_SRN_ARTIFACT`, which precedes the
three surface classes above: an actor owns no roles at all, so
`/actor/customer.profile` never reaches `E_JRN_ACTOR_KIND`.

### The kind disciplines — `withKindChecks` and `withDatamodelChecks`

Six modules that landed together, and they are grouped by **input** rather than
by kind: every code below is answerable from the resolved catalog plus, for four
of them, a directory listing the loader takes and throws away. None needs an
artifact parser, a schema document, or git — and none could have lived in the
loader's per-entity pass, because each asks about a *second* entity, a sibling,
or a file the loader chose not to read. That is why all twenty-four spent a
release in the debt register rather than in `load.ts`.

They join the pipeline in `src/lib/catalog/index.ts`. `withKindChecks` folds the
first five over the catalog and the two listings from
`src/lib/catalog/listings.ts`; `withDatamodelChecks` folds the sixth *after*
`withSchemaRegistry`, because validating an example is a call into the registry's
own compiled ajv. Everything here reaches `metaframework check` and
`/diagnostics` on every run.

Three of the codes are rules about **what the loader chose not to read**, which
is the whole reason the listings exist. A symlinked directory reports
`isDirectory() === false` under `withFileTypes`, so the walk never descends and
the subtree behind the link is invisible to every other rule in the portal
(`E_COMP_SYMLINK`). A solution directory with no `index.md` yields one
`E_STRUCT_MISSING_INDEX` per orphaned descendant — naming the children rather
than the directory actually missing a document — and nothing at all when it is
empty (`E_SOL_NO_ROOT`). And the loader reads four extensions and drops the rest,
so a `steps.txt` is absent from `entity.artifacts` by construction
(`W_JRN_ARTIFACT_UNKNOWN`).

#### `lib/adr/adr.ts` — the ADR kind

| Code                 | Severity | Raised when                                                                                                                                                                                                                                                                                                                                                                                                |
|----------------------|----------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `E_ADR_DATE`         | error    | `date` is not a calendar date: absent, not a bare `YYYY-MM-DD`, a month past 12, or a day the month has not (proleptic Gregorian, leap years included). Both spellings the kind document admits arrive here — YAML makes an unquoted `2026-03-11` a `Date` and a quoted one a string — and a `Date` is admitted only at exactly midnight UTC, so `2026-03-11T09:00:00Z` is the one timestamp form refused. |
| `E_ADR_DECIDERS`     | error    | `decision-status` is `accepted` or `rejected` and `deciders` is absent or empty. `superseded` is deliberately **not** in the trigger set — that ADR was accepted once, and demanding the list retroactively is a rule the kind document does not state. A `deciders` of the wrong *shape* is still `E_FM_SCHEMA`: this class means "nobody is recorded", not "that field is mistyped".                     |
| `E_ADR_SECTIONS`     | error    | The body is missing one of `## Context`, `## Decision`, `## Consequences`, `## Alternatives considered`. **One finding per missing section**, and the message names the near miss when there is one — the same text at level 3, or `## Alternatives Considered`. Order is not enforced (the portal renders the four in canonical order whatever the file does) and a repeated section is not a finding.    |
| `W_ADR_ORDINAL`      | warning  | Two ADRs in one bucket claiming one ordinal. Compared as **numbers**, so `0002` and `002` collide; a name with no `NNNN-` prefix is skipped rather than flagged. The bucket is the owning container, so `acme/adr/0001` and `acme/product/shop/adr/0001` are two different ADR-0001s. The finding lands on the later name and cites the earlier.                                                           |
| `W_ADR_SUPERSESSION` | warning  | The supersession bookkeeping disagrees with itself, in **either** direction: `decision-status: superseded` with no inbound `supersedes` edge, or an inbound edge on an ADR whose own status is anything else.                                                                                                                                                                                              |

#### `lib/assumption/diagnostics.ts` — the assumption kind

Composed beside `adrDiagnostics` in `src/lib/catalog/index.ts` and pure in the
same way: the entity graph is the only input. The reverse index — which entities
rest on which belief — is built **once per catalog** rather than per assumption,
because rescanning every entity for each belief is quadratic in exactly the
catalogs where the query matters.

Three rules the module deliberately does not own: `standing`'s closed enum is
`KIND_FRONTMATTER`'s (`E_FM_SCHEMA`), and the edge's legal source and target are
the edge table's (`E_FM_EDGE_SOURCE`, `E_FM_EDGE_TARGET`). A rule enforced twice
is a rule that can disagree with itself.

| Code                     | Severity | Raised when                                                                                                                                                                                                                                                                                     |
|--------------------------|----------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `E_ASM_REVIEW_DATE`      | error    | `review-by` is absent or not a bare `YYYY-MM-DD` calendar date. The digits must survive the parse, so `2026-13-01` is refused rather than rolled into the next year — the same trap `E_ADR_DATE` avoids. Required at every `standing`, `retired` included; the rule has no exception to guess.  |
| `E_ASM_SECTIONS`         | error    | The body is missing `## Basis` or `## If this is false`. **One finding per missing section**, and the message names the near miss when the same text appears at another level. Order is not enforced.                                                                                           |
| `W_ASM_BROKEN_DEPENDENT` | warning  | An entity authors `assumes` at a belief whose `standing` is `broken`. Raised against the **dependent**, not the assumption: that is the entity which has to act. A warning, not an error — whether the world has contradicted a belief is a judgement, and a judgement should not fail a build. |
| `W_ASM_STALE`            | warning  | `review-by` has passed while `standing` is `unverified` or `holding`. A `broken` or `retired` belief is never stale: it has already been resolved.                                                                                                                                              |
| `W_ASM_ORPHAN`           | warning  | Nothing assumes the belief. A warning because the two causes are opposite — dead weight, or an edge nobody wired — and only a reader can say which.                                                                                                                                             |


**Two of these are new classes rather than new checks, and knowing which matters
when reading an older report.** A rule the kind schema already enforced was
reported as `E_FM_SCHEMA` — the generic code — rather than under the class the
kind document names for it, so the named class could never appear at all. That is
the manoeuvre `metric` established, and it takes two steps: relax the schema,
then raise the class from the kind check. `KIND_FRONTMATTER.adr` used to pin
`date` to a regex and refine `deciders`; it now declares `date: z.unknown()` and
`lib/adr/adr.ts` owns the date entirely, so a malformed date is reported **once**
and an unquoted YAML date no longer fails at all (section 4). `deciders` keeps its
array shape in the schema, which is the deliberate half-step: a *mistyped* one is
still `E_FM_SCHEMA`, and only an absent or empty one is `E_ADR_DECIDERS`.
`E_PROTO_PARTICIPANTS` is the one class still stuck at step zero — see section 2.

The fix for the supersession warning is the second step of the swap, and the
message is written to tell the two cases apart. The successor authors `supersedes` and is
accepted; *then* the predecessor moves to `superseded` and bumps its `version`.
Between those two commits the predecessor is legitimately a target that does not
say so, which is why the message names the successor's own standing — a reader
seeing `superseded by … (proposed)` can tell a decision in flight from a bump
nobody made. Successors are read off the resolved inverse index, so a
`supersedes` that dangles or crosses kinds was already refused as
`E_SRN_DANGLING` or `E_FM_EDGE_TARGET` and cannot quietly satisfy the rule.

#### `lib/requirement/requirement.ts` — the requirement kind

| Code                     | Severity | Raised when                                                                                                                                                                                                                                                                                                            |
|--------------------------|----------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `E_REQ_CRITERIA`         | error    | The `## Acceptance criteria` section is missing, appears more than once, is empty, does not **open** with a top-level unordered list, uses task-list syntax (`- [ ]`), or carries an item whose first line is over 200 characters. One class, several messages, because the kind document gives the section one class. |
| `W_REQ_UNIMPLEMENTED`    | warning  | `priority: must` with no inbound `implements` edge. No exemption for `status: deprecated`: a superseded requirement whose implementers have all migrated is left holding `must` and no edges, and either the priority is stale or the migration is unfinished.                                                         |
| `W_REQ_WONT_IMPLEMENTED` | warning  | `priority: wont` — a recorded non-goal — with at least one inbound `implements`. The message names every claimant.                                                                                                                                                                                                     |

Two readings of the criteria rules are worth knowing before arguing with a
finding. The parse **stops at the first structural failure** — no heading, two
headings, or a section that does not open with a list — because everything after
it is a guess at what the author meant; once the shape holds, every per-item
violation is reported together. And the 200-character cap is on the item's first
**physical line**, not its first paragraph: this repository wraps its prose, a
two-line criterion is idiomatic, and the paragraph reading would fail a tenth of
legal content. The violation the cap exists for — a whole argument as one bullet
— can only be written on one line, which is exactly what it catches.

The two joins read `catalog.inbound`, which holds only edges whose target
resolved *and* whose source kind may author them, so a dangling or illegal
`implements` cannot quietly satisfy `W_REQ_UNIMPLEMENTED`.

#### `lib/actor/actor.ts` — participation, from both ends

| Code                         | Severity | Raised when                                                                                                                |
|------------------------------|----------|----------------------------------------------------------------------------------------------------------------------------|
| `W_ACTOR_ORPHAN`             | warning  | No protocol names this actor among its `participants`, and no journey step gives it a move.                                |
| `W_ACTOR_PARTICIPATION_EDGE` | warning  | The actor authors a `uses` edge toward a protocol. Legal at the loader’s edge table, which is why nothing else catches it. |

The two are one rule read from its two ends: participation is authored **once**,
in the protocol's own `participants` list. The second catches an author saying it
from the actor side as well — a second list to keep in step — and the fix is to
delete the edge, not to add the participant. The first catches nobody saying it
at all, and it is a warning because a newly described actor legitimately precedes
its protocols.

Journey steps count as participation deliberately, and that widening is what
makes the rule usable: `journey.yaml` names actors by SRN, and an actor who is
the protagonist of two journeys is not "an actor nobody talks to". Workflow steps
are *not* scanned, and need not be — a step addresses a participant by alias, and
an undeclared alias is already `E_PROTO_WF_ALIAS`, so every actor a workflow can
reach is a participant already. What is deliberately not participation: an
actor's own outbound `uses`, and a product's `primary-actors`. Both describe
reach rather than a modelled conversation, and counting the first would make the
rule unfireable on any actor that names a component.

#### `lib/structure/structure.ts` — containment and placement

| Code                         | Severity | Raised when                                                                                                                                                                                                                                                                                                      |
|------------------------------|----------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `E_SOL_NO_ROOT`              | error    | A directory directly under the catalog root with no `index.md`. Carries no `srn`, deliberately — there is no entity to link to, and that is the finding: a solution is the sealed universe every SRN beneath it is named against, so an unnamed one makes every path under it unaddressable.                     |
| `E_COMP_SYMLINK`             | error    | A symlink sitting in a `component/` bucket. Position decides what a directory is, so the bucket is the whole test. Reuse is authored on the reusing side as a `depends-on` edge, never by linking the directory.                                                                                                 |
| `E_COMP_LIBRARY_ENVIRONMENT` | error    | A `component-type: library` with a `uses` edge resolving to an `environment`. An error rather than a warning: a library runs inside its consumers, so the edge is not early or stale but a category mistake, and the reading it invites ("this library is deployed to production") is one the kind cannot have.  |
| `E_COMP_EXTERNAL_CHILD`      | error    | A `component-type: external` owning a child **component**. Child datamodels and protocols are fine — that is how the seam gets documented at all; a decomposition of somebody else’s system is not.                                                                                                              |
| `E_PROD_ACTOR_TARGET`        | error    | A `primary-actors` entry resolving to an entity that is not an `actor`, or addressing an **artifact** of one. The field is a kind field and never a relation — no edge type may target an actor — so `collectRelations` never saw it and until this module a product could name anything at all.                 |
| `W_COMP_NO_ENVIRONMENT`      | warning  | A `service`, `ui`, `job`, `datastore` or `gateway` declaring no environment. Exempt at `lifecycle: planned` and `retired`, where naming one would be the lie; `in-development` and `sunset` are **not** exempt — built-but-unreleased is exactly when the edge starts carrying information.                      |
| `W_COMP_DEP_CYCLE`           | warning  | A cycle in `depends-on` among **components**. A component→product→component loop is a different statement and is not one. One finding per cycle rather than per member, filed on the lexicographically first so the choice is stable across runs, with the shortest cycle through it spelled out in the message. |
| `W_STRUCT_PROTOCOL_NCA`      | warning  | A protocol not filed at the nearest common ancestor of its `component` and `product` participants. Computed over whole `{kind}/{name}` **pairs**, never raw segments — `product/shop` and `product/shopfront` share no place, only a bucket name.                                                                |

The eight live in one module because the grouping that matters is the input, not
the kind — this is also why there is no `lib/component/`. Six read the resolved
catalog; `E_SOL_NO_ROOT` and `E_COMP_SYMLINK` read the directory listing and
cannot be answered from the catalog at all.

Three behaviours to know before reading a report:

- **`primary-actors` re-raises the parser's own codes** rather than swallowing
  them, exactly as `relations` and the environment artifacts do: a well-formed
  reference to nothing is `E_SRN_DANGLING`, one the grammar refuses is
  `E_SRN_SYNTAX`, and a suffix outside the addressed kind's role table is
  `E_SRN_ARTIFACT` — which is every suffix on an actor SRN, since actors own no
  roles. A suffix that *survives* the role table, `….transport` on a protocol, is
  `E_PROD_ACTOR_TARGET` with the suffix named as the problem.
- **Actors are excluded from the NCA**, because they are solution-level and one
  of them would collapse every placement to the root. A protocol whose only
  participants are actors is therefore unconstrained and yields nothing.
- **A protocol with any unresolvable participant is skipped whole**, not checked
  against what is left. Dropping the broken reference shrinks the participant
  set, and a smaller set has a *deeper* NCA — so the reward for one dangling ref
  would be a second, invented finding about placement that is correct as
  authored.

Both directions of the NCA rule are violations and the message says which:
**below** is the harmful one — some participant sits outside the protocol's
owning subtree, so the contract is invisible from the side of the tree that
speaks it — while **above** is over-general rather than unreachable, and costs
the reader the one thing placement is for.

#### `lib/journey/artifacts.ts` — the journey directory, not the document

| Code                       | Severity | Raised when                                                                                                                                                                                                                         |
|----------------------------|----------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `E_JRN_ARTIFACT_MISSING`   | error    | A `journey` entity directory holding no `journey.yaml`. Pathed at the **directory**: the finding is an absence and there is no line for it to sit on.                                                                               |
| `W_JRN_ARTIFACT_UNKNOWN`   | warning  | Anything beside `index.md`, `journey.yaml` and `*.md` prose siblings — subdirectories of any name included, since the kind admits none. Dot- and underscore-prefixed entries are skipped.                                           |
| `W_JRN_PROTOCOL_UNRELATED` | warning  | A step’s named `protocol` whose `participants` list holds neither end of the hop — this step’s `touches` or the previous step’s — where a participant matches if it **is** that entity, **contains** it, or **is contained by** it. |

This is the module that closed the oldest hole in the journey kind, and each of
its three rules had named a missing *input* rather than a missing branch:
`parseJourney` is handed a parsed document, so it can neither notice the document
is absent, nor that something else sits beside it, nor look up a protocol's
participants. Given the entity directory listing and the resolved catalog, all
three are decidable.

- **`E_JRN_ARTIFACT_MISSING` changes what a green check proves.** A journey's
  frontmatter says nothing about the path, so an entity without its artifact
  asserts nothing at all; a path under design carries a short `journey.yaml` and
  `status: draft`. A journey **absent from the listing map** — a directory that
  could not be read — is skipped rather than assumed empty, so an unreadable
  directory never reports the strictest code here about a file that is probably
  there.
- **`W_JRN_ARTIFACT_UNKNOWN` is a rule about the files that never became
  artifacts**, which is why it needs the listing: `journey.yml` or
  `place-an-order.yaml` is a path the portal will never read, silently, while the
  author believes it is authored.
- **`W_JRN_PROTOCOL_UNRELATED` is not restricted to product crossings** — that is
  `W_JRN_UNDOCUMENTED_INTEGRATION`'s rule — and it fires only once the protocol
  resolves to a protocol that exists, so a dangling or wrong-kind reference stays
  `E_SRN_DANGLING`'s or `E_JRN_PROTOCOL_KIND`'s. Containment is decided on the SRN
  path at pair boundaries rather than by a catalog lookup, so an end whose entity
  failed to load still gets the right answer. Step 1 has no predecessor and is
  judged on its own end alone.

The document is re-parsed here for the last rule and **every issue that parse
produces is discarded** — `artifact-checks.ts` already runs the same parser and
owns those findings — so nothing in this module can put a `journey.yaml`
complaint on `/diagnostics` twice.

#### `lib/datamodel/datamodel.ts` — a model read from outside

| Code                   | Severity | Raised when                                                                                                                                                                                                                                                    |
|------------------------|----------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `E_DM_EXAMPLE_INVALID` | error    | A file under `examples/` that does not parse as JSON, or does not validate against the entity’s own `schema.json`. One finding per **file**, not per ajv error — a drifted instance usually fails in several places and the reader’s unit of work is the file. |
| `W_DM_ABSTRACT_USE`    | warning  | An `abstract: true` datamodel carrying `examples/`, named as a protocol message payload, or the target of an `exposes` edge. All three are the same mistake: something outside the schema layer treating a base as a thing there can be an instance of.        |
| `W_DM_USAGE_MISMATCH`  | warning  | A `usage: storage` or `usage: config` datamodel named as a protocol message payload. One finding per datamodel, listing every protocol that names it, because the fix is a single field.                                                                       |

`lib/schema/registry.ts` reads every `schema.json` from the inside — dialect,
identity, keywords, `$ref` graph. These three ask what the rest of the catalog
*does* with the model, and each is a join.

- **A schema the registry could not compile yields nothing here.** It has already
  said why, in `E_DM_*` codes pathed at the schema, and "your example is invalid"
  would be a misleading second complaint about a file that is fine.
- **Payload references are found by key scan, not by parsing the transport
  document** — `payload:` in a workflow step, and `request` / `response` /
  `message` / `x-srn-payload` in a transport surface list. A key scan is
  dialect-agnostic by construction, which is what let these two warnings land
  ahead of the transport reader — `lib/protocol/transport-checks.ts`, which has
  since been written. The split is load-bearing: in a workflow step
  `message:` is the arrow *label* and the SRN lives in `payload:`, while in a
  transport surface list `message:` **is** the SRN.
- **A candidate counts only when it resolves to a datamodel that exists**, which
  is what makes the key scan safe: a label that resolves to nothing is not a
  payload, and a genuinely broken payload reference is already
  `E_SRN_DANGLING`'s.
- **A `relations.uses` edge toward an abstract model is deliberately not
  flagged.** `allOf` inheritance is the intended use, and a `uses` edge is the
  frontmatter spelling of the same thing — it is how a pinned review target is
  carried, which a URL `$ref` cannot do. Flagging it would make correct authoring
  red.

`W_DM_USAGE_MISMATCH` is a warning because the protocol may legitimately be ahead
of the datamodel's review, and the message differs by value for a reason: on
`usage: config` it is rarely the protocol's fault, and reads as either the wrong
model named or a process sending its own settings to somebody.

### `lib/datamodel/additive.ts` — the instance-superset rule

| Code                | Severity | Raised when                                                                                                                                                                                                                                       |
|---------------------|----------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `E_DM_NOT_ADDITIVE` | error    | The `schema.json` on disk rejects an instance the same entity's version N−1 accepted, or drops a property it declared. One finding per site, each carrying the JSON pointer of the position and the version span it was decided over.             |

The only check in the portal that reads a **commit**. Folded in by
`withEvolutionChecks`, the pipeline's one `async` step: it resolves version N−1
through the version→commit index, reads that commit's `schema.json`, and diffs it
against the working tree. Version 1 makes no git call at all — it has no
predecessor by construction — so the walk costs one lookup per datamodel that has
actually moved.

The rule is `evolution.md`'s: *version `N+1` MUST accept every instance that
version `N` accepted.* The naive reading of "additive" is wrong in both
directions and the superset formulation is why — **adding** a name to `required`
is forbidden, **removing** one is legal. One row is not about instances at all:
a removed property is a finding even in an open schema, because the principle
binds the contract surface, "everything a referrer can depend on".

What fires, which is `kinds/datamodel.md`'s mechanical table and nothing beyond
it: a property present at N and absent now; a name added to `required`; an enum
member removed; a narrowed `type`; a tightened numeric, length or item bound; a
`pattern` added; `additionalProperties` set to `false`; a `$ref` retargeted.
An **absent** keyword is read as the default it denotes, so a schema that gains
its first `maxLength`, `type` or `enum` has narrowed the set that keyword names —
which is a tightening in the row's own terms.

Six deliberate silences, each a position rather than an omission:

- **A `pattern` that changed.** Only "added" is decidable; regular-expression
  containment is not, and firing on every edit would report a loosening as a
  break.
- **A schema array whose length moved.** `allOf`, `anyOf`, `oneOf` and
  `prefixItems` are compared element-wise, and inserting a branch shifts every
  later position. At unequal lengths nothing inside is compared.
- **`not` and `if`.** Polarity: every rule would have the wrong sign there.
  `then` and `else` are walked.
- **A `$ref` whose target the framework cannot name.** The row says "retargeted
  to **another entity**", so the comparison is on the entity, resolved by the
  same URL→SRN mapper the registry records edges with. A ref written in a
  superseded identity grammar — a relative path, a serving address — names no
  entity, and a byte comparison would report every such migration as a retarget.
- **A predecessor git cannot reach**, and a predecessor that will not parse. An
  accusation the accuser cannot support is worse than no accusation, and
  `catalog-renders-without-git` makes history an enrichment rather than a
  precondition: with no git, this check adds nothing and the rest of the list is
  unchanged.
- **A break relative to N when the author forgot the bump.** The comparison is
  against N−1, so a tightening that only tightens against N is invisible. That is
  `E_VER_UNBUMPED`'s question, and it is unanswerable here for that check's own
  reason — editing a file before committing it is authoring, not a violation.

The check is conservative by instruction: `kinds/datamodel.md` says it "flags
only changes that are unambiguously tightening", since full schema subsumption is
undecidable and a semantic break — same name, same type, new meaning — is
invisible to any checker. A clean build is evidence, not proof.

### `lib/catalog/measurements.ts` — measured facts in prose

The one check that reads **sentences**. Folded in by `withProseChecks`, before
the kind disciplines and needing none of their inputs: no second entity, no
listing, no registry, no git. It applies to every kind there is.

The rule is ADR 0018's: *a measured fact in a current-state entity is derived and
rendered by the portal, or it is not written as a number at all; only the `adr/`
bucket authors a measured number, and there it MUST carry the date it was
measured.* A **measured fact** is a number obtained by running a command — the
test is that you can write the command down.

| Code                    | Severity   | Raised when                                                                                                                                                                                                                                                                                                                           |
|-------------------------|------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `W_PROSE_MEASUREMENT`   | warning    | Any kind except `adr` states a measured quantity as a digit. The fix is editorial: keep the claim and drop the digit ("the largest module in `src/lib`"), or let the portal derive it where the count is over the catalog graph.                                                                                                      |
| `W_ADR_MEASUREMENT`     | warning    | An `adr` states one in a section that names neither an ISO date nor a backticked commit-ish. The anchor scopes the **section** — a heading of any level and everything under it — so a census states its commit once and its rows carry bare digits. The frontmatter `date` does not anchor: it moves when `decision-status` does.    |

**What it deliberately does not chase**, because a check on English earns its
place by its silences:

- Two shapes fire and no others. A count of `lines`, `commits`, `insertions` or
  `deletions` anywhere at all — nobody sets a target in lines or budgets a design
  in commits — and a count of `files`, `modules`, `documents`, `directories`,
  `entities`, `entries`, `instances`, `tests` or bytes **within one clause of a
  backticked path**, where the path is the evidence a command was run over
  something.
- A bare digit beside a countable noun ("three components", "eleven kinds") is
  overwhelmingly a *design statement* in a catalog and is never flagged.
- A semantic version is not a count: "an AsyncAPI 3.1.0 document" ends in
  `0 document` and means nothing of the kind, so a digit preceded by a dot is
  skipped.
- A **cap** is a decision that happens to be denominated in a measured unit:
  "reads at most 200 commits" is skipped, and so are `up to`, `no more than`,
  `the last` and `the first`.
- A spelled number after *the* is **anaphora**, not a census: "the window between
  the two commits" points back at two commits already named. Digits after *the*
  still fire — "of the 3,440 lines under `src/`" is exactly as stale as the
  measurement it points at.
- The **hyphenated adjectival form** — "a 200-line schema with four `$ref`s", "a
  two-line `note`" — is left to the author. It is where a document's
  hypotheticals live, and stripping a number out of an illustration makes the
  prose worse for no drift avoided.
- Fenced blocks are blanked, not removed, so a finding's line number still
  locates the sentence.
- `one` is not a number word here: "one entry per host" and "on one line" are
  ordinary English about structure.

Both are warnings, for `W_ARTIFACT_DIALECT`'s reason — an existing catalog must
be able to adopt the framework without its build turning red, and a stale digit
is a document that is wrong, not one that is broken.

### `lib/history/git.ts` — version history

Needs unshallow git history at the portal's location; degrades gracefully.

| Code               | Severity | Raised when                                                                                                                                                                                                                                                                                                                           |
|--------------------|----------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `E_VER_REGRESSION` | error    | Across the commits of an entity's `index.md`, `version` decreased or jumped by more than 1. Skipped when the log was truncated.                                                                                                                                                                                                       |
| `E_VER_UNBUMPED`   | error    | Between two consecutive commits, the entity's **own** files changed while `version` stayed the same. Commits only — never the working tree, so in-progress edits are not violations — and a `status:`-only edit is exempt. Children are judged by their own versions, never blamed on the parent. Skipped when the log was truncated. |
| `E_SRN_VERSION`    | error    | A pinned `@N` resolves to no commit. With a shallow clone the message carries a "shallow history" hint — the fix is `git fetch --unshallow`, not a catalog edit.                                                                                                                                                                      |

The two `E_VER_*` codes surface on the entity page, where the version check
streams in beside the version picker. The gate form is
`metaframework check --since <ref>`: it fails an entity whose files changed
since `<ref>` without a bump, and judges only the net change — a branch that
breaks and repairs the rule passes, deliberately.

## 2. Specified but not implemented

Nothing emits these — and as of this release, "these" is the empty set of
*codes*. What remains are the rules marked **Half**: a rule with two clauses
whose second needs the resolved catalog fires on the first and stays silent about
the rest, which is more dangerous than plain silence if a green check is read as
coverage. Those halves are real rules of the specification, and a catalog can
violate them with a green check. Verify by reading.

**No classes at all, and it used to be forty-one.** Every group below is empty,
and each says where its classes went; the two-and-a-half journey rules are the
half-implemented remainder and carry no register line, because a register keyed
by code cannot express half a rule. Every code with a definition row in
`framework/spec` now has an emitter — for the first time since this section was
written. The authority is `UNIMPLEMENTED` in
`framework/portal/src/lib/catalog/diagnostic-coverage.test.ts`, which is
correspondingly empty — re-read it rather than this prose if the two disagree.

**Entity body and frontmatter**

Nothing. The six classes that lived here — the ADR body and frontmatter rules,
the requirement's acceptance-criteria section, the product's primary actors and
the solution root — are `lib/adr/adr.ts`, `lib/requirement/requirement.ts` and
`lib/structure/structure.ts`, and are listed under those headings in section 1.

Two of the ADR classes changed **class** as well as coverage, by the manoeuvre
`metric` established and `E_PROTO_PARTICIPANTS` has since taken; the
`lib/adr/adr.ts` entry in section 1 says how.

**Structure and components**

Nothing. The protocol-placement rule and the five component containment rules are
all `lib/structure/structure.ts` — one module rather than five, because the
grouping that mattered was the *input* (the resolved catalog plus one directory
listing) and not the kind. There is no `lib/component/`.

**Protocols**

Nothing, and this was the group that held the whole of the section. Sixteen
classes left it at once, in four modules, all listed in section 1:

- `lib/protocol/transport-checks.ts` — the five `transport.yaml` classes, in both
  dialects.
- `lib/protocol/participants-checks.ts` — the five participant classes.
- `lib/protocol/spec-file-checks.ts` — `E_PROTO_SPEC_FILE`,
  `W_PROTO_SPEC_ASYNCAPI`, `W_PROTO_ARTIFACT_UNKNOWN`, `W_PROTO_STYLE_MISMATCH`.
- `lib/protocol/payload-checks.ts` — `E_PROTO_PAYLOAD_KIND` and
  `W_PROTO_WF_CHANNEL_UNKNOWN`.

**Three of those rows were wrong about themselves, and in the same direction the
`arazzo` grounding row was.** `W_PROTO_SPEC_ASYNCAPI` and
`W_PROTO_WF_CHANNEL_UNKNOWN` both read "needs `transport.yaml` validated first,
which nothing does". Neither needed it validated: one needs `spec.format` and
`kind` read off a mapping, the other needs the surface list's names collected,
and both documents were already parsed onto `artifact.data`. The third is
`E_PROTO_PARTICIPANTS`, which needed a schema relaxed rather than a reader
written.

So the lesson this section kept re-learning is now a rule for writing an entry:
**a gap phrased as a dependency on another unbuilt thing is the phrasing to
distrust.** It is a claim about cost rather than about capability, it cannot be
falsified while both halves are missing, and it is how two independent rules get
filed as one blocked project. "Parsed and never validated" was a real obstacle
for a rule that must judge a document's *shape*; it was never an obstacle for a
rule that only has to look a name up in one. That distinction — the one this
section drew a release ago about `arazzo.yaml` — applied to three of its own rows
and went unnoticed for a release.

What is **not** enforced about protocols is real, and cannot be a row here
because this register is keyed by code and each of these is half a rule whose
other half fires:

- W8 is `E_SRN_DANGLING` **or** `E_PROTO_PAYLOAD_KIND`, and only the second half
  has an emitter. A payload reference resolving to a legal-but-absent SRN is
  reported by nothing, on the workflow, mini-spec and AsyncAPI surfaces alike.
- On the two *transport* payload surfaces, `E_SRN_SYNTAX`,
  `E_SRN_CROSS_SOLUTION` and `E_SRN_ARTIFACT` have no owner either. The workflow
  parser files them for a workflow `payload` only.

Both live as `it.todo`s beside the clause that does fire, which is the same
treatment the two-and-a-half journey rules below get and for the same reason.

**Environments**

Nothing. Every `E_ENV_*` and `W_ENV_*` class `kinds/environment.md` defines —
ENV4–ENV15, the config-contract join included — is emitted by
`lib/environment/environment.ts` and listed in section 1. What is still
unenforced there is not an environment rule: ENV12–ENV15 have nothing to join
against for a component that publishes no `usage: config` contract, and no rule
anywhere requires one.

**Data models**

Nothing. `E_DM_NOT_ADDITIVE` was the last row here and it is now
`lib/datamodel/additive.ts`, listed in section 1. How it left is worth a
paragraph, because the entry that stood here was not "unwritten" — it was
"unanswerable", and that was the stronger claim and the wrong one. It read: the
only rule in the spec that cannot be answered from any input the load pipeline
has. What was true is that the pipeline took no input that could answer it.
Nothing stopped it taking another: `withEvolutionChecks` is an `async` fold, and
`resolveVersion` plus `readFileAtRevision` were already sitting in
`lib/history/git.ts` waiting to be called. A gap described as unanswerable is a
gap nobody attempts — the same lesson the `arazzo` grounding rule left one
release earlier, in the same section.

The half of the old entry that survives is a *scope* limit rather than a
blocker: diffing the working tree against the commit carrying the **current**
version is `E_VER_UNBUMPED`'s question and still is, so a breaking edit that
forgot its bump is compared against N−1 and can slip through. Section 1 says so
under the check's own heading.

The other three rows that lived here — the example-validity rule and the two
warnings about how a model is used from outside — are `lib/datamodel/datamodel.ts`
and are in section 1. (`W_DM_UNPINNED_REF` is retired, not merely unimplemented —
see section 3.)

**Journeys**

Three rows left this group whole: the missing artifact, the unrecognised file
beside it, and the step protocol unrelated to the hop. All three are
`lib/journey/artifacts.ts` and are in section 1 — each had named a missing
*input* rather than a missing branch, and a directory listing plus the resolved
catalog is that input. What is left is the half-rule:

| Code                  | Rule that goes unchecked                                                                                                                                         |
|-----------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `E_JRN_TOUCHES_KIND`  | **Half.** The artifact clause fires in the parser (section 1); "resolves to a `component` or a `product`" needs the resolved catalog a pure parser is not given. |
| `E_JRN_PROTOCOL_KIND` | **Half**, the same way: the artifact clause fires, "is the literal `none` or resolves to a `protocol`" does not.                                                 |

Neither half moved this release, and `lib/journey/artifacts.ts` deliberately did
not take the kind clause on: it re-parses the document for its own rule and
discards every issue, because `artifact-checks.ts` already runs that parser and
owns those findings. Moving the clause there would mean one rule reported from
two places.

`E_JRN_ACTOR_KIND` is the exception in this group, and it is split three ways:
the **frontmatter** protagonist is checked in full by the loader's graph checks,
a **step's** `actor` is checked for the artifact clause by the parser, and
nothing anywhere asks whether a step's `actor` resolves to an entity of kind
`actor`. That last one is the **Half** above, once more — and it is now a rule
whose input is present and unused, because `lib/actor/actor.ts` resolves every
step `actor` to answer its own orphan rule and never asks what kind it found.

**Graph-level warnings**

Nothing. All six — the two actor rules, the two ADR bookkeeping rules and the two
requirement traceability rules — are `lib/actor/actor.ts`, `lib/adr/adr.ts` and
`lib/requirement/requirement.ts`, and are listed in section 1. Several of them
stand on the shipped exemplar catalogs, and that is the point of the severity
rather than a defect in it: they describe a system still being built, not an
error in its description.

What is left in this section is the half-rules above — the journey kind's three
kind clauses, and the two payload-reference gaps under **Protocols**. Those stay
author discipline. The `catalog-reviewer` agent covers them by reading rather
than by running — invoke it when the check is green but confidence is not.


## 3. Retired codes

Never emit or cite these; a mention in older prose is stale.

| Code                      | Superseded by                                                                                                                                                                           |
|---------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `E_STRUCT_KIND_PLACEMENT` | `E_SRN_PLACEMENT` — placement is grammar, checked while parsing.                                                                                                                        |
| `E_DM_ID_INVALID`         | Split into `E_DM_ID_MISSING` and `E_DM_ID_MISMATCH`.                                                                                                                                    |
| `E_DM_REF_KIND`           | `E_SRN_DANGLING` — the registry holds only datamodels, so a URL naming any other kind has no entry at all.                                                                              |
| `E_DM_SRN_RETIRED`        | Nothing — it flagged a *present* `x-srn` during the window when the annotation was retired. `x-srn` is required again; absence is `E_DM_SRN_MISSING`, disagreement `E_DM_SRN_MISMATCH`. |
| `E_DM_REF_ESCAPE`         | `E_DM_REF_TARGET` — it meant "on this origin but outside `/schemas/`", and the canonical URL has no `/schemas/` prefix: the whole host is the entity namespace.                         |
| `W_DM_UNPINNED_REF`       | Nothing — a `$ref` never carries a pin, so there is no unpinned case to warn about. Pins live in `relations` and are checked as ordinary SRNs.                                          |
| `E_VER_ID_MISMATCH`       | Nothing — it compared a version in `$id` against the frontmatter, and a `$id` carries no version, so the comparison has no operands.                                                    |

`E_DM_SRN_MISMATCH` was itself briefly retired and is **live again**: a
`schema.json` whose `x-srn` disagrees with its path raises it.

## 4. Spec discrepancies to be aware of

- **`E_SRN_VERSION` severity — settled, no longer a discrepancy.** The loader
  used to emit `E_SRN_VERSION` at severity `warning` for a stale-but-resolving
  pin, which read as a spec divergence. It was not: V7 asks whether a pin
  resolves *at all*, and a pin reading an older snapshot out of the
  version→commit index resolves. The loader now emits `W_REF_STALE_PIN` for the
  drift, and `E_SRN_VERSION` is an error emitted only by `lib/history/git.ts`,
  when the commit genuinely does not exist (decision-record amendment
  2026-08-20-e). A green catalog check still does not mean every pin is current —
  read the warnings.
- **A metric with no subject is `E_MET_NO_SUBJECT`, an error** — the one
  required relation edge in the whole contract. An earlier draft of
  `framework/spec/frontmatter.md` also called it `W_METRIC_UNATTACHED` and
  classed it a warning alongside `W_CAP_UNREALIZED`; that name is now gone from
  the spec and is emitted by nothing. If it turns up in an older checkout, the
  kind document wins.
- **ADR `date` — settled, no longer a discrepancy.**
  `framework/spec/kinds/adr.md` says both the quoted string and the native YAML
  timestamp are accepted, and the portal used to accept only the first: the
  loader parses frontmatter with gray-matter, so an unquoted `2026-02-03` arrives
  as a JS `Date`, and the zod schema wanted a string matching
  `^\d{4}-\d{2}-\d{2}$` and rejected it as `E_FM_SCHEMA`. `KIND_FRONTMATTER.adr`
  now declares `date: z.unknown()` and `lib/adr/adr.ts` normalizes both
  spellings, so an unquoted date passes and a malformed one is `E_ADR_DATE`. One
  timestamp form is still refused, and the kind document names it too: a `Date`
  is admitted only at exactly midnight UTC, so `2026-02-03T09:00:00Z` carries a
  time of day and fails. Quoting remains the habit worth keeping — every ADR in
  `solutions/` does — but it is no longer load-bearing.
- **Stale prose about the schema convention.** Nothing checks entity *prose*
  against the schema artifact beside it, so a paragraph describing the retired
  convention ("`schema.json` carries no `$id`", a `$ref` written as
  `../../../../datamodel/order-line/schema.json`) survives a green catalog check
  indefinitely. `solutions/acme/.../datamodel/order/index.md` carried exactly that
  until its version 4, which corrected the description and changed no artifact.
  Grep for it explicitly, and trust the `schema.json` over the prose:

  ```bash
  grep -rnE 'no [`"]?\$id|\.\./[^ ]*schema\.json|SCHEMA_BASE_URL|localhost:(3000|6363)' \
    --include='index.md' solutions/
  ```

  Most of what that prints is legitimate and must not be "fixed". Triage by
  what the page *is*:

  | Hit                                                                                                                                                  | Verdict                                                                                                                                        |
  |------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------|
  | A `datamodel` page describing its own sibling `schema.json` in the retired terms                                                                     | the defect — correct the prose, bump the entity's `version`                                                                                    |
  | An ADR recording the convention's history — `metaframework/adr/0004` and `0005` (superseded), `0006` and `0007` (accepted; they are what retired it) | history, recorded as written; never rewritten                                                                                                  |
  | `SCHEMA_BASE_URL` / `localhost:3000` / `localhost:6363` on a portal, environment or solution page                                                    | live fact — it is the retrieval address (`next dev` serves on 3000, the CLI on its own port, 6363 by default), retired only *inside artifacts* |
  | Prose naming the retired form to warn about it                                                                                                       | intended, including the correction note left behind by such a fix                                                                              |

  The only checked half of this is the artifact side: `$id`, `x-srn` and every
  `$ref` are validated against the entity's path by the schema registry, on
  every check. The prose side is grep and review, which is why it drifts.
