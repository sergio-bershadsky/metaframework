---
name: 0001-3d-board-react-three-fiber
kind: adr
version: 2
title: A low-poly 3D board in React-Three-Fiber
summary: The original board was a Three.js scene built from the board graph, with the data-dense UI as a React DOM overlay.
status: approved
owner: sergio-bershadsky
decision-status: superseded
date: "2026-07-17"
deciders:
  - sergio-bershadsky
tags:
  - client
  - rendering
---

## Context

The design spec of 2026-07-14 locked four forks at once, and this was the third
of them. Brass is played on a physical board that people enjoy looking at, and a
web implementation that renders it as a table of city names is a worse product
than the box it copies. The board graph in the `brass-map` skill already carried
`x, y` coordinates for every city, merchant and farm brewery, so a spatial
rendering had its data ready before any code was written.

React-Three-Fiber was the natural expression: a Three.js scene declared as React
components, sharing state with the DOM overlay through ordinary props.

## Decision

The board is a true low-poly 3D scene. Low-poly city meshes sit at each
location's coordinates, links are extruded paths whose material tracks the era,
industry tiles are 3D tokens coloured by owner, and the camera orbits and tilts.
Everything data-dense — hand, player mat, markets, income and VP tracks, action
bar, turn indicator — stays React DOM layered over the canvas.

## Consequences

- The board looked like a board. That was the point and it was achieved.
- Every piece of game information had to be expressed twice: once as geometry
  and once as a DOM element for anyone who needed to read it precisely. "How
  many coal cubes are on that tile" is a hard question to ask a mesh.
- Rendering carried a WebGL dependency into every session, including the
  Playwright browsers, which made e2e slower and screenshot comparison brittle.
- The scene was expensive to keep truthful. A new game concept — a flipped tile,
  a spent barrel, a merchant bonus — needed geometry work before it could be
  seen at all, so the board lagged the engine.
- The overlay/canvas split turned out to be the durable part. When the renderer
  was replaced, the HUD survived unchanged.

## What survives in the tree, and what does not

Nothing of the scene does. No file under `packages/client/src` imports `three`,
`@react-three/fiber` or `@react-three/drei` — the mesh code was deleted rather than
disabled, which is the opposite of what happened to the isometric prototype
([iso-renderer](srn://brass/product/play/component/web-client/component/iso-renderer),
still mounted-capable and still in the bundle).

What survives in `packages/client/package.json` is `three`,
`@react-three/fiber`, `@react-three/drei` and `@types/three`, none of them imported
by anything. They cost nothing at runtime — an unimported package never reaches the
bundle — and they cost an install and a lockfile entry on every CI run and every
image build. They are the residue of this decision, they are the reason the
repository README still describes the client as "React + React-Three-Fiber (low-poly
3D board)", and a reader who trusts either source over the import graph will get the
client wrong.

## Alternatives considered

- **A flat SVG board.** Considered and not taken in the original spec: it was
  judged to undersell the game visually. That judgement was later reversed on
  different grounds — informativeness rather than looks — in
  [0002-flat-svg-board](srn://brass/product/play/adr/0002-flat-svg-board), which
  supersedes this record.
- **A bitmap board image with hotspots.** Cheapest, and it fixes the board's
  layout to an artefact nobody in the project could edit. Rejected.
- **An isometric sprite renderer.** Deferred rather than rejected, and it did
  eventually appear as a PixiJS prototype that is still in the tree and never
  mounted.
