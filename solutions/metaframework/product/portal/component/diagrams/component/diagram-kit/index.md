---
name: diagram-kit
kind: component
version: 2
title: Diagram kit
summary: The shared layout, interaction hooks and client boundary the graph diagrams are built on — one ELK module, one polar module, one highlight hook.
status: review
owner: sergio
component-type: library
lifecycle: released
tags:
  - diagrams
  - layout
---

# Diagram kit

`src/lib/diagrams/{layout,polar,use-graph-highlight,use-expandable,use-polar-transition}.ts`
(1,022 lines) and `src/components/diagrams/{navigable,expand-button,measure-probe}.tsx`
(240). It has no runtime of its own; it runs inside the diagrams that import it,
which is why it declares no environment.

## One ELK module, on purpose

`layout.ts` is the only place elkjs is configured. Both React Flow graphs run
through it "so they come out looking like siblings: same algorithm, same spacing
rhythm, same canvas chrome. A second set of ELK options living next to a
component is how two diagrams in one product start to look like two products."
It also owns `DIAGRAM_SPACING`, `DIAGRAM_CANVAS_VARS`, `DIAGRAM_BACKGROUND`,
`fitCanvasHeight()` and `spreadEdgeLabels()`.

ELK computes **placement only**. Edge routing is left to React Flow, which
already knows where the handles are and re-routes for free while a node is
dragged; routing twice would fight itself the moment the user touched the
canvas.

`MeasureProbe` is the second half of that: ELK needs node sizes before anything
exists in the DOM, so the first pass runs on estimates, and estimates of wrapped
text are wrong often enough that a box came out shorter than its own content and
sliced the last line off. React Flow v12 measures what it renders, so the probe
reports the true sizes back and layout re-runs. It must be a child of
`<ReactFlow>` because `useNodesInitialized` reads the flow store.

## Polar, which is not ELK

`polar.ts` (300 lines) exists because the solution map is not a flow. A state
chart and a relation graph have a direction, and layered is the family that
respects one; "what is around this thing" does not, and its honest shape is a
centre with rings — depth is distance and nothing else is. Positions are stored
as radius and angle and turned into x/y at the last moment, because re-centring
interpolates the two **separately**, and an arc is only expressible if the arc
is what you store. The module is free of React and of the DOM, which is what
makes the geometry testable without a browser — `polar.test.ts`, 227 lines.

`use-polar-transition.ts` drives that motion one frame at a time, as React
state rather than as CSS: React Flow derives every edge from the node positions
in its store, and a CSS transition never reaches the store, so the boxes would
glide while their edges snapped to the final geometry on the first frame. It
costs one render per frame for 650 ms and honours `prefers-reduced-motion`.

## The two hooks

`use-graph-highlight.ts` is adjacency highlighting, shared by both React Flow
diagrams since commit `ee6f939` (2026-08-19 16:19). Hovering a node keeps it,
its edges and the far ends of those edges lit and recedes everything else. The
lit set is also **z-raised to 1000**, because React Flow paints edges beneath
nodes and without that the very edges the reader is tracing vanish behind
unrelated boxes. Focus drives the same state as hover, so the graph is
explorable from the keyboard. The recession opacity is deliberately *not* a
constant here — it lives with the `.dgm-recede` rule in `globals.css`, which is
the only place it can be applied, and a copy on this side would be dead the
moment the two drifted.

`use-expandable.ts` fills the viewport with a `position: fixed` overlay and is
deliberately **not** the platform Fullscreen API: that takes over the whole
display and hides the browser's own chrome, which is the wrong scale for "let me
see this diagram properly". Escape closes it. The decision was taken in commit
`8b3540c` (2026-08-19 15:12) and is not recorded as an ADR — next to "mermaid
always" and "colour is ontology" it reads as an implementation note, and it is
kept here instead.

## The bundle boundary

`navigable.tsx` is the client wrapper that supplies what a server component
cannot pass: the router, so every clickable thing in a diagram lands on that
entity's page, and the artifact block's anchor link. It is also where the two
React Flow canvases are reached through `next/dynamic({ ssr: false })`.

The measured reason is in its docstring. React Flow was a 180 KiB chunk that
every entity page carried — including an actor page that draws no diagram at all
— so every route under `/catalog` shipped byte-identical client JS regardless of
what was on it. `ssr: false` is also required rather than merely convenient:
React Flow measures real DOM nodes, so its server pass produces an empty canvas.
The sequence diagram is exempt and stays a static import, because there is no
weight to defer and server rendering keeps its narration in the HTML.

## What is absent

`layout.ts` and `polar.ts` are tested; the three hooks and the three components
are not — they are client code, and there are no component tests in this
repository.

Nothing here is reusable outside the portal: it imports React Flow types, the
console's tokens and the catalog's kind table, and it is not published.
