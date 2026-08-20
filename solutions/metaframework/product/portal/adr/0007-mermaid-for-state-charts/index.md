---
name: 0007-mermaid-for-state-charts
kind: adr
version: 1
title: State charts render with mermaid, always
summary: The custom React Flow state renderer was replaced outright by mermaid stateDiagram-v2, trading interactivity for layout that does not graze its own labels.
status: review
owner: sergio
decision-status: accepted
date: "2026-08-19"
deciders:
  - sergio
relations:
  uses:
    - /product/portal/component/diagrams/component/state-chart
    - /product/portal/component/protocol-model
tags:
  - portal
  - diagrams
---

## Context

A protocol's `states.json` is an XState v5 machine config, and the portal drew it
with a custom React Flow renderer built on the same ELK layout as the relation
graph. It went through repeated legibility rounds and kept producing the same
defect: labels grazing nodes and each other. The two charts that broke it are
named in the decision record — acme's `promotion-evaluation`, and a brass chart
with roughly thirty edges.

The failure is structural rather than a bug. A state chart's information is
almost entirely in its labels — `EVENT [guard] / action` on every transition,
entry and exit actions inside states, nested composite states — and a
force-and-layer layout tuned for boxes-and-arrows has no budget for text that
long.

This is the only decision in the portal's set that the owner is recorded as
having taken personally: decision-record amendment `2026-08-19-e` says "Decided
by the owner, 2026-08-19", and lists what it gives up.

## Decision

State charts render with mermaid `stateDiagram-v2`, always — there is no React
Flow fallback and no toggle. `statesToMermaid()` in `lib/protocol/mermaid.ts` (241
lines) is a pure function from the parsed chart to diagram text, so every word on
the drawing is decided in a tested function; `parseStates` stays the validator and
the model; `state-chart.tsx` renders that text and post-processes the resulting
SVG for hover and selection.

## Consequences

- **Layout stopped being the portal's problem, and label collisions stopped.**
  mermaid `^11.17.0` is one more dependency, dynamically imported behind a
  module-level singleton and initialised once, so no page pays for it until a
  state chart is on screen.
- **Interactivity became best-effort, by name.** The amendment states it: pan and
  zoom, React Flow's controls, the density toggle and the hover detail panels are
  gone, and "fine-grained interactivity is best-effort, not contractual".
- **Joining the SVG back to the model is the standing cost.** States join by
  mermaid's stable node ids. Transitions have no stable id — mermaid numbers
  edges in statement order but notes share the counter — so the join is *by
  rank*: sort the arrow paths, zip them against the generator's `edgeOrder`, and
  **verify by count before trusting it**. If the SVG disagrees, edge
  interactivity is dropped rather than mis-wired. A mermaid upgrade can silently
  cost the feature; it cannot silently wire the wrong transition.
- **The portal now encodes mermaid's own quirks.** Parallel self-transitions on
  one state must collapse into a single arrow statement with one label per line,
  because mermaid keys loop edges by their shared endpoints and draws only the
  last of N statements — verified against mermaid 11.17. That is a workaround
  living in a pure function, and it is pinned to a renderer version by nothing
  stronger than a comment.
- **Everything the generator decides is assertable.** `mermaid.test.ts` (201
  lines) tests the text, not the picture, which is the half that carries the
  meaning.
- **This narrows the founding renderer choice without reversing it.** The
  decision record's "React Flow primary, mermaid fallback" still governs the
  relation graph and the solution map, and the sequence diagram keeps its own
  SVG ([0006-custom-sequence-renderer](srn://metaframework/product/portal/adr/0006-custom-sequence-renderer)).
  This ADR therefore carries no `supersedes` edge: three of the four drawings are
  untouched, and marking a predecessor superseded would overstate what changed.

## Alternatives considered

- **Keep the custom React Flow renderer and tune it further.** Rejected after
  repeated rounds that still left grazing labels on the two hardest charts. The
  amendment's judgement is that legibility on a thirty-edge machine matters more
  than the interactions being tuned for.
- **Mermaid as a fallback, React Flow when the chart is small enough.** Rejected
  for the reason the amendment's own title carries — *always*. Two renderers mean
  two sets of behaviour for one artifact kind, a threshold nobody can defend, and
  a reader who cannot predict what a page will do.
- **Keep React Flow and shorten the labels.** Rejected because the labels are the
  content: a transition without its guard and actions is not a state machine, it
  is a picture of one.
