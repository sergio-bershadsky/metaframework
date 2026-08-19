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
