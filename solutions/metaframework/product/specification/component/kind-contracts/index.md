---
name: kind-contracts
kind: component
version: 5
title: Kind contracts
summary: One document per ontology kind — twelve files, 9,393 lines, each adding fields, artifacts and rules on top of the core contracts and never overriding them.
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
    - /product/specification/datamodel/journey-document
    - /product/specification/datamodel/topology-document
    - /product/specification/datamodel/config-document
  realizes:
    - /capability/schema-interoperability
tags:
  - spec
  - kinds
---

`framework/spec/kinds/` — twelve documents, 9,393 lines, one per ontology kind.
Versions and line counts measured 2026-08-20:

| Document         | Version | Lines | Adds                                                            |
|------------------|---------|-------|-----------------------------------------------------------------|
| `solution.md`    | 5       | 328   | Sealed universe, `vision`/`scope`/`contacts`, rules C1–C7.      |
| `product.md`     | 5       | 300   | `lifecycle`, `primary-actors`.                                  |
| `component.md`   | 5       | 668   | `component-type`, `lifecycle`, environment declaration.         |
| `datamodel.md`   | 9       | 1,658 | `schema.json`, canonical `$id`/`$ref`, `x-srn`, registry.       |
| `protocol.md`    | 7       | 2,183 | `participants`/`style`, `transport.yaml`, workflows, states.    |
| `actor.md`       | 4       | 446   | `actor-type`, `goals`, protocol participation.                  |
| `environment.md` | 6       | 812   | `environment-type`, `topology.yaml`, `config.yaml`.             |
| `adr.md`         | 3       | 418   | `decision-status`, `date`, `deciders`, the body template.       |
| `requirement.md` | 3       | 493   | `requirement-type`, `priority`, `## Acceptance criteria`.       |
| `capability.md`  | 2       | 584   | Nothing — zero kind fields, deliberately; target of `realizes`. |
| `journey.md`     | 5       | 853   | `actor`, and the ordered unbranched `journey.yaml`.             |
| `metric.md`      | 2       | 650   | `metric-type`, `target`, `window`, `direction`; `measures`.     |

The last three arrived together in decision-record amendment `2026-08-20-a`.
They are 2,087 of these 9,393 lines — a little over a fifth of the
component, written in a day — and two of them, `capability.md` and `metric.md`, are the only documents
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

Seven of the eight formats this product owns are specified here — every one
except
[entity-frontmatter](srn://metaframework/product/specification/datamodel/entity-frontmatter),
which is a core contract — and their weight is why two of these documents are
twice the size of the rest:

- `datamodel.md` §"Entity directory shape" through §"The schema registry" is
  [schema-document](srn://metaframework/product/specification/datamodel/schema-document).
- `protocol.md` §"The workflow mini-spec" is
  [workflow-document](srn://metaframework/product/specification/datamodel/workflow-document);
  §"`states.json` — the conversation state machine" is
  [state-machine-document](srn://metaframework/product/specification/datamodel/state-machine-document);
  §"`transport.yaml`" is
  [transport-document](srn://metaframework/product/specification/datamodel/transport-document).
- `journey.md` §"The journey.yaml mini-spec" is
  [journey-document](srn://metaframework/product/specification/datamodel/journey-document).
- `environment.md` §"`topology.yaml`" is
  [topology-document](srn://metaframework/product/specification/datamodel/topology-document);
  §"`config.yaml` — the configuration surface" is
  [config-document](srn://metaframework/product/specification/datamodel/config-document).

**The gap this page used to record is closed, and not by this page.**
`journey.md`'s mini-spec — its own top-level fields, step schema, `x-` escape
hatch and twelve error codes, the same weight as the workflow mini-spec next to
it — arrived with amendment `2026-08-20-a` and had no datamodel entity to match
[workflow-document](srn://metaframework/product/specification/datamodel/workflow-document).
That was stated here rather than fixed, on the grounds that adding the datamodel
is a decision about what this product exposes and not a correction to a page.
The decision came from
[0015-artifact-dialects](srn://metaframework/adr/0015-artifact-dialects), which
makes every artifact name its dialect by URL and therefore needs an entity
behind each URL: `journey-document` now exists, and so do `topology-document`
and `config-document`, which the same ruling admitted out of `environment.md`
well below the instance bar the first five cleared. The implementations did not
move — `framework/portal/src/lib/journey/journey.ts` is still the only code that
parses a `journey.yaml`, and no code parses the other two.

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
rule — and, since
[0017-transport-asyncapi](srn://metaframework/adr/0017-transport-asyncapi), a
second admitted grammar for three of those six kinds, with its own profile rules
on top of AsyncAPI. Sixteen authored instances, 12 in the mini-spec and 4 in
AsyncAPI (`find solutions -name transport.yaml`, 2026-08-21). Nothing in `framework/portal/src` validates either: the file renders
as generic YAML and `E_PROTO_TRANSPORT_*` is implemented nowhere.
`environment.md`'s `topology.yaml` is in the same position with seven instances.

What both formats now have in `src` is an *identity*, not a reader.
`lib/srn/artifacts.ts` gives each a role row so it can be addressed, and
`lib/catalog/dialects.ts` gives each a dialect row so the `$schema` header
[0015-artifact-dialects](srn://metaframework/adr/0015-artifact-dialects) requires
can be recognised and stripped. The `transport` role has **two** such rows —
[0017-transport-asyncapi](srn://metaframework/adr/0017-transport-asyncapi) admits
an AsyncAPI 3.x document under the same filename for the `kafka`, `websocket` and
`amqp` wires, discriminated by its own `asyncapi:` key and left unstripped, while
`http`, `grpc` and `in-process` keep the mini-spec — so the transport role is
specified twice over and read neither time. No row looks at a single field of the
document beneath it.

That gap is why
[transport-document](srn://metaframework/product/specification/datamodel/transport-document)
is modelled at all, and
[topology-document](srn://metaframework/product/specification/datamodel/topology-document)
records the same gap from the environment side.

## `component-type: library`

Same mismatch as
[core-contracts](srn://metaframework/product/specification/component/core-contracts),
same resolution: `library` is the nearest value for a set of normative documents,
the enum has no better one, and the nuance belongs in prose rather than in an
invented eighth value.
