---
kind: spec
name: index
version: 6
status: review
title: Specification overview
summary: Entry point of the metaframework specification — purpose, core principles, the twelve kinds, document map, and reading order.
---

# Metaframework specification

The metaframework is a file-based framework for describing software solutions in a
reviewable way. A **solution** is a catalog of markdown and JSON/YAML files —
products, components, protocols, data models, actors, environments, ADRs,
requirements, capabilities, journeys, and metrics — every entity addressable by
a stable **SRN** (Solution Resource Name), every artifact versioned additively,
the whole tree readable by humans, AI agents, and the portal alike.

This directory (`framework/spec/`) is the normative specification. It is written
in the framework's own format: every document carries the same frontmatter shape
it prescribes for solution entities. The founding design contract is
[`docs/decision-record.md`](../../docs/decision-record.md); on any conflict the
decision record wins until it is amended (amendments are append-only, dated
sections — never rewrites).

## Normative language

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are
to be interpreted as described in RFC 2119. A statement without a keyword is
descriptive, not normative.

Every normative rule in this spec is accompanied by at least one concrete
example. A rule without an example is an incomplete rule and a spec defect.

## Core principles

1. **Filesystem is the database.** All content lives as files in the git
   repository: an entity is a directory holding `index.md` (YAML frontmatter +
   prose) plus sibling YAML/JSON artifacts. There is no database, no hidden
   state; the portal is a read-only renderer over the tree.

   ```bash
   # the whole catalog is queryable with standard tools
   grep -rl "status: deprecated" solutions/
   ```

2. **SRN identity — the name is the path.** Every entity has exactly one SRN,
   and the SRN maps 1:1 to its directory under `solutions/`. Below the solution
   the path is a strict alternation of **kind bucket** and **name**, so an
   entity's kind is stated at every level rather than inferred from depth:

   ```text
   srn://{solution}( /{kind}/{name} )*  [@{version}]

   srn://acme/product/shop/component/checkout/datamodel/cart@1
   →  solutions/acme/product/shop/component/checkout/datamodel/cart/
   ```

   The eleven kind buckets are `product`, `component`, `datamodel`, `protocol`,
   `actor`, `environment`, `adr`, `requirement`, `capability`, `journey`, and
   `metric`; they are reserved words and may never be an entity's name. `ls` of
   any catalog directory therefore lists buckets only, and parsing is a pair
   walk with no lookahead. Which pair may follow which is part of the grammar —
   a `product` pair only at solution level, a `component` pair only under a
   product or component, a `capability` or `journey` pair only at solution
   level — so a misplaced entity is `E_SRN_PLACEMENT` before any loader rule
   runs.

   One reference syntax is used everywhere the framework owns the format —
   frontmatter relations, workflow YAML, and prose markdown links. Because
   bucketed paths are long, references outside the referring entity SHOULD be
   solution-absolute (`/product/shop/datamodel/order-placed@1`) rather than a
   chain of `..`. See [srn.md](srn.md).

   `schema.json` is the one artifact that *spells* references differently: its
   root `$id` and every cross-entity `$ref` are canonical HTTP URLs, so that
   stock JSON Schema validators and code generators can dereference them
   unaided. That is not a second addressing scheme — the URL path after the host
   is the entity's SRN path verbatim, and the schema states the SRN itself in a
   required `x-srn`:

   ```text
   srn://acme/datamodel/money                              # identity   — also written as x-srn
   solutions/acme/datamodel/money/                         # storage
   https://schemas.metaframework.dev/acme/datamodel/money  # dereferenceable projection — $id
   ```

   The host is a stable canonical constant, not configuration: identity must not
   vary between a laptop and production. `SCHEMA_BASE_URL` still says where the
   portal *serves* schemas, and never appears in a file.

   > The SRN is the identity. The schema URL is its dereferenceable projection.
   > The disk path is its storage. All three are mechanically inter-convertible,
   > and none of them is a second addressing scheme.

   That sentence is normative and is stated in full in [srn.md](srn.md); see
   [kinds/datamodel.md](kinds/datamodel.md) for the schema rules it governs.
   **Retired** (amendment 2026-08-19-b, superseded by 2026-08-19-c): the earlier
   convention in which a `schema.json` carried no `$id` and referenced its
   neighbours by relative file path. Such references could not be dereferenced
   outside a clone of this repository, which is the requirement they existed to
   satisfy. **Also retired** (the 2026-08-19-c window, closed by 2026-08-19-d):
   dropping `x-srn`. It is required again, so identity is never left implicit in
   a URL-parsing rule.

3. **Additive-only evolution.** An entity's contract surface is never reduced —
   only extended (with a version bump), or replaced by a new entity that is
   swapped in while the old one is deprecated. History is git-backed: only
   current versions exist on the filesystem; pinned `@version` references
   resolve through a version→commit index built from git history. See
   [evolution.md](evolution.md).

4. **Derived diagrams.** Diagrams (component graphs, protocol sequences, state
   charts, schema inheritance trees) are rendered by the portal from structured
   data — never hand-drawn, hand-authored diagrams being an explicit escape
   hatch only. Consequently every structured format in this spec is chosen to be
   diagram-derivable.

5. **Human + AI readability.** The catalog must make sense with `grep` and a
   text editor alone. Names are kebab-case, references are greppable URIs,
   frontmatter fields are flat and predictable. An AI agent dropped into the
   repository with no tooling must be able to navigate, cite, and modify the
   catalog correctly using only this spec.

## Document map

**Core contracts** — binding on every kind:

| Document                         | Status  | Contents                                                                     |
| -------------------------------- | ------- | ---------------------------------------------------------------------------- |
| [index.md](index.md)             | review  | This overview: purpose, principles, document map, reading order.             |
| [structure.md](structure.md)     | review  | Directory layout contract: monorepo, kind buckets, entity directories.       |
| [srn.md](srn.md)                 | review  | The consolidating principle (SRN / schema URL / disk path), SRN grammar (bucket/name pairs), parsing, disk resolution, relative references, placement, validation. |
| [frontmatter.md](frontmatter.md) | review  | Common frontmatter contract for every entity `index.md`.                     |
| [evolution.md](evolution.md)     | review  | Versioning, additive-only rules, swap procedure, git-backed history, status. |
| `portal.md`                      | planned | Portal loader contract: validation pipeline, derived-diagram inputs.         |

**Kind contracts** — one document per ontology kind, each adding frontmatter
fields, sibling artifacts, and validation rules *on top of* the core contracts,
never overriding them:

| Document                                     | Status | Contents                                                                                        |
| -------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| [kinds/solution.md](kinds/solution.md)       | review | Sealed universe and catalog root; `vision`/`scope`/`contacts`; container rules C1–C7.           |
| [kinds/product.md](kinds/product.md)         | review | The `product/` bucket at solution level; `lifecycle`, `primary-actors`.                         |
| [kinds/component.md](kinds/component.md)     | review | The `component/` bucket under a product or component; `component-type`, `lifecycle`; reuse.     |
| [kinds/datamodel.md](kinds/datamodel.md)     | review | `schema.json` (JSON Schema 2020-12), canonical `$id`/`$ref`, `x-srn`, registry.                 |
| [kinds/protocol.md](kinds/protocol.md)       | review | `participants`/`style`, `transport.yaml`, `workflows/*.yaml`, `states.json`.                    |
| [kinds/actor.md](kinds/actor.md)             | review | Solution-level counterparts; `actor-type`, `goals`, protocol participation.                     |
| [kinds/environment.md](kinds/environment.md) | review | Solution-level deployment targets; `environment-type`, `topology.yaml`, `config.yaml`.          |
| [kinds/adr.md](kinds/adr.md)                 | review | Decision records; `decision-status` vs `status`, `date`, `deciders`, body template.             |
| [kinds/requirement.md](kinds/requirement.md) | review | Obligations; `requirement-type`, `priority`, the `## Acceptance criteria` section.              |
| [kinds/capability.md](kinds/capability.md)   | draft  | Solution-level abilities of the business; the target of `realizes`.                             |
| [kinds/journey.md](kinds/journey.md)         | review | Solution-level actor paths; the ordered, unbranched `journey.yaml` steps.                       |
| [kinds/metric.md](kinds/metric.md)           | draft  | Owner-scoped numbers; `metric-type`, `target`, `window`, `direction`; the source of `measures`. |

## The ontology

**Twelve kinds.** Three are containers — **Solution**, **Product**,
**Component** (the last two nestable, solution always the root) — and nine are
leaves. The leaves divide by *what they are about*:

```text
containers       solution  product  component
solution-level   actor  environment  capability  journey
owner-scoped     datamodel  protocol  adr  requirement  metric
```

A **solution-level** kind describes the solution as a whole and may only be the
first pair after the solution: an actor and an environment sit outside any one
product, a capability is something the business can do rather than something a
component happens to contain, and a journey crosses the solution by definition.
An **owner-scoped** kind hangs under whatever it belongs to, from the solution
down to the deepest component — `metric` exactly as `requirement`.

Every kind except `solution` is also a bucket name in the path grammar, which is
why the reserved word list and the kind list are the same eleven words
([srn.md](srn.md)).

**The set was opened, and it grows by appending.** The founding decision record
called the ontology closed at nine kinds; amendment **2026-08-20-a** reopened it
and adopted `capability`, `journey`, and `metric` after checking that no entity
anywhere in the catalog was named after one of them — an adoption takes a word
out of circulation as a *name* everywhere at once, so the check comes first. The
original eight bucket words keep their order and their meanings; nothing was
re-cut, and no later kind ever displaces an earlier one
([evolution.md](evolution.md)).

## Reading order

1. [structure.md](structure.md) — where everything lives on disk.
2. [srn.md](srn.md) — how everything is named and referenced.
3. [frontmatter.md](frontmatter.md) — what every entity document declares.
4. [evolution.md](evolution.md) — how anything is allowed to change.
5. The kind documents, outermost container first:
   [solution](kinds/solution.md) → [product](kinds/product.md) →
   [component](kinds/component.md), then the solution-level kinds
   [actor](kinds/actor.md), [environment](kinds/environment.md),
   [capability](kinds/capability.md), [journey](kinds/journey.md), then the
   owner-scoped kinds [datamodel](kinds/datamodel.md),
   [protocol](kinds/protocol.md), [adr](kinds/adr.md),
   [requirement](kinds/requirement.md), [metric](kinds/metric.md).

A portal implementer reads all of the above in order. An author adding a single
entity can read structure.md, frontmatter.md, and the relevant kind document,
and treat srn.md as reference material.

Where two documents appear to disagree, the precedence is: the decision record,
then the core contracts, then the kind document. A kind document never relaxes a
core rule; where it looks like it does, that is a spec defect to be reported.

## Scope of this spec

- **In scope:** the on-disk contract — layout, naming, identity, frontmatter,
  artifact references, versioning, validation rules the portal build enforces.
- **Out of scope:** portal implementation details (framework, rendering), review
  workflow tooling (review is git-native: files are the review surface), and any
  CLI (there is none in v1; integrity is enforced at portal build/load).
