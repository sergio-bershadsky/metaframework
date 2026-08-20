---
name: web-client
kind: component
version: 2
title: Web client
summary: The React SPA served by nginx — routing, lobby, board, HUD and interaction; the human's whole interface.
status: review
owner: sergio-bershadsky
component-type: ui
lifecycle: released
relations:
  uses:
    - /environment/production
    - /environment/local
    - /protocol/lobby-api
    - /protocol/game-transport
  depends-on:
    - /product/play/component/rules
    - /product/play/component/boardgame-io
  implements:
    - /requirement/no-account-play
    - /product/play/requirement/match-survives-refresh
tags:
  - react
  - spa
x-package: "@brass/client"
---

# Web client

A Vite-built React SPA, shipped as an `nginx:1.27-alpine` image with the built
`dist/` and a history fallback so `/play/<matchID>` resolves client-side. It is the
only thing a [player](srn://brass/actor/player) ever touches.

## The shape of the app

There is no router dependency. `App.tsx` is twenty-three lines: one `pushState`
helper, a `popstate` listener, and a single regex — `/play/:matchID` renders the play
page, everything else renders the home page. `BrassClient` wraps boardgame.io's React
client with `SocketIO` transport and `BrassBoard` as the board component, and
`BrassBoard` dispatches on phase — `lobby` renders the lobby, anything else renders
the game view.

That means the SPA has exactly two screens and one branch, and every remaining piece
of complexity is inside the game view.

## Why it compiles the engine

`@brass/rules` is a runtime dependency of the browser bundle, and that is a
deliberate cost. The client imports `enumerateLegalMoves`, `planMoveChoices`, the
board graph, the tile tables and the type surface. It does not use them to *decide*
anything — the server remains the only authority — it uses them to know which
affordances to draw. The board is projected from the same graph the engine plays on,
so the map cannot drift from the rules.

The alternative would have been a `GET /legal-moves` endpoint per interaction. That
was rejected: it turns every hover into a round trip, and it duplicates the type
surface across a wire format that would then need its own versioning.

## Sub-components

- [lobby-ui](srn://brass/product/play/component/web-client/component/lobby-ui) —
  routing, room creation, seat claiming, credential storage, the lobby phase.
- [board-view](srn://brass/product/play/component/web-client/component/board-view) —
  the live flat SVG board.
- [iso-renderer](srn://brass/product/play/component/web-client/component/iso-renderer)
  — the dormant PixiJS isometric renderer, still bundled and never reachable.
- [hud](srn://brass/product/play/component/web-client/component/hud) — score track,
  player strip, markets, action bar, player mat, card faces.
- [action-flow](srn://brass/product/play/component/web-client/component/action-flow) —
  the interaction machinery that narrows a legal-move list into one dispatch.
- [animation](srn://brass/product/play/component/web-client/component/animation) —
  the presentation-only overlay that reconstructs what happened between two states.

Nesting here is composition. All six are *part of* this client and none is reusable
elsewhere except by reference.

## What it promises the player

A join takes a name and nothing else — no account, no email, no confirmation — and
the invite URL is the whole access story. A reload rejoins the same seat, because the
per-match credential is cached in `localStorage` under `brass:creds:<matchID>`. A
*server restart* does not, and that gap is written into
[match-survives-refresh](srn://brass/product/play/requirement/match-survives-refresh)
as an explicit acceptance criterion rather than left implied.

## The undeclared contract

107 `data-testid` attributes across 69 distinct values. Nothing versions them and no
client test asserts their presence, yet
[e2e-harness](srn://brass/product/play/component/e2e-harness) is written entirely
against them. Three have already been removed without the harness being updated. It
is a real interface with no owner, and the `depends-on` edge from the harness is the
only place the catalog can say so.
