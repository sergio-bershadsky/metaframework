---
name: specification
kind: product
version: 1
title: Specification
summary: The normative contract under framework/spec — 14 documents, 7,279 lines, that the portal implements and the authoring kit distils.
status: review
owner: sergio
lifecycle: incubating
primary-actors:
  - /actor/catalog-author
  - /actor/ai-author
relations:
  exposes:
    - datamodel/entity-frontmatter
    - datamodel/schema-document
    - datamodel/workflow-document
    - datamodel/state-machine-document
    - datamodel/transport-document
  implements:
    - requirement/every-rule-has-an-example
tags:
  - spec
  - contract
---

`framework/spec/` is the normative statement of what a catalog is: 14 markdown
documents, 7,279 lines, written in the framework's own format — each one carries
the frontmatter shape it prescribes for solution entities. Five are core
contracts binding on every kind; nine are kind contracts, one per ontology kind.

It is modelled as a product rather than as a paragraph in this solution's
`index.md` for one reason, and the reason is structural rather than stylistic: a
solution's `index.md` cannot be the target of a relation edge. Demote the spec to
prose and the two most load-bearing statements in this catalog become
unstateable — that
[portal](srn://metaframework/product/portal) implements it, and that
[authoring-kit](srn://metaframework/product/authoring-kit) distils it. Both are
facts with evidence: twelve source files under `framework/portal/src` cite
`framework/spec` by path, and commit 6a1b1f1 is titled "SRN parser, resolver and
disk mapping with **spec-derived** tests"; every file in
`marketplace/plugins/metaframework/skills/_shared/references/` opens by naming
the spec document it distils and conceding that "when `framework/spec/` is
present in the repository, it is authoritative and wins over this file".

## Components

Two, and the seam between them is a precedence rule the spec states about itself:

- [core-contracts](srn://metaframework/product/specification/component/core-contracts)
  — `index.md`, `structure.md`, `srn.md`, `frontmatter.md`, `evolution.md`.
  2,018 lines. Binding on every kind.
- [kind-contracts](srn://metaframework/product/specification/component/kind-contracts)
  — `kinds/*.md`, nine documents, 5,261 lines. Each adds fields, artifacts and
  rules *on top of* the core, never overriding them.

`index.md` fixes the direction: "Where two documents appear to disagree, the
precedence is: the decision record, then the core contracts, then the kind
document. A kind document never relaxes a core rule; where it looks like it does,
that is a spec defect to be reported." That is a `depends-on` edge between two
real things, not a table of contents — which is the objection this decomposition
had to survive.

## The five formats it owns

The datamodels in this product's bucket are the hand-authored file formats the
spec defines normatively:
[entity-frontmatter](srn://metaframework/product/specification/datamodel/entity-frontmatter),
[schema-document](srn://metaframework/product/specification/datamodel/schema-document),
[workflow-document](srn://metaframework/product/specification/datamodel/workflow-document),
[state-machine-document](srn://metaframework/product/specification/datamodel/state-machine-document)
and
[transport-document](srn://metaframework/product/specification/datamodel/transport-document).

They live here and not under the portal because **owner scope is a statement of
responsibility**. The spec decides what a `schema.json` or a `workflows/*.yaml`
must be; the portal is one implementation of that judgement and the plugin's
reference bundle is one distillation of it. Filing them under the parser would
tell a reader that the parser owns the contract, which is backwards — and it
would leave `transport.yaml` homeless, because that format has 13 authored
instances in this repository and no portal code at all.

The threshold applied was: normatively specified, hand-authored, and at least
eight instances on disk. In, with counts measured 2026-08-19 across
`solutions/acme` and `solutions/brass` before this solution was written:
frontmatter (197), `schema.json` (61), `workflows/*.yaml` (22), `transport.yaml`
(13), `states.json` (8). Out: `topology.yaml` (4), `config.yaml` (3),
`openapi.yaml` (2), `examples/` (3) — below the threshold, and the spec's own v1
intent is to treat a linked spec as an opaque attachment.

## What this product is not

**It is not in the catalog it specifies.** Every spec document carries
`kind: spec`, which is not one of the nine ontology kinds, and lives under
`framework/spec/` rather than `solutions/`. The loader reads `solutions/` and
`.git/` only, so no diagnostic ever fires on the specification — the contract
holds itself to no mechanical check.

**Not one of its 14 documents is approved.** All carry `status: review`, at
versions between 2 and 5. The thing that actually wins on conflict is
`docs/decision-record.md`, which `index.md` names in its opening paragraph. This
product is `lifecycle: incubating` for exactly that reason: it is in use and
load-bearing, and its contracts are still moving — five amendments and two spec
passes inside a single day.

**`portal.md` does not exist.** The document map lists it with status `planned`,
the only planned row in the table, covering "portal loader contract: validation
pipeline, derived-diagram inputs". It has no component here, because modelling it
would be modelling an intention.

## Two defects in its own versioning, both greppable

The spec asks every entity to bump `version` on every content change
(`evolution.md`), and does not consistently do so itself:

- **Skipped numbers.** Commit 5b8a3e8 bumped `index.md` 3→5, `srn.md` 3→5,
  `evolution.md` 2→4 and `frontmatter.md` 2→4 in one commit — two increments for
  amendments *d* and *e*. `index.md@4`, `srn.md@4`, `evolution.md@3` and
  `frontmatter.md@3` therefore exist in no commit, and a version→commit index
  cannot resolve them.
- **Substantive edits without a bump.** Commit bae08e4 changed 132 lines of
  `srn.md` and left `version: 1`; commit 4aa3f68 changed `frontmatter.md` (71
  lines) and `structure.md` (45 lines) and left both at `version: 1`. In the same
  commit `kinds/datamodel.md` and `kinds/protocol.md` were *born* at `version: 2`,
  so no v1 of either was ever committed.

Recorded here rather than fixed, because the history is what it is and this
catalog describes what exists.

## Where the ontology strains

`component-type` has no honest value for "a set of normative documents". Both
components take `library` — the nearest fit, since they are consumed by reference
and expose no runtime interface — and this paragraph is the mismatch, rather than
an invented eighth enum value. That is what
[kinds/component.md](srn://metaframework/product/specification/component/kind-contracts)
itself prescribes for an enum that does not fit.
