---
name: 0006-custom-sequence-renderer
kind: adr
version: 3
title: Sequence diagrams are hand-rolled SVG, not a graph library
summary: A sequence diagram is a grid, not a free graph, so it is drawn by the portal's own SVG over a pure layout pass rather than by any graph library.
status: review
owner: sergio
decision-status: accepted
date: "2026-08-19"
deciders:
  - sergio
relations:
  uses:
    - /product/portal/component/diagrams/component/sequence-diagram
    - /product/portal/component/protocol-model
tags:
  - portal
  - diagrams
---

## Context

A protocol's `workflows/*.yaml` describes an ordered conversation: participants,
numbered steps between them, and nested `alt`/`opt`/`loop` fragments. React Flow
and elkjs were already in the portal's dependencies and already drawing the
relation graph, so reusing them was the cheap path.

It is also the wrong shape. React Flow positions nodes freely and routes edges
between them; a sequence diagram has no freedom to give it. Lifelines are
columns in author order, steps are rows in execution order, and a fragment is a
box that must enclose exactly the rows inside it. Every degree of freedom a
graph library offers is a constraint this drawing has to fight.

## Decision

The sequence diagram is the portal's own SVG.
`src/components/diagrams/sequence-diagram.tsx` (616 lines when this record was
filed; 649, measured 2026-08-22 by `wc -l`) paints a layout
computed by `layoutWorkflow()` in
[protocol-model](srn://metaframework/product/portal/component/protocol-model),
which is a pure function from a parsed workflow to geometry. The component owns
"nothing but paint and interaction"; no graph library is involved. Commit
`1368318`, which replaced the state chart's custom renderer with mermaid,
restates the split in its own body: "Sequence diagrams keep their custom
renderer deliberately."

## Consequences

- **The geometry is testable without a DOM.** `layoutWorkflow()` lives in
  `lib/protocol/workflow.ts` and is covered by `workflow.test.ts`.
  What is *not* covered is the painting: there is no component test
  in this repository at all.
- **It stays a static import while both React Flow canvases are lazy.**
  `navigable.tsx` defers the graph and the map through `next/dynamic` because
  React Flow is a 180 KiB chunk; the sequence diagram has no weight to defer,
  and keeping it server-rendered is what keeps its ordered-list narration in the
  server HTML — the obligation in
  [every-diagram-has-a-text-equivalent](srn://metaframework/product/portal/requirement/every-diagram-has-a-text-equivalent).
- **Three renderers now coexist for four drawings** — this SVG, React Flow over
  ELK for the two graphs, mermaid for the state chart
  ([0007-mermaid-for-state-charts](srn://metaframework/product/portal/adr/0007-mermaid-for-state-charts)).
  A reader of `src/components/diagrams/` meets three different idioms in one
  directory. Each split has a reason; the cost is real anyway.
- **Every affordance is hand-built or absent.** Fragment nesting, payload chips,
  participant navigation and anchor highlighting are written here; pan, zoom and
  a minimap do not exist. `useExpandable` fills the viewport and that is the
  whole interaction budget.
- **A new workflow construct is a code change in two places** — the parser in
  `workflow.ts` and the paint here — where a library-backed renderer would have
  absorbed part of it.

## Alternatives considered

- **React Flow, reusing what the relation graph already loads.** Rejected on
  shape: it would mean fixing every node's position, suppressing its edge
  routing, and re-implementing fragments as background nodes — fighting the
  library to get a grid it does not model. It would also have put the drawing
  behind a client-only dynamic import, taking the narration out of the server
  HTML.
- **mermaid `sequenceDiagram`.** The obvious candidate, and it is the tool this
  portal chose for state charts. Not adopted here: mermaid's sequence renderer
  produces an opaque SVG with no join back to source lines, and the artifact
  block's diagram↔source anchoring — click a step, light the YAML that authored
  it — is built on knowing which element came from which node. The state chart
  gets that join back only through fragile SVG post-processing, which is exactly
  what this drawing avoids by owning its own paint.
- **No sequence diagram; render the workflow as a numbered list only.** The list
  exists regardless and is the canonical reading. Rejected because the fragment
  nesting and the crossing of lifelines are what a reviewer reads a protocol for,
  and prose carries those poorly.
