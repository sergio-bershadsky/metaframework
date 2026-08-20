---
name: kind-contracts
kind: component
version: 1
title: Kind contracts
summary: One document per ontology kind — nine files, 5,261 lines, each adding fields, artifacts and rules on top of the core contracts and never overriding them.
status: review
owner: sergio
component-type: library
relations:
  depends-on:
    - ../core-contracts
  exposes:
    - /product/specification/datamodel/schema-document
    - /product/specification/datamodel/workflow-document
    - /product/specification/datamodel/state-machine-document
    - /product/specification/datamodel/transport-document
tags:
  - spec
  - kinds
---

# Kind contracts

`framework/spec/kinds/` — nine documents, 5,261 lines, one per ontology kind:

| Document         | Version | Lines | Adds                                                      |
| ---------------- | ------- | ----- | ---------------------------------------------------------- |
| `solution.md`    | 3       | 324   | Sealed universe, `vision`/`scope`/`contacts`, rules C1–C7. |
| `product.md`     | 2       | 270   | `lifecycle`, `primary-actors`.                             |
| `component.md`   | 2       | 392   | `component-type`, environment declaration, reuse rules.    |
| `datamodel.md`   | 5       | 1220  | `schema.json`, canonical `$id`/`$ref`, `x-srn`, registry.  |
| `protocol.md`    | 3       | 1244  | `participants`/`style`, `transport.yaml`, workflows, states. |
| `actor.md`       | 2       | 447   | `actor-type`, `goals`, protocol participation.             |
| `environment.md` | 2       | 450   | `environment-type`, `topology.yaml`, `config.yaml`.        |
| `adr.md`         | 2       | 418   | `decision-status`, `date`, `deciders`, the body template.  |
| `requirement.md` | 2       | 496   | `requirement-type`, `priority`, `## Acceptance criteria`.  |

The set is **closed**. `index.md`: "Extending the ontology is deferred, so the
nine kind documents above are the complete set." The eight kind buckets plus
`solution` are the same words as the reserved-word list in the path grammar,
which is why adding a tenth kind is not a documentation change but a grammar
change.

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

The remaining five kinds define no sibling artifact at all. `adr.md` says so
outright — "The ADR kind defines no sibling artifacts. An ADR is `index.md`" —
because "an ADR's substance is argument, and argument does not have a
machine-readable form".

## Enforcement is thin here, and thickest in the core

This is the honest asymmetry between the two components. The core contracts are
largely enforced by the portal loader; the kind contracts largely are not. Codes
these nine documents specify that appear nowhere in `framework/portal/src`
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
