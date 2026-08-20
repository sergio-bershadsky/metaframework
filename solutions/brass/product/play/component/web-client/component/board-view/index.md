---
name: board-view
kind: component
version: 2
title: Board view
summary: The live flat SVG board, projected from the engine's board graph rather than drawn as an image.
status: review
owner: sergio-bershadsky
component-type: ui
lifecycle: released
relations:
  uses:
    - /environment/production
    - /environment/local
    - /product/play/component/rules/component/engine-core/datamodel/city@1
    - /product/play/component/rules/component/engine-core/datamodel/edge@1
    - /product/play/component/rules/component/engine-core/datamodel/built-tile@1
  depends-on:
    - /product/play/component/rules/component/engine-core
tags:
  - board
  - svg
---

# Board view

`map/flatBoard.ts` (pure projection helpers), `map/FlatMap.tsx` (the SVG), and
`map/BoardStage.tsx` (which picks a renderer). It is the board a player actually
looks at.

## Projected, not drawn

The viewBox comes from the engine's `BOARD_EXTENT`, and every city, merchant, slot
and edge is placed by translating the engine's own coordinates. `flatBoard.ts`
imports `EDGES`, `CITY_BY_ID`, `edgeUsableInEra`, `slotOccupant`, `INDUSTRY_DATA`,
`tileSpec` and `findEdge` from `@brass/rules`, and contains no React and no mutation.

The consequence is the reason this component is worth its own node: **the map cannot
drift from the rules.** Add a city to the board graph and it appears on screen; change
which era an edge is usable in and the rendering follows. A hand-drawn board image
with hand-placed hit regions would have made every rule change a two-file change with
no compiler to catch the second one.

## What it renders from state

Built tiles with industry and level, coloured by owner. Links coloured by owner and
styled by era. Slot availability and, when the interaction layer supplies a
`highlight`, the exact set of slots or edges that are legal targets right now — it
never computes that set itself, it is handed one.

`onPick` is the other half: the board reports a click as a target and knows nothing
about what happens next. Legality lives in
[action-flow](srn://brass/product/play/component/web-client/component/action-flow),
which is what keeps this component a renderer.

## The era override

The board accepts an `eraOverride` that changes only which links are drawn as usable.
It is display-only — it never reaches a move — and it exists so a player can look at
the other era's network without leaving the current one.
