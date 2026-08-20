---
name: kind-contracts
kind: component
version: 3
title: Kind contracts
summary: One document per ontology kind — twelve files, 7,323 lines, each adding fields, artifacts and rules on top of the core contracts and never overriding them.
status: review
owner: sergio
component-type: library
lifecycle: released
relations:
  depends-on:
    - ../core-contracts
  exposes:
    - /product/specification/datamodel/schema-document
    - /product/specification/datamodel/workflow-document
    - /product/specification/datamodel/state-machine-document
    - /product/specification/datamodel/transport-document
  realizes:
    - /capability/schema-interoperability
tags:
  - spec
  - kinds
---

`framework/spec/kinds/` — twelve documents, 7,323 lines, one per ontology kind.
Versions and line counts measured 2026-08-20:

| Document         | Version | Lines | Adds                                                         |
| ---------------- | ------- | ----- | ------------------------------------------------------------ |
| `solution.md`    | 5       | 328   | Sealed universe, `vision`/`scope`/`contacts`, rules C1–C7.   |
| `product.md`     | 4       | 286   | `lifecycle`, `primary-actors`.                               |
| `component.md`   | 4       | 526   | `component-type`, `lifecycle`, environment declaration.      |
| `datamodel.md`   | 6       | 1216  | `schema.json`, canonical `$id`/`$ref`, `x-srn`, registry.    |
| `protocol.md`    | 4       | 1242  | `participants`/`style`, `transport.yaml`, workflows, states. |
| `actor.md`       | 4       | 446   | `actor-type`, `goals`, protocol participation.               |
| `environment.md` | 3       | 448   | `environment-type`, `topology.yaml`, `config.yaml`.          |
| `adr.md`         | 3       | 418   | `decision-status`, `date`, `deciders`, the body template.    |
| `requirement.md` | 3       | 493   | `requirement-type`, `priority`, `## Acceptance criteria`.    |
| `capability.md`  | 2       | 584   | Nothing — zero kind fields, deliberately; target of `realizes`. |
| `journey.md`     | 2       | 686   | `actor`, and the ordered unbranched `journey.yaml`.          |
| `metric.md`      | 2       | 650   | `metric-type`, `target`, `window`, `direction`; `measures`.  |

The last three arrived together in decision-record amendment `2026-08-20-a`.
They are 1,920 of these 7,323 lines — a quarter of the component, written in a
day — and two of them, `capability.md` and `metric.md`, are the only documents
anywhere in `framework/spec/` that still carry `status: draft`.

The set is **closed but no longer fixed**, and `index.md` now says so in its own
words: "The set was opened, and it grows by appending. The founding decision
record called the ontology closed at nine kinds; amendment **2026-08-20-a**
reopened it." The eleven kind buckets plus `solution` are the same words as the
reserved-word list in the path grammar, which is why adding a thirteenth kind is
not a documentation change but a grammar change — and why an adoption has to
check first that no entity anywhere in any catalog is already named after the
word.

## The one-way edge to the core

`depends-on: ../core-contracts` is the spec's own precedence rule as a relation.
Every document here opens with the same sentence in different words — adr.md:
"This document adds to the common contract in frontmatter.md; it does not restate
or relax it." frontmatter.md states the obligation from the other side: a kind
document "MUST NOT redefine the fields in this document, relax their
requiredness, or reuse an `x-` prefix for a normative field", and names the one
place authors get it wrong — `status` is never re-specified by a kind, so a kind
needing a second lifecycle introduces a differently named field with its own
enum (`lifecycle` on a product, `decision-status` on an ADR).

The dependency does not run the other way. Nothing in the core knows which kinds
exist beyond the closed enum it declares.

## Where the artifact contracts live

Four of the five formats this product owns are specified here, and their weight
is why two of these documents are twice the size of the rest:

- `datamodel.md` §"Entity directory shape" through §"The schema registry" is
  [schema-document](srn://metaframework/product/specification/datamodel/schema-document).
- `protocol.md` §"The workflow mini-spec" is
  [workflow-document](srn://metaframework/product/specification/datamodel/workflow-document);
  §"`states.json` — the conversation state machine" is
  [state-machine-document](srn://metaframework/product/specification/datamodel/state-machine-document);
  §"`transport.yaml`" is
  [transport-document](srn://metaframework/product/specification/datamodel/transport-document).

**A fifth format is specified here and has no datamodel entity.**
`journey.md` §"The journey.yaml mini-spec" defines a required artifact with its
own top-level fields, step schema, `x-` escape hatch and twelve error codes —
the same weight as the workflow mini-spec next to it — and there is no
`datamodel/journey-document` in this product's bucket to match
[workflow-document](srn://metaframework/product/specification/datamodel/workflow-document).
The gap arrived with amendment `2026-08-20-a` and is stated here rather than
closed, because adding the datamodel is a decision about what this product
exposes and not a correction to this page. The portal parses the format anyway:
`framework/portal/src/lib/journey/journey.ts` is its only implementation.

Eight of the twelve kinds define no sibling artifact at all. `adr.md` says so
outright — "The ADR kind defines no sibling artifacts. An ADR is `index.md`" —
because "an ADR's substance is argument, and argument does not have a
machine-readable form".

## Enforcement is thin here, and thickest in the core

This is the honest asymmetry between the two components. The core contracts are
largely enforced by the portal loader; the kind contracts largely are not. Codes
these twelve documents specify that appear nowhere in `framework/portal/src`
include `E_ADR_SECTIONS` (the ADR's four required headings), `E_REQ_CRITERIA`
(the requirement's `## Acceptance criteria` shape), `E_PROD_ACTOR_TARGET`,
`E_PROTO_PARTICIPANT_KIND`, `E_PROTO_ALIAS_DUP`, `E_ENV_TOPOLOGY_SCHEMA`,
`E_COMP_LIBRARY_ENVIRONMENT`, `W_STRUCT_PROTOCOL_NCA` and
`W_REQ_UNIMPLEMENTED` — roughly fifty in total, concentrated in the protocol,
environment, ADR and requirement documents.

The consequence lands on this solution directly: the ADRs and the requirements in
this catalog are checked by author discipline alone.

## Two documents specify a format no code reads

`transport.yaml` has a complete mini-spec in `protocol.md` — a closed `kind`
enum, six binding blocks, six surface lists, the `spec`/surface-list exclusivity
rule — and thirteen authored instances. Grepping all of `framework/portal/src`
for "transport" returns one comment in `components/code/artifact-block.tsx`, a
line in `lib/ui/kind.ts`, and test fixtures. The file renders as generic YAML;
`E_PROTO_TRANSPORT_*` is implemented nowhere. `environment.md`'s `topology.yaml`
is in the same position with four instances and zero mentions in `src`.

That gap is why
[transport-document](srn://metaframework/product/specification/datamodel/transport-document)
is modelled at all.

## `component-type: library`

Same mismatch as
[core-contracts](srn://metaframework/product/specification/component/core-contracts),
same resolution: `library` is the nearest value for a set of normative documents,
the enum has no better one, and the nuance belongs in prose rather than in an
invented eighth value.
