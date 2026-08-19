---
kind: spec
name: index
version: 1
status: review
title: Specification overview
summary: Entry point of the metaframework specification — purpose, core principles, document map, and reading order.
---

# Metaframework specification

The metaframework is a file-based framework for describing software solutions in a
reviewable way. A **solution** is a catalog of markdown and JSON/YAML files —
products, components, protocols, data models, actors, environments, ADRs, and
requirements — every entity addressable by a stable **SRN** (Solution Resource
Name), every artifact versioned additively, the whole tree readable by humans, AI
agents, and the portal alike.

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
   and the SRN maps 1:1 to its directory under `solutions/`:

   ```text
   srn://acme/shop/checkout/payment/datamodel/order@1
   →  solutions/acme/shop/checkout/payment/datamodel/order/
   ```

   One reference syntax is used everywhere — frontmatter relations, JSON Schema
   `$id`/`$ref`, workflow YAML, and prose markdown links. See [srn.md](srn.md).

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

| Document                         | Status  | Contents                                                                     |
| -------------------------------- | ------- | ---------------------------------------------------------------------------- |
| [index.md](index.md)             | review  | This overview: purpose, principles, reading order.                           |
| [structure.md](structure.md)     | review  | Directory layout contract: monorepo, nesting, entity directories, placement. |
| [srn.md](srn.md)                 | review  | SRN grammar, parsing, disk resolution, relative references, validation.      |
| [frontmatter.md](frontmatter.md) | review  | Common frontmatter contract for every entity `index.md`.                     |
| [evolution.md](evolution.md)     | review  | Versioning, additive-only rules, swap procedure, git-backed history, status. |
| `kinds/*.md`                     | planned | Per-kind contracts (kind-specific frontmatter fields and sibling artifacts). |
| `portal.md`                      | planned | Portal loader contract: validation pipeline, derived-diagram inputs.         |

The closed v1 ontology (from the decision record) is: **Solution, Product,
Component** (nestable) as containers, and **Protocol, DataModel, Actor,
Environment, ADR, Requirement** as owned entity kinds. Extending the ontology is
deferred; the `kinds/` documents will cover one kind each.

## Reading order

1. [structure.md](structure.md) — where everything lives on disk.
2. [srn.md](srn.md) — how everything is named and referenced.
3. [frontmatter.md](frontmatter.md) — what every entity document declares.
4. [evolution.md](evolution.md) — how anything is allowed to change.
5. `kinds/*.md` (when written) — what each kind adds on top of the common
   contract.

A portal implementer reads all of the above in order. An author adding a single
entity can read structure.md, frontmatter.md, and the relevant kind document,
and treat srn.md as reference material.

## Scope of this spec

- **In scope:** the on-disk contract — layout, naming, identity, frontmatter,
  artifact references, versioning, validation rules the portal build enforces.
- **Out of scope:** portal implementation details (framework, rendering), review
  workflow tooling (review is git-native: files are the review surface), and any
  CLI (there is none in v1; integrity is enforced at portal build/load).
