---
name: lobby-api
kind: protocol
version: 1
title: Lobby API
summary: HTTP/JSON lobby served by boardgame.io — create a match, list the open ones, read one, and claim a seat.
status: review
owner: sergio-bershadsky
style: request-response
participants:
  - alias: host
    ref: /actor/host
    role: initiator
  - alias: player
    ref: /actor/player
  - alias: lobby-ui
    ref: /product/play/component/web-client/component/lobby-ui
    role: client
  - alias: mcp
    ref: /product/agent-play/component/mcp-server
    role: client
  - alias: game-server
    ref: /product/play/component/server
    role: responder
relations:
  uses:
    - /environment/production
tags:
  - lobby
  - http
---

Everything that happens before a socket exists. Two calls — `create-match` and
`join-match` — are the whole entry path into a game, and the second of them is
the only moment in this solution where a caller receives a secret. After that,
the conversation moves to
[game-transport](srn://brass/protocol/game-transport) and never comes back
except to re-read a match's metadata.

## Why this sits at the solution root

The component participants are
[lobby-ui](srn://brass/product/play/component/web-client/component/lobby-ui),
under [play](srn://brass/product/play), and
[mcp-server](srn://brass/product/agent-play/component/mcp-server), under
[agent-play](srn://brass/product/agent-play). Taken pair by pair their common
prefix is empty, so the nearest common ancestor is the solution itself.

That is not a filing accident, it is the shape of the architecture: the seat a
human takes from a browser and the seat an LLM takes from a subprocess are
claimed through **the same four HTTP calls, in the same order, against the same
handler**. Nothing in the lobby knows which kind of client is on the other end,
and `join_match` in the MCP server is a re-implementation of what
`Home.tsx`/`PlayPage.tsx` do — deliberately, so that the agent path cannot drift
into a privileged one.

## We wrote none of it

Every operation in `transport.yaml` is boardgame.io's, mounted by
`Server({ games: [BrassGame] })` in a 26-line `packages/server/src/index.ts`.
That is the point of
[0001-boardgame-io-framework](srn://brass/adr/0001-boardgame-io-framework): the
lobby is a solved problem and we bought it. The consequence recorded here is
that the surface is **wider than what we use**. `leave-match`, `play-again`,
`rename-player` and `update-player` are live routes that no code in this
repository calls, and they are reachable by anyone who can reach the host. They
are enumerated in the transport surface list precisely so that "unused" is a
stated fact rather than an assumption.

## There is no API secret

`auth` is a single entry, `origin-allowlist`, and it is the truth: the server
allows `Origins.LOCALHOST`, any `localhost`/`127.0.0.1` port, and — in
production — the one origin named by `CLIENT_ORIGIN`. Nothing else gates a
request. An origin check is a browser-side courtesy; `curl` ignores it, and the
deploy runbook's own smoke test (`curl -s https://brass.bershadsky.dev/games`)
proves it.

What the lobby *does* protect is **impersonation of an existing seat**.
`join-match` returns a per-seat credential string, and every subsequent move on
the socket carries it. So the real access-control statement for this solution is
"anyone may take a *free* seat; nobody may play someone else's", and
[hidden-hands](srn://brass/requirement/hidden-hands) is what keeps the second
half meaningful.

## Seats are claimed twice

The step that surprises every reader: claiming a seat happens **twice**, at two
different layers, and both are required.

1. `POST /games/brass/{id}/join` reserves the seat at the *framework* level and
   mints credentials. boardgame.io now considers that player slot occupied.
2. The `sit-down` move on
   [game-transport](srn://brass/protocol/game-transport) marks the seat occupied
   at the *game* level, in `G.seats[playerID]`.

They are not redundant, because the game's own lobby phase — colour, avatar,
ready, host-start — lives inside game state rather than in the framework's
match metadata. See
[0005-lobby-inside-game-state](srn://brass/adr/0005-lobby-inside-game-state) for
why, and note the cost: a client that completes step 1 and dies before step 2
holds a framework seat that the game never shows as joined, and nothing reaps
it.

## Credentials and the known collision

The credential a browser receives is written to
`localStorage['brass:creds:<matchID>']` as a
[match-credentials](srn://brass/datamodel/match-credentials@1) document. The key
is the match id **and nothing else**, so two tabs of the same browser profile
opening the same invite link share one entry: the second tab loads the first
tab's seat and silently plays as that player. It is the single most likely way
a real game goes wrong, and it is a property of this protocol's client side, not
of the server.

## Artifacts

`transport.yaml` enumerates the nine real routes of boardgame.io 0.50.2 under
the `/games` prefix — there is no OpenAPI document, so that list is
authoritative rather than a copy of one, and the two `message` bindings point at
[match-summary](srn://brass/datamodel/match-summary@1) and
[match-credentials](srn://brass/datamodel/match-credentials@1).
`workflows/create-and-seat.yaml` is the human path from "create session room" to
an invite link that seats a guest; `workflows/agent-joins.yaml` is the same
ground covered by an LLM with no browser and no link. Reading them side by side
is the fastest way to see how little the two differ.
