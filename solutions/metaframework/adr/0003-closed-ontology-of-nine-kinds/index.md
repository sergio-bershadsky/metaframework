---
name: 0003-closed-ontology-of-nine-kinds
kind: adr
version: 1
title: The ontology is closed at nine kinds
summary: Solution, product, component, datamodel, protocol, actor, environment, adr and requirement — and extending the set is deferred, not open.
status: review
owner: sergio-bershadsky
decision-status: accepted
date: "2026-08-19"
deciders:
  - sergio
relations:
  uses:
    - /product/specification/component/kind-contracts
tags:
  - ontology
  - founding
---

# The ontology is closed at nine kinds

## Context

A description framework has to decide how many nouns it admits. Too few and
everything is a "component" with a tag, which is a folder structure wearing a
model. Too many and no two authors classify the same thing the same way, the
portal cannot render a kind it has never seen, and the vocabulary becomes the
subject of every review instead of the system being described.

The founding session settled on nine and explicitly deferred extension.

## Decision

The v1 ontology is closed at nine kinds: **solution, product, component**
(nestable) as containers, and **datamodel, protocol, actor, environment, adr,
requirement** as owned entities. Eight of them are also reserved words in the
path grammar — every kind except `solution`, which is the only path-less SRN.

Adding a kind is an additive spec change and is deferred. There is no escape
hatch: an entity kind the framework does not have is not expressible.

## Consequences

- **The kind list and the reserved-word list are the same eight words**, which is
  what makes parsing a pair walk with no lookahead. `RESERVED_KINDS` in
  `framework/portal/src/lib/srn/srn.ts` is that list, and a directory named after
  a kind at the wrong depth fails with `E_SRN_PLACEMENT` before any loader rule
  runs.
- **`ls` of any catalog directory lists bucket names only.** A reader needs no
  vocabulary beyond the eight words to answer "what is in here".
- **There is no `metric` kind**, so every measured number in this catalog lives
  in a requirement's acceptance criteria. The 395 tests, the 1368→1133 KiB first
  load, the 3.6 s→12 ms dev rebuild and the eight-document schema bundle are all
  criteria, not entities. That is a real loss of a natural home, and it is
  absorbed rather than worked around.
- **There is no `capability` or `journey` kind either.** A capability map is
  products and requirements read together; a user journey is a protocol workflow
  or prose on an actor.
- **The enums inside the kinds are closed too**, and each one strains somewhere.
  `component-type` has no value for a set of normative documents, nor for an HTTP
  endpoint inside a monolith — this catalog takes `library` and `service`
  respectively, and says so in prose. The transport `kind` enum has no value for a
  local subprocess exec, which is why no protocol describes
  [git](srn://metaframework/actor/git). The edge vocabulary has no `amends`, so
  the partial supersession between two of this solution's ADRs is carried in
  prose. Recording the mismatch is the framework's own prescribed move; inventing
  an enum value is not available.
- **Adding a kind later is cheap in the spec and expensive in the catalog.** The
  spec change is additive, but the word joins the reserved list, so any existing
  entity already named after it becomes illegal. That is why the set was fixed
  before content was written.

## Alternatives considered

- **An open, tag-based ontology** — one entity type plus a `type:` string.
  Rejected: the portal could not badge, filter, validate, or derive a diagram
  from a kind it has never seen, and the placement grammar would have nothing to
  enforce. Every rule in `structure.md` exists because the kind is known.
- **A larger v1 set** including `capability`, `journey`, `metric`, `team` and
  `service`. Rejected: each one overlaps something already present —
  `capability` with product plus requirement, `journey` with protocol workflow,
  `team` with the `owner` handle, `service` with `component-type: service` — and
  overlapping kinds produce catalogs where the same fact is filed in two places
  by two authors.
- **A user-extensible ontology with per-solution kind definitions.** Rejected as
  a v1 feature and recorded as deferred: it makes every catalog's vocabulary
  local, which defeats the point of one portal reading all of them, and it moves
  validation from a fixed spec into user-authored metadata.
- **Leaving `metric` in.** Considered specifically because this catalog wanted
  it. Rejected: a measurement without a stated acceptance threshold is a number
  nobody can review, and once a threshold is attached, it is a requirement.
