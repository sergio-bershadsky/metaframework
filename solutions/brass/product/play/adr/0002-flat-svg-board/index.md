---
name: 0002-flat-svg-board
kind: adr
version: 1
title: Replace the 3D board with a flat SVG projection
summary: The live board is a prop-driven SVG projected from the engine's board graph, chosen for informativeness over spectacle.
status: approved
owner: sergio-bershadsky
decision-status: accepted
date: "2026-07-17"
deciders:
  - sergio-bershadsky
relations:
  supersedes:
    - /product/play/adr/0001-3d-board-react-three-fiber
  uses:
    - /product/play/component/web-client/component/board-view
tags:
  - client
  - rendering
---

# Replace the 3D board with a flat SVG projection

## Context

Two things were true after the first playable milestone. The 3D board looked
good and answered questions badly: reading how many cubes sat on a tile, which
merchant would take a sale, or whose links crossed a city took longer from the
scene than it would have from a spreadsheet. And a second renderer — an
isometric PixiJS prototype — had entered the tree as a one-time texture bake,
which meant it could not track live state at all.

The board graph in `@brass/rules` already carries `x, y` for every location and
a `BOARD_EXTENT` of roughly 850 by 910 units. Those coordinates are a native
top-down layout: the projection to a flat plan is a scale and a translate, not a
design exercise.

## Decision

The live board is a **flat, top-down SVG** projected directly from the committed
board graph — `CITIES`, `FARM_BREWERIES`, `MERCHANTS`, `EDGES`, `BOARD_EXTENT` —
and driven by props, so it re-renders on every state change and is always
accurate.

Projection and state derivation live in pure, unit-testable helpers with no
React and no rules mutation; the renderer consumes them. The isometric view stays
in the tree behind a switcher rather than being deleted.

## Consequences

- The board became the primary readout instead of a decoration. Slot occupancy,
  cube counts, link ownership and merchant state are legible at a glance because
  they are text and shape, not geometry.
- Correctness is structural. There is no bake, no cache and no scene graph to
  keep in sync — the SVG *is* a function of state, so it cannot show yesterday's
  board.
- No WebGL on the critical path. The board renders in a Playwright browser as
  ordinary DOM, which is what made the map-first click flow testable at all.
- This decision is what made
  [action-composition](srn://brass/product/play/component/web-client/component/action-flow/protocol/action-composition)
  possible. Clicking a slot or an edge requires addressable elements with stable
  identity; a mesh raycast would have worked, but every legal-target highlight
  would have been a material swap rather than a class.
- Two renderers now exist and only one is mounted.
  [iso-renderer](srn://brass/product/play/component/web-client/component/iso-renderer)
  is dormant code carrying a dependency, and keeping it is a deliberate bet on a
  future art pipeline rather than an oversight.
- The visual ambition of
  [0001-3d-board-react-three-fiber](srn://brass/product/play/adr/0001-3d-board-react-three-fiber)
  was given up. The game looks plainer than the box, and that was accepted.

## Alternatives considered

- **Keep 3D and add a data panel.** The information would have arrived, in a
  second place, duplicating what the board already tried to say. Two truths, one
  of them prettier.
- **Finish the isometric renderer instead.** It is closer to the physical board
  than either alternative and it bakes: a one-time texture cannot show live
  state, so it would have needed a live overlay anyway — which is the flat board
  with extra steps.
- **A static board image with an SVG overlay.** Would have decoupled the art from
  the graph, and thereby allowed them to disagree. The projection-from-graph
  property is what guarantees the two never do.
