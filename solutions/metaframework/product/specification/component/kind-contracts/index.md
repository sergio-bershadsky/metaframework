---
name: kind-contracts
kind: component
version: 8
title: Kind contracts
summary: One document per ontology kind — each adding fields, artifacts and rules on top of the core contracts, and never overriding them.
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

`framework/spec/kinds/` — one document per ontology kind. Versions are read from
their own frontmatter:

| Document         | Version | Adds                                                                          |
|------------------|---------|-------------------------------------------------------------------------------|
| `solution.md`    | 5       | Sealed universe, `vision`/`scope`/`contacts`, rules C1–C7.                    |
| `product.md`     | 5       | `lifecycle`, `primary-actors`.                                                |
| `component.md`   | 5       | `component-type`, `lifecycle`, environment declaration.                       |
| `datamodel.md`   | 9       | `schema.json`, canonical `$id`/`$ref`, `x-srn`, registry.                     |
| `protocol.md`    | 9       | `participants`/`style`, `transport.yaml`, workflows, states, `arazzo.yaml`.   |
| `actor.md`       | 5       | `actor-type`, `goals`, protocol and journey participation.                    |
| `environment.md` | 6       | `environment-type`, `topology.yaml`, `config.yaml`.                           |
| `adr.md`         | 4       | `decision-status`, `date`, `deciders`, the body template, dated measurements. |
| `requirement.md` | 3       | `requirement-type`, `priority`, `## Acceptance criteria`.                     |
| `capability.md`  | 2       | Nothing — zero kind fields, deliberately; target of `realizes`.               |
| `journey.md`     | 6       | `actor`, and the ordered unbranched `journey.yaml`.                           |
| `metric.md`      | 2       | `metric-type`, `target`, `window`, `direction`; `measures`.                   |

The last three arrived together in decision-record amendment `2026-08-20-a`.
They are a substantial fraction of the component, written in a day — and two of
them, `capability.md` and `metric.md`, are the only documents anywhere in
`framework/spec/` that still carry `status: draft`.

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

## Enforcement was thin here, and no longer is

This section recorded an asymmetry between the two components — the core
contracts largely enforced by the portal loader, the kind contracts largely not —
and it named nine codes as appearing "nowhere in `framework/portal/src`". All
nine have emitters, and so does every other class any document in
`framework/spec` defines: the debt register in
`framework/portal/src/lib/catalog/diagnostic-coverage.test.ts` is empty. The
register is a ratchet rather than a list, so that claim is the gate's rather than
this page's — it reads the spec's own definition tables at run time and fails on
any documented class with no emitter.

The asymmetry closed in four moves, none of which was a change to these
documents. The kind disciplines under `lib/{adr,requirement,actor,structure}/`
took the ADR, requirement, product and placement rules; `lib/environment/` took
the environment artifacts; `lib/journey/artifacts.ts` took the journey directory
rules; and the protocol-checking modules under `lib/protocol/` took what the
protocol kind had left. Each had named the same missing thing in a different accent — a check
that needs a *second* entity, or a *directory listing*, and so could not live in
the loader's per-entity pass.

What is left is not a kind contract that goes unchecked but three narrower
things, each recorded where it belongs:
`W_PROTO_STATES_EVENT_UNKNOWN` has an emitter whose branch no call site reaches;
the *kind* clause of a journey step's three reference rules needs a resolved
catalog the parser is not handed; and a payload reference resolving to a
legal-but-absent SRN is nobody's. None of the three is a whole class, which is
why none of them can be a register row.

The consequence that landed on this solution has reversed with it: the ADRs and
the requirements in this catalog are no longer checked by author discipline
alone.

## Two documents specified a format no code read

`transport.yaml` has a complete mini-spec in `protocol.md` — a closed `kind`
enum, six binding blocks, six surface lists, the `spec`/surface-list exclusivity
rule — and, since
[0017-transport-asyncapi](srn://metaframework/adr/0017-transport-asyncapi), a
second admitted grammar for three of those six kinds, with its own profile rules
on top of AsyncAPI. Both are now read: `lib/protocol/transport-checks.ts` takes
the branch the loader's dialect ruling names, and every `E_PROTO_TRANSPORT_*`
class has an emitter. `environment.md`'s `topology.yaml` made the same crossing
one release earlier, into `lib/environment/environment.ts`.

What both formats had in `src` before that was an *identity*, not a reader, and
the distinction is worth keeping because it is what made the gap easy to miss.
`lib/srn/artifacts.ts` gives each a role row so it can be addressed, and
`lib/catalog/dialects.ts` gives each a dialect row so the `$schema` header
[0015-artifact-dialects](srn://metaframework/adr/0015-artifact-dialects) requires
can be recognised and stripped. The `transport` role has **two** such rows —
0017 admits an AsyncAPI 3.x document under the same filename for the `kafka`,
`websocket` and `amqp` wires, discriminated by its own `asyncapi:` key and left
unstripped, while `http`, `grpc` and `in-process` keep the mini-spec. A role row
and a dialect row look at no field of the document beneath them, so a format can
be fully addressable, fully header-checked, and entirely unread — which is what
both of these were.

The rows are still identity-only; what changed is that a reader now sits above
them and uses the dialect row's ruling to choose a grammar.
[transport-document](srn://metaframework/product/specification/datamodel/transport-document)
records the crossing from the format's own side, and
[topology-document](srn://metaframework/product/specification/datamodel/topology-document)
records the environment one.

## `component-type: library`

Same mismatch as
[core-contracts](srn://metaframework/product/specification/component/core-contracts),
same resolution: `library` is the nearest value for a set of normative documents,
the enum has no better one, and the nuance belongs in prose rather than in an
invented eighth value.
