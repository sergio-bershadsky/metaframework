---
name: derived-visualization
kind: capability
version: 2
title: See a system drawn, without anybody having drawn it
summary: Turn a written description into pictures computed from it, so that a diagram cannot disagree with the thing it depicts.
status: review
owner: sergio-bershadsky
tags:
  - diagrams
  - derived
---

A reader can look at a described system as a picture — what an entity touches
and what touches it, how a whole solution is arranged around a point of
interest, the order of messages in one conversation, the states a conversation
can be in, the ordered walk one actor takes across the whole thing — without
anyone having drawn any of it, and without the picture being a second artifact
that can go stale.

That last clause is the doing. Drawing a system is not hard and every
organisation already does it; the diagrams are simply wrong by the following
quarter, because a drawing is a copy and a copy drifts. Computing the drawing
from the description removes the copy: between them,
`src/components/diagrams/` and `src/lib/diagrams/` hold no coordinates anybody
typed. There is no diagram source
format in this repository, no `.drawio`, and no mermaid a human wrote.

Rebuild every renderer — the three rendering technologies in use today are
already the result of two reversals
([0006-custom-sequence-renderer](srn://metaframework/product/portal/adr/0006-custom-sequence-renderer),
[0007-mermaid-for-state-charts](srn://metaframework/product/portal/adr/0007-mermaid-for-state-charts))
— and the sentence does not move.

## Boundaries

- **Every drawing must be sayable.** A picture that carries a fact the text does
  not is a fact this catalog cannot review, so the text equivalent is inside the
  capability rather than an accessibility feature bolted to it. The obligation is
  [every-diagram-has-a-text-equivalent](srn://metaframework/product/portal/requirement/every-diagram-has-a-text-equivalent)
  and the reasoning is
  [0010-diagrams-must-be-statable-in-prose](srn://metaframework/product/portal/adr/0010-diagrams-must-be-statable-in-prose).
  The consequence is unusual and worth stating: this capability can be removed
  entirely without the catalog losing a single fact.
- **Derived only.** A hand-authored diagram is an explicit non-goal of the
  framework, not an unimplemented feature. Admitting one would put a drawing in
  the catalog that nothing can check, which is the drift the capability exists to
  remove.
- **Nothing leaves the screen.** There is no export — no SVG download, no PNG, no
  print, no copy-as-text. A picture here is something read in place.
- **Six drawings, not a drawing tool.** Relations at one hop, a solution's
  structure, a workflow, a state machine, a journey's walk — that one since
  decision-record amendment `2026-08-20-a`, drawn by
  `src/components/diagrams/journey-diagram.tsx` over
  `src/lib/journey/mermaid.ts` — and, since
  [0020-arazzo-as-a-sibling-role](srn://metaframework/adr/0020-arazzo-as-a-sibling-role),
  one workflow of an `arazzo.yaml` as a step graph
  ([arazzo-graph](srn://metaframework/product/portal/component/diagrams/component/arazzo-graph)).
  That last one is the only drawing taken from a document this framework does
  not validate, which is why it reports what it did not draw. A composition graph for a datamodel's
  `allOf` DAG is rendered as a lineage list rather than a graph, and an
  environment's `topology.yaml` is drawn by nothing at all — `topology` has zero
  mentions anywhere in `src`.

## The strain: this one lives in a single product

Both realizers —
[diagrams](srn://metaframework/product/portal/component/diagrams) and
[protocol-model](srn://metaframework/product/portal/component/protocol-model) —
sit inside [portal](srn://metaframework/product/portal), which makes the
solution-level address look like ceremony. It is recorded as an honest
single-product capability rather than smoothed over: nothing in
[specification](srn://metaframework/product/specification) draws anything, and
nothing in [authoring-kit](srn://metaframework/product/authoring-kit) does
either. What the spec contributes is the *reason* the formats are drawable at all
— core principle 4, `framework/spec/index.md:113`, requires every structured
format in the spec to be diagram-derivable — but a principle is not a realizer,
and claiming an edge for it would be the "list everything in the neighbourhood"
failure this kind invites.

`protocol-model` carries its own edge rather than hiding under `diagrams`
because it sits outside that subtree: it is the parser and the validator that
turn `workflows/*.yaml` and `states.json` into something drawable — and, now,
`arazzo.yaml` too — so three of the six drawings do not exist without it.

## Not this

- *The console* is not this capability. Chrome, colour tokens and navigation are
  how a reader arrives at a drawing;
  [solution-description](srn://metaframework/capability/solution-description) is
  where reading the description lives.
- *A diagram of the ontology itself* is not drawn anywhere and is not claimed
  here. Every drawing in the portal is of catalog **content**; the twelve kinds
  and their placement rules are prose in
  [specification](srn://metaframework/product/specification).
- *Verified drawings.* Only the geometry is tested — the pure layout modules
  under `src/lib/diagrams/`, plus `narrateWorkflow` and `statesToMermaid` in
  `protocol-model`. `find src -name '*.test.tsx'` returns nothing, so every line
  under `src/components/diagrams/` is verified by looking at it, the journey
  renderer included. That is a fact about how well this capability is realized and belongs on
  this page rather than in its definition.
