---
name: iso-renderer
kind: component
version: 1
title: Isometric renderer
summary: The dormant PixiJS isometric board — bundled into every production build and unreachable from the UI.
status: draft
owner: sergio-bershadsky
component-type: ui
relations:
  uses:
    - /environment/production
    - /environment/local
  depends-on:
    - /product/play/component/rules/component/engine-core
tags:
  - dormant
  - pixi
---

# Isometric renderer

`map/PixiMap.tsx`, `map/iso.ts`, `map/scaffold.ts` and `map/types.ts` — a 2:1
isometric renderer built on PixiJS, scaffolding an integer cell lattice from the
engine's board graph and drawing it with baked sprite art from `assets/`.

## Dormant, and precisely how

`BoardStage` still supports it: given `view === 'iso'` it lazy-mounts `PixiMap` and
keeps it alive thereafter, because the Pixi bake is costly. But `GameView` declares
the view as `const [view] = useState<'flat' | 'iso'>('flat')` — destructured without
a setter. Nothing can change it. The `view-iso` and `view-flat` test ids that used to
drive the toggle are gone from the client, which is why
[e2e-harness](srn://brass/product/play/component/e2e-harness)'s `flat-board.spec.ts`
is one of the specs that can no longer pass.

The import is static, so this component is bundled into every production image and
shipped to every player — several hundred kilobytes of renderer plus its sprite
imports — and is reachable by nothing. That is the honest cost of keeping it, and it
is the reason this page exists rather than the code simply being deleted.

## Why it is kept

It is not abandoned work; it is superseded work whose successor may not be final. The
flat SVG board replaced it because a board projected live from the engine's graph
shows *state* — ownership, levels, era usability — and a baked isometric scene shows
*place*. The decision to prefer information over atmosphere is recorded as an ADR
pair, and `BoardStage`'s surviving two-branch shape is the seam that would be used if
it were reversed.

Note what it renders today: `PixiMap` takes no props. It scaffolds the map from
`CITIES`, `FARM_BREWERIES`, `MERCHANTS`, `EDGES` and `BOARD_EXTENT` and draws a
static scene. It never received game state, so "reviving it" is not a matter of
re-enabling a toggle — it would need the whole state-rendering path
[board-view](srn://brass/product/play/component/web-client/component/board-view) has.

## Incomplete description

`docs/superpowers/plans/2026-07-15-iso-map-editor.md` was not read during the surveys
this catalog was written from. It may hold decisions about this component's intended
future. Treat this page as incomplete until it has been read — which is also why the
status here is `draft` rather than `review`.
