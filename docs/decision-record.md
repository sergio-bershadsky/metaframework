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
