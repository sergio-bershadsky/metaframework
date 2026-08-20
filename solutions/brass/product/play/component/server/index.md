---
name: server
kind: component
version: 2
title: Game server
summary: The authoritative boardgame.io server — lobby REST and socket transport on one port, adjudicating every move.
status: review
owner: sergio-bershadsky
component-type: service
lifecycle: released
relations:
  uses:
    - /environment/production
    - /environment/local
  exposes:
    - /protocol/lobby-api
    - /protocol/game-transport
  depends-on:
    - /product/play/component/rules
    - /product/play/component/boardgame-io
  implements:
    - /requirement/legal-move-enforcement
    - /requirement/hidden-hands
    - /product/play/component/server/requirement/single-writer-match-state
tags:
  - authority
  - node
x-package: "@brass/server"
---

Twenty-six lines of TypeScript. It constructs boardgame.io's `Server` with one game
— `BrassGame` from [rules](srn://brass/product/play/component/rules) — an origin
allowlist, and a port, and calls `run`. That is the entire component, and the
brevity is the point: everything this service is responsible for is either the
engine's or the framework's, and both are described elsewhere.

## What it is nevertheless responsible for

**Being the only authority.** Every move arrives here, is adjudicated by the engine,
and is broadcast as new state. A client's optimistic application of its own move is
provisional and may be reverted. There is no path by which a client's opinion about
legality reaches another client.

**Redacting.** Each recipient's copy of the state passes through the engine's
`playerView`, so no broadcast ever carries another seat's cards. The claim on
[hidden-hands](srn://brass/requirement/hidden-hands) is discharged here at the point
of transmission, using a mechanism owned by
[bgio-game](srn://brass/product/play/component/rules/component/bgio-game).

**Deciding who may speak for a seat.** The framework's per-seat credential, minted
on join and checked on every move, is the whole authentication story. There are no
accounts, no sessions and no tokens beyond it.

## The origin allowlist

`Origins.LOCALHOST`, plus regexes admitting any `localhost` or `127.0.0.1` port, plus
`CLIENT_ORIGIN` when set. The wildcard localhost entries are what let Vite dev,
`vite preview`, Playwright and a second browser profile all connect without
configuration; they are dev conveniences that ship in the production image, which is
acceptable only because an attacker cannot reach a browser's localhost from
elsewhere. `CLIENT_ORIGIN` is set in production even though client and server share
an origin there, because boardgame.io still checks `Origin` on the socket handshake.

## Single writer, and the cost of it

Match state is a `Map` in this process — boardgame.io's `InMemory` storage. Two
consequences follow, and neither is fixable inside this component:

- `server.replicas` must stay `1`, and the Deployment uses `strategy: Recreate`, so
  two pods never overlap. A second replica would shard matches at random and split
  socket clients between worlds.
- Every deploy ends every in-progress game.

Both are stated as one obligation,
[single-writer-match-state](srn://brass/product/play/component/server/requirement/single-writer-match-state),
so that a future change to replica count is visibly a correctness change rather than
a capacity tweak. Moving storage to Postgres — CloudNativePG already runs on the
cluster — is what would lift both, and it is a `should` requirement in `draft`, not
a component in this catalog.

## Ports and probes

`PORT` defaults to 8000 and is 8080 in production. Readiness and liveness both probe
`GET /games`, which is boardgame.io's lobby index and returns `["brass"]` — a real
end-to-end check of the framework's router rather than a synthetic health path.
