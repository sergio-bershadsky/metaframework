---
kind: decision-record
version: 1
status: approved
date: 2026-08-19
---

# Decision record — metaframework founding design

Settled in a grilling session on 2026-08-19. Amendments follow the additive-only
principle: append a new dated section, never rewrite history.

## Shape

- Reusable framework, monorepo: `/framework` (spec + portal) and
  `/solutions/{solution}/{product}/{component}/{sub-component}`.
- Solutions are sealed universes — no cross-solution references.
- Real content arrives later; a minimal throwaway fixture solution is used to
  develop the portal (domain: placeholder until defined by the owner).

## Ontology (closed, v1)

Solution, Product, Component (nestable), Protocol, DataModel, Actor, Environment,
ADR, Requirement.

- Components are product-owned; reuse within a solution is by reference.
- Actors and Environments are solution-level; DataModels, ADRs, Requirements are
  owner-scoped; a Protocol lives at the nearest common ancestor of its participants.

## Identity — SRN

Hierarchical URI, identical to the disk path:

```
srn://{solution}/{product}/{components…}/{kind}/{name}[@{version}]

srn://acme                                          → solution
srn://acme/shop                                     → product
srn://acme/shop/checkout/payment                    → (sub)component
srn://acme/shop/checkout/payment/datamodel/order@1  → datamodel
srn://acme/shop/protocol/order-events@1             → product-level protocol
srn://acme/actor/customer@1                         → solution-level actor
```

- Parsing: segment 1 = solution, segment 2 = product, further segments = component
  path, until a reserved kind keyword (`datamodel`, `protocol`, `actor`,
  `environment`, `adr`, `requirement`) — then `{kind}/{name}` follows.
- Reserved kind keywords are forbidden as product/component names (validated).
- Versions are plain integers, monotonic. A ref without `@` means latest.
- SRN is the one reference syntax everywhere: frontmatter, JSON Schema `$ref`,
  workflow YAML, and prose (markdown links with `srn://` URIs).
- Disk mapping: strip `srn://`, prefix `solutions/` → the entity directory.

## Entities & data models

- Entity = directory with `index.md` (frontmatter + prose) + sibling YAML/JSON
  artifacts.
- Data models are JSON Schema; `$id` = versioned SRN; inheritance is stock
  `allOf` + `$ref` (absolute SRN or RFC 3986 relative). The build preloads all
  schemas into the validator registry. No proprietary inheritance layer.

## Protocols

A protocol may describe: transport (structured YAML + optional linked
OpenAPI/AsyncAPI), datamodel refs, workflows (sequence-oriented YAML), state
machines (XState-compatible JSON). All formats chosen to be diagram-derivable.

## Evolution & history

- `version` field on every entity; additive-only principle — never reduce,
  only extend, or create new and swap later.
- History is git-backed: the portal resolves previous versions via a
  version→commit index built from git history. Consequences: `.git` must be
  present where the portal runs; pinned old-`@version` refs resolve through
  git, not the filesystem.
- No CLI in v1; integrity is enforced at portal build/load: zod frontmatter
  validation, dangling-SRN detection, JSON Schema registry resolution.

## Portal

- Next.js 15 App Router, TypeScript, Tailwind, shadcn/ui, React Flow (@xyflow/react)
  + elkjs, zod. SSR server + SPA navigation; live fs reads in dev.
- v1 features: catalog tree navigation, entity pages, derived diagrams
  (component graphs, protocol sequences, state charts, schema inheritance
  trees), schema explorer, solution dashboard, previous-version button on every
  artifact (git-backed).
- Deferred: global graph view, full-text search, ADR timeline, portal-native
  review workflow, cross-solution sharing, extensible ontology.
- Diagrams: derived-first; React Flow primary, mermaid fallback, hand-authored
  escape hatch. Human + AI readability is a stated design principle.
- Visual: Linear/Vercel-school dense dark only; electric blue-violet accent.

## Process

- First deliverable: the framework spec written in its own format under
  `/framework/spec/`, reviewed before portal code.
- Review is git-native: files are the review surface; the portal is read-only
  presentation. Frontmatter may carry `status: draft|review|approved|deprecated`.

---

## Amendment 2026-08-19-a — actual portal stack version

The stack section above named "Next.js 15". The scaffolded portal is **Next.js
16.3.1** (current release at scaffold time), React 19.2. Consequences that bind
all portal code:

- Request APIs are async-only: `params` and `searchParams` in `page`/`layout`/
  `route` are Promises and MUST be awaited. Synchronous access was removed in 16.
- Turbopack is the default bundler for both `dev` and `build`.
- Route prop types come from generated helpers (`PageProps<'/route'>`,
  `LayoutProps`), produced by `next typegen`.
- `middleware` is renamed to `proxy`; Partial Prerendering flags are removed.

Rationale for recording rather than rewriting: this file follows the framework's
own additive-only principle — history is extended, never edited.

---

## Amendment 2026-08-19-b — JSON Schema references become standards-generic

The identity section above makes the SRN "the one reference syntax everywhere,
including JSON Schema `$id` and `$ref`". **That part is superseded for
`schema.json` artifacts only.** Everything else about the SRN is unchanged.

### The requirement

References must be *compliant and generic*: resolvable by any standard tool,
not only by this portal.

### The evidence

Two things were measured rather than assumed.

1. **Editor navigation is unobtainable through reference syntax.** VS Code
   embeds `vscode-json-languageservice`; it produces navigable links only for
   same-document JSON Pointers (`#/$defs/money` — verified working). Every
   external form produced nothing: SRN refs, plain relative file paths, and
   relative paths with pointers alike. No choice of ref syntax buys
   go-to-definition; only an editor extension or LSP would, for any syntax.
2. **Generic consumption is real, and SRN refs break it.** Off-the-shelf
   `json-schema-to-typescript` against the same schema pair:

   ```text
   "$ref": "/datamodel/money@1"      → FAILED: Error opening file "/datamodel/money@1"
   "$ref": "../money/schema.json"    → OK: interface Order { total?: Money } + interface Money
   ```

   The same applies to `ajv-cli`, `quicktype`, and `datamodel-code-generator`:
   they resolve relative file references off the filesystem and have no way to
   resolve a private URI scheme.

### The decision

Inside `schema.json` only:

- **`$ref` is a relative file path** to the target's `schema.json`
  (e.g. `../money/schema.json`, `../../../datamodel/order-line/schema.json`).
- **`$id` is omitted.** JSON Schema resolves a relative `$ref` against the base
  URI, which is `$id` when present — so an `srn://` `$id` would re-break generic
  resolution even with path-style refs. Dropping it costs nothing: the entity's
  identity and version already live in its `index.md` frontmatter, and the
  schema's SRN is derivable from its path, since SRN ≡ path.
- **`x-srn`** MAY carry the entity's SRN as a JSON Schema annotation, so a
  schema copied out of the catalog keeps its provenance. It is validated
  against the file's actual path at load, so it cannot drift.
- **Version pinning leaves `$ref`.** `money@1/schema.json` is not a path, and
  with git-backed history (only current versions on disk) a pinned historical
  ref never resolved to a file anyway. Pinning remains available in frontmatter
  `relations`, which no external tool consumes.

Unchanged, because no interoperability standard governs them: frontmatter
`relations`, protocol/workflow YAML payload references, and prose links all
keep SRN form. Editor navigation for those is a known gap; an LSP is the only
remedy and is explicitly not in v1.

---

## Amendment 2026-08-19-c — schema references become dereferenceable URLs

> **Partly superseded by 2026-08-19-d** (below), on two points: the host is now a
> canonical constant rather than `SCHEMA_BASE_URL`, and `x-srn` is required
> again. The URL form itself, and everything else here, stands. This section is
> left as written — history is appended to, never rewritten.

**This supersedes amendment 2026-08-19-b.** That amendment's requirement stands
and is not in dispute; its *mechanism* is replaced. Everything else about the
SRN — frontmatter `relations`, workflow YAML, prose links — remains exactly as
2026-08-19-b left it. This changes `schema.json` artifacts only.

### What was wrong with the previous answer

2026-08-19-b asked for references that are "compliant and generic: resolvable by
any standard tool". It delivered *well-formed* references, not resolvable ones.
A relative path like `../../../../datamodel/money/schema.json` resolves for
exactly one class of consumer: a tool running inside a clone of this repository,
with the whole catalog on disk, invoked from the right directory. Paste the same
schema into a validator, a browser playground, a generator in another repo, or a
CI job that fetched one file — and the reference resolves to nothing. The
measurement in 2026-08-19-b was real but its scope was narrower than the
requirement: it proved that `json-schema-to-typescript` *can* follow a relative
path off a filesystem, not that any consumer can follow the reference.

The `$id`-less design compounded it. Without `$id` a document has no identity of
its own, so the only base URI available is wherever the file happened to be
retrieved from — which means a schema separated from its directory cannot say
what it is or where its neighbours are.

### The decision

Inside `schema.json` only:

- **`$id` is the URL the portal serves the schema at**, and the path after
  `/schemas/` is the entity's SRN path verbatim:

  ```text
  srn://acme/datamodel/money
    → http://localhost:3000/schemas/acme/datamodel/money
  ```

- **`$ref` is the absolute schema URL of its target.** One form, no relative
  paths, no `srn://`, no depth arithmetic. The eight-`..` chains are gone.
- **`x-srn` is retired.** It existed because the document had no identity
  keyword; `$id` now carries identity in a keyword validators actually act on,
  and two identity fields is one too many. A leftover `x-srn` is an error, not a
  tolerated annotation.
- **Local JSON Pointers (`#/$defs/...`) are unchanged**, and `$defs` stay
  entity-private.
- **No version suffix appears in a URL.** It addresses the *current* schema.
  Pinning stays in frontmatter `relations`, where git-backed history can resolve
  it — unchanged from 2026-08-19-b.

### Why a served URL is the right answer

Because it makes the reference *dereferenceable*, which is what "resolvable by
any standard tool" actually requires. This is measured, not assumed. With the
portal running, a stock `json-schema-ref-parser` — given nothing but the URL,
with filesystem access unused — bundled the deepest schema in the catalog:

```text
$ node http-deref.mjs
fetched documents:
   .../schemas/acme/datamodel/auditable
   .../schemas/acme/datamodel/base-record
   .../schemas/acme/datamodel/money
   .../schemas/acme/product/shop/datamodel/card-payment
   .../schemas/acme/product/shop/datamodel/order-line
   .../schemas/acme/product/shop/datamodel/payment-method
   .../schemas/acme/product/shop/datamodel/sepa-payment
   .../schemas/acme/product/shop/component/checkout/component/payment/datamodel/order
inherited properties: id, created-at, changed-by, change-reason
resolved without a single filesystem read: true
```

Eight documents, the full transitive closure, over HTTP, by a tool that has
never heard of this framework. Under the previous form the same tool, handed the
same starting point, resolved nothing.

Two secondary gains, neither of them the reason: the reference no longer encodes
the referrer's depth, so moving an entity stops rewriting every `$ref` that
points *out* of it; and `$id` restores a base URI, so a schema copied out of the
catalog still says what it is.

The interoperability cost of `$id` that 2026-08-19-b feared does not
materialise, because it was a cost of `$id` **plus relative refs** — an `srn://`
`$id` re-basing `../money/schema.json` onto an unresolvable scheme. With
absolute-URL refs there is nothing to re-base: every reference is already
complete.

### The SCHEMA_BASE_URL portability rule

> **Retired by 2026-08-19-d.** Identity no longer varies by deployment, so there
> is nothing per-deployment left in the artifacts to rewrite. Recorded as
> written; do not follow it.

The origin is configuration, never a literal. It comes from `SCHEMA_BASE_URL`
(default `http://localhost:3000`), exposed by
`framework/portal/src/lib/schema/url.ts`, and every module — the portal, the
migration script, the tests — reads it from there.

But the origin is *baked into the artifacts on disk*, so it is a
**deployment-wide constant, not a per-request setting**:

- Changing `SCHEMA_BASE_URL` requires rewriting every `$id` and `$ref`.
  `scripts/migrate_schema_ids.py` does exactly that and is idempotent; run it
  after the change and commit the result.
- Agreement is enforced, so the env var and the files cannot drift apart
  silently: a document whose `$id` is not
  `SCHEMA_BASE_URL + /schemas/ + <srn-path>` is `E_DM_ID_MISMATCH` in the schema
  registry, and the shipped-catalog regression suite asserts the same equality
  directly. A mismatch is a red test, not a subtly wrong link.

  Caveat, recorded rather than glossed: `buildSchemaRegistry` is not yet called
  by any page, so today that diagnostic surfaces through the test suite rather
  than through a rendered diagnostics page. That gap predates this amendment —
  the registry has never been wired into the portal — and closing it is separate
  work.
- A catalog served from more than one origin is out of scope for v1. One
  catalog, one origin, one set of URLs.

The portal itself never dereferences these URLs. It holds the files already, so
ajv is given each document under its own `$id` and the bundler maps a schema URL
back to a local file. That is deliberate: SSR must not depend on the server
being able to reach itself over the network. The URLs are dereferenceable *for
outsiders*; for the portal they are identity.

### Consequences

- New route: `GET /schemas/{srn-path}` returns the schema as
  `application/schema+json`, 404s cleanly, rejects any path leaving the catalog,
  carries an ETag, and sets `Access-Control-Allow-Origin: *` so browser-based
  validators can read it.
- Error codes: `E_DM_ID_MISSING` and `E_DM_ID_MISMATCH` are new;
  `E_DM_ID_FORBIDDEN` narrows to *nested* `$id` only; `E_DM_SRN_RETIRED`
  replaces `E_DM_SRN_MISMATCH`, which is retired with `x-srn`.
- Retired with the relative-path form: `E_DM_REF_KIND` is now covered by
  `E_SRN_DANGLING` (the registry holds only datamodels, so a URL naming anything
  else has no entry). `E_DM_REF_ESCAPE` survives with a narrowed subject — a URL
  on this origin that leaves the `/schemas/` namespace.

---

## Amendment 2026-08-19-d — identity is canonical, and the SRN stays in the file

**This amends 2026-08-19-c on two points and leaves the rest of it standing.**
The URL form, the one-spelling rule, the absence of a version suffix, the
entity-private `$defs` and the local JSON Pointers are all unchanged. What
changes is *which host* an artifact names, and whether `x-srn` exists.

### 1. The host is a canonical constant, not `SCHEMA_BASE_URL`

2026-08-19-c made `$id` the URL *the portal serves the schema at*, derived from
`SCHEMA_BASE_URL`. That conflated two different things:

|                      | Identity                        | Retrieval                                |
|----------------------|---------------------------------|------------------------------------------|
| What it answers      | what this schema **is**         | where a copy can be **fetched**          |
| Where it lives       | in the artifact (`$id`, `$ref`) | in deployment config (`SCHEMA_BASE_URL`) |
| Varies by deployment | **never**                       | yes, by definition                       |

Making identity track a deployment variable is a defect, not a configuration
choice. Registries, caches, generated client packages and `$ref` graphs all key
on `$id`; a laptop saying `http://localhost:3000/schemas/acme/datamodel/money`
and production saying `https://catalog.acme.example/schemas/acme/datamodel/money`
hold **two** schemas where there is one, and the disagreement surfaces as a
resolution failure far from its cause. It also made the "portability rule" of
2026-08-19-c necessary at all: rewriting every artifact on a config change is
work that only exists because the config was in the artifacts.

The decision:

- `$id` and every cross-entity `$ref` are built on
  **`https://schemas.metaframework.dev`**, a constant defined once in
  `framework/portal/src/lib/schema/url.ts` (`CANONICAL_SCHEMA_HOST`) and
  mirrored in `scripts/migrate_schema_ids.py`.
- `SCHEMA_BASE_URL` still exists and still controls the `/schemas` route — where
  *this* deployment hands the bytes over. It MUST NOT appear in any artifact. A
  `$ref` naming a serving address is `E_DM_REF_TARGET`, with the canonical URL in
  the diagnostic message.
- The `SCHEMA_BASE_URL` portability rule of 2026-08-19-c is **retired**: there is
  nothing per-deployment left in the artifacts to rewrite.

Nothing about dereferenceability is lost. In JSON Schema, `$id` is an identifier
and retrieval is a resolver's problem: a consumer that prefers fetching to
trusting a cache maps the canonical host onto a serving address in resolver
config — one line, outside the artifacts. The measurement in 2026-08-19-c
proves the *URL form* is dereferenceable, which is unaffected by which host the
file names. The portal's own bundler is exactly such a mapping, resolving each
canonical URL to a local file.

### 2. `x-srn` is required again

2026-08-19-c retired `x-srn` on the grounds that `$id` had made it redundant and
that two identity fields can disagree. Both halves were wrong in practice:

- **The SRN vanished from schema files entirely.** Identity became implicit in a
  URL-parsing rule — "strip this host, prefix `srn://`" — that a reader has to
  know to apply. A schema pasted into a validator, vendored into a client repo or
  attached to a ticket could no longer say where it came from in the framework's
  own vocabulary, and `grep -r 'srn://acme/datamodel/money' solutions/` stopped
  finding the schema that *is* that entity.
- **They cannot disagree.** Both `$id` and `x-srn` are derived from, and checked
  against, the file's own directory at load. They are two spellings of one
  derived fact, not two hand-maintained fields. The disagreement 2026-08-19-c
  feared requires a field that is *trusted*; neither of these is.

`x-srn` is REQUIRED, carries the entity's **unversioned** SRN, and is validated
against the path (`E_DM_SRN_MISSING`, `E_DM_SRN_MISMATCH`).

### 3. `deprecated` is named as the lifecycle keyword

Recorded here because it was previously only implicit: `deprecated` is a
**standard 2020-12 meta-data keyword**, verified present in the meta-data
vocabulary (`node_modules/ajv/dist/refs/json-schema-2020-12/meta/meta-data.json`).
A datamodel whose entity `status` is `deprecated` SHOULD set `"deprecated": true`
at the schema root, and any property being phased out MAY carry it. It is an
annotation, so setting it is always additive. No framework extension is defined
for this — stock tooling already understands it.

### Consequences

- Error codes: `E_DM_SRN_MISSING` and `E_DM_SRN_MISMATCH` are (re)introduced.
  `E_DM_SRN_RETIRED` is retired with the window that produced it.
  `E_DM_REF_ESCAPE` is retired: it meant "on this origin but outside
  `/schemas/`", and the canonical host carries no route prefix — the whole host
  is the entity namespace — so a bad path is `E_DM_REF_TARGET`.
  `E_DM_REF_KIND` stays retired (2026-08-19-c).
- `scripts/migrate_schema_ids.py` normalises a catalog written against any host
  or serving address onto canonical identity, and adds `x-srn`. It is idempotent
  and doubles as a drift guard (`--check`).
- The consolidating principle is unchanged and is now stated verbatim in
  `framework/spec/srn.md` and in the plugin's reference bundle:

  > The SRN is the identity. The schema URL is its dereferenceable projection.
  > The disk path is its storage. All three are mechanically inter-convertible,
  > and none of them is a second addressing scheme.

---

## Amendment 2026-08-19-e — state diagrams render with mermaid, always

The portal section above chose "React Flow primary, mermaid fallback" for
derived diagrams. **That part is superseded for state charts only.** Sequence
diagrams (hand-rolled SVG), the relation graph and the solution map (React
Flow + ELK) are unchanged, and mermaid remains unavailable to them.

### The decision

Decided by the owner, 2026-08-19: the state-chart widget is rebuilt from
scratch on **mermaid** (`stateDiagram-v2`), and mermaid is the renderer for
state diagrams, always. `states.json` stays the artifact and `parseStates`
stays the validator and the model; only the renderer behind the parsed
`StateChart` changes — a pure generator emits mermaid text from it, and a
client component renders that text.

### Why

The custom React Flow chart earned its keep on interactivity but not on
layout. It went through repeated legibility rounds — a two-pass
measure-then-relayout pipeline, a label-spread solver with obstacle avoidance,
per-chart calibration constants — and residual label grazes still survived on
the charts that mattered (promotion-evaluation's compound regions, the brass
action-composition chart with 30 edge labels). Mermaid's deterministic
state-diagram layout places labels on dedicated edge-label tracks and has
never needed any of that machinery. The owner watched the fix rounds and made
an informed call: deterministic layout beats interactive custom layout for
this diagram kind.

### What is knowingly given up

- **Pan/zoom and the React Flow controls.** The mermaid SVG is a static
  drawing; the expand-to-viewport affordance is kept, wheel-zooming a canvas
  is not.
- **The density toggle.** Compact/detailed state boxes were a React Flow
  feature; mermaid draws one density.
- **Hover detail panels** on states (description, entry/exit behind a hover)
  and hover-expanded transition labels (guard/actions behind a dot). Mermaid
  renders what the text declares, inline.
- **Fine-grained interactivity is best-effort, not contractual.** The
  source-line join (anchors) and adjacency dimming survive only as far as
  mermaid's generated SVG exposes stable, addressable element ids; whatever
  does not survive is reported, not faked.

Recorded rather than rewritten, per this file's additive-only principle.

---

## Amendment 2026-08-20-a — the ontology opens: capability, journey, metric

The founding record above calls the ontology **closed, v1** and lists an
extensible ontology under Portal → Deferred.
`solutions/metaframework/adr/0003-closed-ontology-of-nine-kinds` argues each of
these three kinds away by name. Neither is rewritten. This amendment records
that the owner reopened the set on 2026-08-20 and admitted exactly three kinds.

### The decision

`capability`, `journey` and `metric` become reserved kind buckets, taking the
SRN grammar from eight to eleven. Their placement classes are the ones that
already existed:

| Kind         | Class          | May sit                                        |
| ------------ | -------------- | ---------------------------------------------- |
| `capability` | solution-level | only directly under the solution, like `actor` |
| `journey`    | solution-level | only directly under the solution, like `actor` |
| `metric`     | owner-scoped   | under any owning entity, like `requirement`    |

**No placement rule was added.** P4 was already written over a *set* of
solution-level kinds, so `capability` and `journey` joined the set and P4
covered them unchanged; `metric` is owner-scoped, which is precisely a kind no
rule after P1 mentions. Placement therefore stays a property of the grammar and
still fails as `E_SRN_PLACEMENT` while the path is being read, which is the
reason bucketed paths were adopted (2026-08-19, ADR 0008).

### The cost, and the check that had to precede it

Adopting a bucket word takes it out of circulation as a **name**, everywhere, at
once — and worse than a rejection, an existing entity named after it silently
changes what its path means: `…/datamodel/metric` stops being a datamodel called
"metric" and becomes an unparseable half-pair. So the collision check ran first,
over all three solutions:

```bash
$ find solutions -type d \( -name capability -o -name journey -o -name metric \)
$ find solutions -name index.md | sed 's|/index.md||' | awk -F/ '{print $NF}' \
    | grep -cE '^(capability|journey|metric)$'
0
```

Nothing collided — 0 hits across 280 entities in `acme`, `brass` and
`metaframework`. Had one existed, the kind could not have been adopted under
that name without a swap first (evolution.md), because renaming a published
entity is exactly what the additive-only rule forbids doing in place.

### How the reserved set grows

By **appending**. `RESERVED_KINDS` in `framework/portal/src/lib/srn/srn.ts` is
adoption order, not alphabetical order, so a kind adopted later never displaces
one adopted earlier and a diff of the list reads as a history. The same holds
for `KIND_ORDER` in the portal, where the three were *inserted* where they read
— capability and journey beside the participants they involve, metric beside the
requirement it puts a number on — without moving any pair of the original nine
relative to each other.

### What this amendment does not settle

Recorded here so the gaps are visible rather than assumed closed: the
frontmatter contract of each new kind (the portal's kind schemas are
deliberately empty layers until `framework/spec/kinds/` states them, so any
kind-specific field is a loud `E_FM_UNKNOWN_FIELD` in the meantime), the
`journey.yaml` step format, the `realizes` and `measures` edges, the component
`lifecycle` field, and the catalog's own self-description — ADR 0003, the portal
and srn component entities, which still say there is no such kind and are now
describing a framework that has moved.

## Amendment 2026-08-20-b — the loader enforces the three new kinds, and component `lifecycle` lands

Amendment 2026-08-20-a opened the ontology and left the frontmatter contracts,
the two new edges and the component `lifecycle` field explicitly unsettled. The
kind documents `framework/spec/kinds/capability.md`, `journey.md` and
`metric.md` now state them, and `component.md` states `lifecycle`. This
amendment records what the **portal's loader** enforces, and — where the loader
had to make a call the specs do not — which call it made and why. It rewrites
nothing.

### The loader is the executable copy of the kind documents

The codes and severities below are the kind documents', not the loader's
invention. What is worth recording is that the severity split across all three
documents reduces to one rule, and the loader implements it as one rule:

> A violation is an **error** when the entity is meaningless without the fix,
> and a **warning** when it is a true statement about a system still being
> built, or a judgement call about who owns something.

That is why a metric with no subject is `E_MET_NO_SUBJECT` (a number with no
subject is a figure, not an observation) while a capability nothing realizes is
`W_CAP_UNREALIZED` (describing before building is this framework's intended
order of work), and why a metric filed away from its subject's owner is
`W_MET_SUBJECT_SCOPE` rather than an error — responsibility placement is a
judgement, and a team genuinely tracking someone else's number should be
visible rather than blocked.

| Code                     | Severity | Raised when                                                    |
| ------------------------ | -------- | -------------------------------------------------------------- |
| `E_MET_TARGET`           | error    | `target` is not a literal of the grammar `metric-type` selects |
| `E_MET_WINDOW`           | error    | `window` is neither `instant` nor a rolling duration           |
| `E_MET_NO_SUBJECT`       | error    | a metric authors no `measures` edge                            |
| `W_MET_SUBJECT_SCOPE`    | warning  | the metric is filed outside its subject's ownership line       |
| `E_JRN_ACTOR_KIND`       | error    | the frontmatter `actor` resolves to something else             |
| `W_CAP_UNREALIZED`       | warning  | no product or component `realizes` the capability              |
| `W_CAP_REALIZATION_EDGE` | warning  | a capability `uses` a component to state its own realization   |

### Where a kind rule needed its own code, the schema could not carry it

Everything a zod kind schema rejects is reported as `E_FM_SCHEMA`, and
`metric.md` gives `target` and `window` violations codes of their own. So the
loader gained a second, narrower hook beside the schemas —
`kindDiagnostics(kind, raw)` in `catalog/frontmatter.ts` — for rules that are
checkable from the document alone but must be reported under a specific code.
Anything needing the resolved catalog stays a graph check in `load.ts`.

This is the split worth keeping: **schema** for shape, **kindDiagnostics** for
document-local rules with their own codes, **graph checks** for anything that
needs another entity. A rule in the wrong one of the three either loses its code
or fires before the catalog exists.

`target` and `window` are therefore plain strings in the schema. That has a
second benefit the spec names: an unquoted `target: 1200` is turned into an
integer by YAML before validation sees it, and a string schema catches it as
`E_FM_SCHEMA` — the one case quoting is load-bearing for.

### Two new edges, appended to the type list, inserted into the legend

| Edge       | Legal sources      | Legal targets                                |
| ---------- | ------------------ | -------------------------------------------- |
| `realizes` | product, component | capability                                   |
| `measures` | metric             | capability, component, protocol, requirement |

`EDGE_TYPES` grows by **appending**, for the reason `RESERVED_KINDS` does: the
order is adoption order and a diff of the list reads as a history. The relation
graph's legend does **not** follow it — `EDGE_STYLES` places `realizes` beside
`implements` and keeps `supersedes` last, matching frontmatter.md's table.

That split is the same one 2026-08-20-a drew for kinds, and it generalizes:
**identity lists append, display lists insert where they read.** Adoption order
is a fact about the framework's history and must not be reordered; legend order
is a fact about the reader and must not be a history lesson.

Inverse edges (`realized-by`, `measured-by`) are derived. The loader's existing
inbound index needed no change to produce them, which is the property worth
recording: adding an edge type is a table entry, not a graph pass.

### Component `lifecycle` — the same field name, a different value set

`lifecycle` becomes **required** on `component`, joining `product`, which has
had it since v1.

    component: planned | in-development | released | sunset | retired
    product:   concept | incubating | active | maintenance | sunset | retired

The **name** is shared deliberately, so one word means "where is this in the
real world" on every kind that has a real world. The **values** are not:

- A product is *positioned in a portfolio*. `concept` and `incubating` are
  investment states answering "is this a committed bet?" — a component inside a
  funded product is not a bet, so it has neither.
- A component is *built and shipped*. Its states answer "does this exist yet,
  and is it still running?" — hence `planned` and `in-development`, which a
  portfolio does not track because a product's development is the sum of its
  components'.
- `active` has no component equivalent: on a product it is a positioning claim,
  and the delivery fact underneath it is `released`.
- `maintenance` is absent. On a product it is an investment statement; on a
  component it would be one delivery state spelled two ways, because a component
  under maintenance is still released.
- `sunset` and `retired` keep product's exact meaning. That shared tail is what
  earns the shared field name.

**`lifecycle` is not an extension of `status`, and the two never merge.**
`status` is the review state of the *description*; `lifecycle` is the delivery
state of the *thing described*. The axes cross, and an `approved` description of
a `planned` component is the design-first normal case this framework is built
around. The enums are kept disjoint so neither can be read as the other.

Deliberately coarse and global: released-in-staging-but-not-production is a
per-environment fact and stays in environment declarations and `topology.yaml`.
Folding environments into the enum would make the field unanswerable for any
component that ships to more than one.

### Consequences

Making `lifecycle` required invalidates every component in the shipped catalog
at once — 67 entities, one `E_FM_SCHEMA` each, and nothing else:

```bash
$ npx vitest run src/lib/catalog/fixture-check.test.ts   # in framework/portal
  67 E_FM_SCHEMA … lifecycle: Invalid option
```

That red is intended within this batch. The field is left required and the
migration follows, because a required field cannot be introduced any other way
under additive-only evolution: the alternative, optional-then-required, is
exactly the tightening the rule forbids.

### What this amendment does not settle

The `journey.yaml` step format and its `E_JRN_*` codes beyond
`E_JRN_ACTOR_KIND`, which is a frontmatter field and therefore the loader's;
`W_REQ_UNIMPLEMENTED` and `W_REQ_WONT_IMPLEMENTED`, specified in
`kinds/requirement.md` since v1 and still not implemented — now conspicuous,
because the capability warning beside them is the same check; the migration of
the 67 components; and the catalog's own self-description, still listed as open
in 2026-08-20-a.

## Amendment 2026-08-20-c — the portal is a published CLI, and it serves somebody else's catalog

The portal stops being a thing you clone and becomes a thing you install:

```bash
npm install -g @bershadsky/metaframework
cd ~/code/my-solution && metaframework
```

That one line inverts every assumption the portal was built under. It no longer
lives beside the catalog it renders; it no longer owns the repository it runs
in; and the tree under it is being edited *while it serves*. Three decisions
follow, and they are the amendment.

### The catalog is found, not configured

Discovery walks up. `solutions/` in the working directory, then in its parent,
and up to the filesystem root — the way git finds `.git` — stopping at the first
one that holds a solution rather than the first one that merely has the name.
`--dir` beats `CATALOG_DIR` beats the walk. When nothing is found the error
lists every path tried, because "no catalog found" without the list is
unactionable and the answer is almost always "you are one directory too deep".

The alternative, a config file, was rejected for the reason the framework
rejects a database: the filesystem already says where the catalog is.

### Two serving modes, and `NODE_ENV` is not one of them

A `next start` bundle sets `NODE_ENV=production`, and until now that was the
switch deciding whether the catalog could be read once and kept. Shipped as a
CLI that reading is wrong: the CLI *is* a production build, pointed at a
directory the user is editing right now.

So the switch is named for what it actually distinguishes —
`METAFRAMEWORK_MODE`, with `working-tree` and `deployment`:

- **working-tree** — the filesystem is the truth on every request. Fingerprint
  the tree, re-read when it moves, watch it so an open page hears about the
  edit. `next dev` and the CLI are both this; the CLI sets the variable
  explicitly, which is the one environment line packaging must never lose.
- **deployment** — the catalog is static input to a build, read once per
  process. This is still right for a hosted portal, and the original reasoning
  for it stands unamended.

The inference from `NODE_ENV` is kept as the fallback, so a genuine deployment
needs no variable and an unrecognised value degrades to the old behaviour rather
than stopping a server from serving.

The live-reload route ships in every build and answers 404 outside working-tree
mode. Compiling it out would mean two route tables for one bundle, and in
deployment mode nothing connects to it anyway.

### What is published, and from where

**`framework/portal` is the package root, and stays there.** The published
artifact *is* the built Next app: the standalone trace, `next.config.ts` and
`.next/` all resolve from the app directory, so a separate `packages/cli` would
either re-export a build it does not own or be a second package solving nothing.
The cost — one directory that is both the monorepo's app and a published package
— is paid by an allowlist, not by a restructure. The repository root stays
private and unversioned; `framework/portal/package.json` carries the product's
public version.

The tarball is a compiled server, not a source tree:

- `output: 'standalone'` traces what the server actually imports, `node_modules`
  included. `sharp` and its `@img` prebuilds are excluded from the trace: 27MB
  of *platform* binaries for a portal that renders no `next/image` at all.
- Every runtime library is therefore declared as a **devDependency**. They are
  build inputs to a bundle; a published CLI that made a user install `mermaid`
  and `monaco-editor` to run a server that already contains them would be
  shipping the same bytes twice. `npm install -g` adds exactly one package.
- `files` is an allowlist — bin, standalone, README. No `src`, no tests, no
  `.next/cache`, and above all no `solutions/`: shipping the monorepo's own
  catalog inside a tool for reading catalogs would be a category error.
- `prepack` builds and assembles, so a stale bundle cannot be published.
- The trace deliberately omits `public/` and `.next/static`, on the assumption
  of a CDN in front. There is no CDN in front of a laptop, so assembly copies
  them inside the standalone directory and asserts they arrived — the failure it
  prevents is the quiet one, where the server boots and every asset 404s.

Measured: **12.4 MiB packed, 50.6 MiB unpacked, 1684 files** — under the ~100MB
threshold with room to spare. It is dominated, in order, by the server bundles
(23MB, chiefly monaco and elkjs), the traced Next runtime (16MB, of which 4.3MB
is one font-metrics JSON), and the browser bundles (14MB).

The floor is **Node 20.11** — verified by running the tarball on 20.9.0, 20.10.0
and 20.11.0, not by reading a compatibility table. Next 16 itself needs 20.9;
the CLI's use of `import.meta.dirname` is what moves it two patch releases up.

### Consequences

`next dev` and a published `metaframework` are now the same mode serving
different directories, which is the property to preserve: a bug reproducible in
one is reproducible in the other. The portal's integrity gate travels with it —
`metaframework check` is the same loader and the same diagnostics as
`/diagnostics`, exiting 1 on errors, so a catalog in someone else's repository
is held to this framework's rules by the same code that renders it.

### What this amendment does not settle

Publishing itself: the `@bershadsky` scope does not exist on npm yet, and that
is the owner's step. Whether the portal's version becomes the framework's
version, or the spec versions separately. And the ~2.8MB of duplicated monaco
SSR chunks in the server bundle, which are a build artifact of a client-only
editor being reachable from a server component — worth a look before the
tarball grows again.

## Amendment 2026-08-20-d — one h1 per page: the title is frontmatter's, not the prose's

Every entity page rendered two `<h1>`s. The portal draws frontmatter `title` in
the header, and every one of the 288 shipped `index.md` files then opened with
`# <title>` — not a paraphrase, not a section name: the **same string**, byte for
byte, in all 288 (checked, not assumed). The page printed the title twice, and a
document with two top-level headings has no outline for a screen reader's
heading navigation or for anything else that reads a document as a tree.

### Fixing the source, not the renderer

The mechanical fix was to demote authored headings by one level in the markdown
renderer: `#` renders as `<h2>`, the outline is legal, and no author can break it
again. It was rejected on two counts.

It does not fix the defect. The second h1 was a *duplicate title*, so demoting it
leaves the same string on the page twice and merely relabels the copy — while
dragging every authored `##` down to `<h3>`, which this renderer styles as small
uppercase muted text. The outline would be correct and 288 pages would look worse.

And it makes the file disagree with the page. Review here is git-native — "files
are the review surface; the portal is read-only presentation", from the founding
record's Process section — so the artifact a reviewer reads is the markdown diff,
on a git host that renders `#` as an h1. A renderer that silently says
otherwise puts the source and the page in two different documents.

So the rule is on the source: **`index.md` prose carries no level-1 heading;
sections start at `##`** (`structure.md`, "The document body"). The 288
duplicated headings were deleted — provably lossless, since each was exactly the
`title` the header already renders.

### The rule is enforced, because a convention would rot

A catalog convention nobody checks is a convention until the next entity. The
loader now raises `E_STRUCT_BODY_H1`, severity **error**, so the zero-error
catalog-load requirement is what holds it — the same gate `metaframework check`
runs in someone else's repository. Both spellings are caught, `# Title` and a
`=` underline; a `#` inside a fenced block is a path comment and is ignored,
which is what makes the rule usable in a spec full of `# solutions/acme/…`.

The kind body templates that showed `# <Title>` (capability, metric,
requirement), the frontmatter worked example, and the plugin's per-kind worked
examples were all corrected — an authoring kit that keeps emitting the violation
is the same rot with a longer fuse.

### What this amendment does not settle

Whether `framework/spec/*.md` should follow its own rule. Those files are read on
a git host, not through the portal, and their h1 is the document's only title, so
they keep it. If the spec is ever rendered *by* the portal, that decision comes
back.

## Amendment 2026-08-20-e — two heading defects: one collision, one code wearing the wrong severity

Two unrelated things, settled together because both were the same mistake in
different clothing: a name that did not say what it named.

### An authored `## Artifacts` and the portal's Artifacts section were one heading

An entity page prints two documents at once. `index.md` is the first — prose the
author wrote, whose `##` headings are that document's outline. Everything the
portal derives around it is the second: Details, Artifacts, Relations,
Neighbourhood, Contents, Realized by. Both were bare `<h2>`s, so the outlines
were spliced into one flat list of peers. Twelve protocol documents open a
`## Artifacts` section to explain what their sibling files are for — a genuinely
different thing from the portal's list of those files — and on all twelve the
page carried two level-2 headings reading "Artifacts" with nothing to separate
them. `carrier-booking`'s outline read `… Failure / Artifacts / Details /
Artifacts / Book one parcel …`.

**Nothing was wrong with the pixels.** Measured on that page: the authored
heading is 16px, no transform, letter-spacing −0.4px, `foreground` (lab L\* 94.2);
the portal's is 12px, uppercase, letter-spacing +1.68px, `muted-foreground`
(lab L\* 57.0). Four axes apart, and a sighted reader was never confused. The
**accessible name** was identical: Chrome does not fold `text-transform` into
name computation, so the accessibility tree held `heading "Artifacts" [level=2]`
twice. That is what a screen reader navigates by and what an outline tool lists,
and it was the only thing that had collided.

So the distinction was made where it was missing, in one shared component
(`components/entity/section-heading.tsx`), and only there. Every portal-drawn
section label carries a visually hidden `— portal section` inside the heading —
inside the text rather than as an `aria-label`, so a plain `textContent` outline
sees it too — and each such `<section>` names itself with `aria-labelledby`,
which makes it a `region` landmark. The portal's sections are now reachable and
skippable as landmarks; the entity's own prose is not. That is the structural
half of the same statement: these are not sections of the document.

**Why not rename the twelve.** It treats the symptom twelve times and does not
stay treated — the next author to write `## Details` collides again — and it
costs real content: those sections say why the artifacts are shaped as they are,
which no generated list can say.

**Why not demote authored headings a level so the outlines nest.** Settled
against yesterday (amendment 2026-08-20-d): the markdown diff is the review
surface, and a renderer that draws `##` as `<h3>` puts the file and the page in
two different documents. That argument binds here unchanged, and it is why the
fix had to be on the portal's own headings, which have no source in the file at
all.

### `E_SRN_VERSION` was an error code emitted at warning severity under a Warnings heading

`/diagnostics` listed three `E_`-prefixed items inside "Warnings". Code, severity
and heading disagreed three ways, and the plugin's reference notes had written
the disagreement down as a known spec divergence.

It was not a divergence. It was a misreading, and the loader was the party in the
wrong. V7 (`srn.md`) reads "Pinned `@N` exists on the filesystem **or in the
version→commit index**" — it asks whether a pin resolves *at all*, and its worked
failure is `money@9` when the index holds only v1. A pin that reads an older
snapshot out of the index resolves perfectly; `evolution.md`'s own example has
`order@1` returning the `c2` snapshot while `order` is at v3, with no diagnostic
attached. **The specification never classed a stale pin as anything.** So no
amendment to V7 was needed and none was made.

What the loader detects is a different, narrower and genuinely useful fact: this
pin resolves and has fallen behind. It is now `W_REF_STALE_PIN`, severity
warning, named in the `W_REF_*` family beside `W_REF_DEPRECATED`, which is the
other "legal, but flagged so migrations converge" reference warning. It is
reported and never failed: an `@N` left behind by a migration is
indistinguishable from a deliberate freeze, and only the author knows which.

`E_SRN_VERSION` keeps its name, keeps error severity, and is emitted by exactly
one module — `lib/history/git.ts`, the only one that can ask git whether a commit
exists. The loader never opens git and was therefore never in a position to raise
V7.

The new code is documented in `srn.md` and in `evolution.md`'s error-class table
before it is emitted, because the diagnostic-inventory suite reads the spec at run
time and fails a code the spec does not publish — which is the mechanism that
would have caught this class of drift had the code been invented rather than
borrowed. The plugin's "spec discrepancies" note now records the settlement
instead of the divergence.

### What this amendment does not settle

Whether the portal's section labels should say "portal section" *visibly*. The
hidden qualifier restores the distinction the accessibility tree had lost and
changes no pixels, which is the smallest honest fix; a visible marker separating
authored prose from derived data is a design question, and a larger one, because
`Realized by`, the metric stats and the vision block sit *above* the prose and
would need the same treatment.

And whether `W_REF_STALE_PIN` should be suppressible per reference — a deliberate
freeze has no way to say so, so it warns forever. An `x-` frontmatter annotation
is the obvious shape and nothing needs it yet.

## Amendment 2026-08-20-f — pre-baseline recomposition of the authoring-kit, executed in place

The authoring-kit product was remodelled from seven components to two, and the
old seven were deleted rather than swapped. Both halves of that sentence are
decisions, and this amendment records them.

### The modelling error, in the owner's words

> From a product-management view the authoring-kit was modelled wrongly on two
> axes at once. GRANULARITY: seven components, roughly one per skill — but a
> skill is a FEATURE, not a component. It cannot ship, version, fail or be
> owned separately from the plugin that carries it; a component is a unit of
> delivery and decision, and the unit of delivery here is the plugin.
> HONESTY: the catalog names the kit as if it were an agnostic authoring tool,
> when the real thing on disk is a CLAUDE CODE PLUGIN
> (`marketplace/plugins/metaframework`: `skills/`, `commands/`, `agents/`,
> `.claude-plugin/`) distributed through a Claude MARKETPLACE
> (`marketplace/`). That is a real, well-known structure and the catalog hides
> it behind invented vocabulary — in a solution whose founding rule is "model
> what exists".

The target shape is two components. `component/plugin` is the deliverable
itself, naming the Claude Code structure plainly: the seven skills are a table
in its prose and their `SKILL.md` files are its artifacts — the way
`schema.json` is a datamodel's artifact — not sub-components; the three
commands and the reviewer agent are prose sections, not entities; portability
to other agent runtimes is aspiration and is not modelled.
`component/reference-bundle` is kept, because it is the one boundary that earns
its place: it distils the specification product, an installed plugin cannot
read `framework/spec/`, and drift between spec and bundle is a real defect
class that has occurred twice in this project's history. A distinct failure
mode is the component test, and the bundle is the only part of the plugin that
passes it.

Six component entities were deleted outright — `solution-design`,
`entity-authoring`, `entity-evolution`, `catalog-validation`,
`architecture-review` (with its `catalog-facts` child) and `commands` — and
every edge and prose link that pointed at them, across actors, journeys,
capabilities, ADRs and requirements, was repointed at `component/plugin` in the
same change, with a version bump on every entity edited.

### Why the swap procedure was deliberately not used

`framework/spec/evolution.md`'s swap-and-deprecate exists to protect reviewed
structure with live referrers: both entities stay live while referrers migrate
one at a time, and the tombstone remains as the address history of something a
consumer once relied on. Nothing in this catalog has ever been approved — the
owner has explicitly kept every entity at `status: review` pending his first
item-by-item pass. Recomposition before that first baseline is unfinished
**authorship**, not evolution; running it through the swap procedure would have
left seven permanent tombstone directories in the one catalog the owner intends
to run his project from, deprecation edges pointing at entities no reader ever
depended on, and a `supersedes` chain recording the revision history of a
draft. Git keeps that memory instead — the seven deleted entities exist in
full in every commit before this one.

### The boundary of the exception

The exception is the pre-baseline state, and it ends at the owner's first
item-by-item confirmation. From the moment an entity in this catalog is
approved, every structural change to it goes through `evolution.md`'s swap
procedure without argument, tombstones included. In-place recomposition is a
decision made once, here, for a catalog that has never been reviewed — not a
habit, and not a precedent for the next time a decomposition looks wrong.

### What this amendment does not settle

Whether the `component-type` enum should grow a value for a distributable
content artifact. `component/plugin` carries `library` and records the strain
in its own prose: the enum fits the mechanics (read, not run) and misses the
distribution half, which `plugin.json`'s version field carries. No other entity
in the three shipped catalogs needs the missing value yet, and an enum widened for
one entity is the kind of change the spec should make for two.

## Amendment 2026-08-20-g — the component-type enum grows three values, and criticality lands without an SLA

The `component-type` enum was seven values; it is now ten. `content`,
`application` and `specification` were appended, every existing value keeps its
meaning, and every type — old and new — gains a written discipline in
`kinds/component.md` v5. An optional `criticality` field (integer 1–4, no
default) lands beside it. `frontmatter.md` moves to v7 for the delegation line;
the loader's zod schema follows both changes exactly.

### Where the comparison came from

The occasion was Atlassian Compass's component model (its official docs,
verified 2026-08-20): fourteen component types, four universal tiers with SLA
expectations and a default of 4, and two dependency edge pairs. The dependency
edges import nothing — `depends-on`/`uses` and containment already exist here.
The types and tiers were each examined against one test, stated up front and
applied uniformly: **would an entity in a shipped catalog carry this today?**
The decision derives from the inventory — 62 components across three catalogs
using all seven existing values — not from Compass's completeness.

### The three admitted types, each carried by recorded strain

- **`content`** — a versioned content artifact (instructions, briefings,
  skills) consumed by being read by a person or a model, shipped into or served
  from a host runtime it does not own. The strain is recorded twice:
  `metaframework/product/authoring-kit/component/plugin` states verbatim that
  "the enum has no value for a distributable content artifact — a versioned
  bundle of instructions installed into someone else's tool" (amendment
  2026-08-20-f left exactly this question open), and brass's `rules-briefing` —
  three markdown documents served over `rules://` — already tags itself
  `content` in an `x-` field.
- **`application`** — a fully-packaged program a user installs and runs as one
  unit: the shipped distribution, not the surfaces or services inside it. The
  evidence is new and uncommitted: `framework/portal/package.json` now ships
  `@bershadsky/metaframework` 0.1.0 with a `bin` entry — an installable npm CLI
  that neither `service` (not independently deployed per surface) nor `ui`
  (names the interaction mode, not the installable unit) describes. Adopted
  with this packaging-centric definition, not Compass's verbatim one.
- **`specification`** — a set of normative documents whose contract surface is
  the text itself, consumed by reference and never executed. Both components of
  the specification product carry `library` with the mismatch in prose;
  `core-contracts` states outright that "there is no value for 'a set of
  normative documents', and inventing an eighth would be E_FM_SCHEMA". Those
  two entities are scoped OUT of this change — the owner will review them item
  by item — but the type lands now so they can adopt it during that review.

A fourth signal — brass and metaframework independently reaching for an
`x-` field naming a component's package or runtime — is evidence the enum
under-described what a component IS, and the new types absorb the packaging
half of what `x-package` was reaching for. `x-runtime` stays an `x-` field:
promotion-engine's prose says the framework has no opinion on runtimes, and
that abstention is deliberate.

### The eleven rejected Compass types, each with its reason

- **capability** — already a solution-level KIND with `realizes` edges,
  deliberately richer than a type tag; re-importing it as a type gives one
  concept two homes.
- **cloud-resource** — infrastructure is owned by environment entities and
  `topology.yaml`; no component in any catalog is a cloud resource.
- **data-pipeline** — the only batch mover (acme billing/reconciliation) is
  honestly a `job`; no pipeline exists.
- **machine-learning-model** — nothing in the three catalogs trains, serves,
  or embeds a model.
- **ui-element** — nested ui components (hud, board-view, catalog-tree)
  already carry `ui`; a finer grain adds a distinction no review question uses.
- **website** — every web surface in the catalogs is an application surface
  already typed `ui`; no standalone site exists.
- **dataset** — data shapes are the datamodel kind and state holders are
  `datastore`; no published dataset exists.
- **dashboard** — the portal console is `ui`; no BI dashboard exists anywhere.
- **data-product** — nothing ships data as a product; adopting it is
  speculation.
- **custom / other** — an escape-hatch value teaches authors to stop deciding;
  this framework's move is nearest-value-plus-strain-in-prose, and the strains
  that recurred just earned real types.
- **service, library, application as Compass defines them** — `service` and
  `library` already exist with our definitions kept; `application` is adopted
  with our packaging-centric definition.

One recorded strain deliberately did NOT become a type: schema-service /
history-service's "service is not the true one" is about co-deployment, not a
missing value. The `service` discipline now tells reviewers to surface that
strain rather than letting a new value paper over it.

### Tiers: adapted, not imported

Compass tiers answer a question our reviewers do ask — which components could
seriously hurt if they failed — and the catalog could not answer it. But
Compass tiers carry SLA semantics and a default of 4, and both
`brass/environment/production` and `metaframework/environment/local` state in
writing that no SLO exists; importing SLA semantics or a default would stamp an
operational promise nobody made onto every entity. So: an OPTIONAL
`criticality: 1 | 2 | 3 | 4` frontmatter field with NO default — absent means
"not assessed", never tier 4. Here a tier means blast radius and review
priority — how badly the solution degrades if this component fails or
regresses — and nothing else. review-solution may rank findings by it and may
flag a criticality-1/2 component that declares no requirement and no metric; it
must never flag a missing SLO, because declaring one is a decision this field
does not make.

### What landed, and what deliberately did not

`kinds/component.md` v5 carries the extended set, the criticality contract, and
a normative per-type discipline section — the seven old values gain disciplines
they previously implied but never stated. `frontmatter.md` v7 updates the
delegation line. The portal loader extends its enum and validates `criticality`
(bad values are `E_FM_SCHEMA`, an existing code — no new diagnostic was minted,
because none of the disciplines demands a loader check that exists today, and a
code emitted but undocumented, or documented but unemitted, is the drift this
project keeps finding). No catalog entity was edited: the plugin,
rules-briefing, portal-console and specification components adopt their new
types during the owner's item-by-item review, not before it. Everything is
additive; nothing that was legal yesterday is illegal today.
