---
name: play
kind: product
version: 2
title: Play
summary: The playable online game — rules engine, authoritative server, and the browser client humans sit down at.
status: review
owner: sergio-bershadsky
lifecycle: active
primary-actors:
  - /actor/player
  - /actor/host
  - /actor/maintainer
relations:
  exposes:
    - /protocol/lobby-api
    - /protocol/game-transport
    - /protocol/legal-move-api
  implements:
    - /requirement/full-two-era-game
    - /requirement/seat-count-2-to-4
    - /requirement/no-account-play
tags:
  - game
  - multiplayer
  - live
---

Everything a human touches: the engine that knows the rules, the server that
adjudicates with it, the browser client that renders a game and narrows it into
clickable moves, and the ingress that puts both behind one hostname.

`lifecycle: active` and `status: review` say different things and both are true. The
product is live at `https://brass.bershadsky.dev` and invested in; this description
of it has been written but not yet signed off.

## Components, and the seams between them

- [rules](srn://brass/product/play/component/rules) — one pure TypeScript package,
  compiled into three different processes. It decomposes into
  [engine-core](srn://brass/product/play/component/rules/component/engine-core) (the
  game itself),
  [move-enumerator](srn://brass/product/play/component/rules/component/move-enumerator)
  (what is legal right now) and
  [bgio-game](srn://brass/product/play/component/rules/component/bgio-game) (the one
  file that knows boardgame.io exists).
- [server](srn://brass/product/play/component/server) — a thin layer over the
  framework, and the only authority on state.
- [web-client](srn://brass/product/play/component/web-client) — a React SPA served
  by nginx, with six sub-components covering the board, the HUD, the interaction
  machine, the lobby, and the animation overlay.
- [edge-router](srn://brass/product/play/component/edge-router) — the ingress that
  makes client and server share an origin.
- [e2e-harness](srn://brass/product/play/component/e2e-harness) — a Playwright job,
  explicitly degraded, that owns the local runtime composition.
- [boardgame-io](srn://brass/product/play/component/boardgame-io) — the framework
  this product does not own, described locally because it supplies four things this
  solution would otherwise have to build.

## The exposed surface, and where it lives

The three protocols above are all at the *solution* root, not in this product's
bucket, because
[mcp-server](srn://brass/product/agent-play/component/mcp-server) is a participant in
all three and it belongs to the other product — so their nearest common ancestor is
the solution. The `exposes` edges are authored here anyway, because they carry the
direction (this product provides them) that the participant list deliberately does
not.

Which means this product's page shows no protocol of its own. That is the accurate
reading of an architecture where the second product speaks every surface the first
one offers.

## Why the rules engine is a component here rather than its own product

`@brass/rules` is `private`, published nowhere, and consumed only inside this
workspace. Its lifecycle is welded to the game: a rule change and a client change
ship in the same image. A product is what is delivered, funded and owned — and
nothing is delivered when `@brass/rules` changes except a new version of this
product. It is a component, and its three parts are sub-components.

## Obligations

Three of the solution-wide requirements are claimed here rather than on any single
component — [full-two-era-game](srn://brass/requirement/full-two-era-game),
[seat-count-2-to-4](srn://brass/requirement/seat-count-2-to-4) and
[no-account-play](srn://brass/requirement/no-account-play) — because no one
component can discharge them. Each needs the engine, the server and the client to
agree. Requirements that a single component *can* discharge are claimed there:
hidden hands on the server, reduced motion on the client, enumerator parity on the
engine.
