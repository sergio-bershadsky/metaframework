---
name: game-transport
kind: protocol
version: 4
title: Game transport
summary: The socket.io conversation on namespace /brass — every move a seat submits and every state the authority broadcasts.
status: review
owner: sergio-bershadsky
style: point-to-point
participants:
  - alias: web-client
    ref: /product/play/component/web-client
    role: seat
  - alias: mcp
    ref: /product/agent-play/component/mcp-server
    role: seat
  - alias: game-server
    ref: /product/play/component/server
    role: authority
relations:
  uses:
    - /environment/production
tags:
  - realtime
  - websocket
---

One socket per seat, one authority, and no peer-to-peer anything. A seat sends
exactly one kind of thing — a [move envelope](srn://brass/datamodel/move-envelope@1)
on the `update` event — and receives exactly one kind of thing back: a whole
[game state](srn://brass/product/play/component/rules/component/engine-core/datamodel/game-state@1),
already filtered for that seat's eyes. Everything else in the game is a
consequence of those two sentences.

## Why `point-to-point` and not `request-response`

A move is a fire-and-forget signal. The client sends `update` with the action, a
`stateID`, the match id and its player id; it does not wait for a reply
correlated to that call. What comes back is a **broadcast** — every connected
seat in the match receives the resulting state, including the sender, and the
sender's own copy arrives by the same path as everyone else's. There is no
per-call response channel, and a rejected move produces *no message at all*: the
server simply does not broadcast, and the client discovers the rejection because
its optimistic local state gets overwritten by the next sync.

That asymmetry is the reason
[0002-authoritative-server](srn://brass/adr/0002-authoritative-server) has to be
a written decision rather than an implementation detail. A client cannot tell
"rejected" from "slow", and the UI is built so it never has to: it only ever
offers moves the engine enumerated, so a rejection is a bug, not a UX state.

## Why it sits at the solution root

The component participants are
[web-client](srn://brass/product/play/component/web-client) and
[server](srn://brass/product/play/component/server) under
[play](srn://brass/product/play), and
[mcp-server](srn://brass/product/agent-play/component/mcp-server) under
[agent-play](srn://brass/product/agent-play). Their common pair prefix is empty,
so the nearest common ancestor is the solution.

It is worth saying out loud what that means: **an LLM plays on the same
transport, with the same credentials mechanism, under the same authority, as a
human**. The MCP server is a boardgame.io `Client` — the identical class the
browser instantiates. Nothing in the server distinguishes them. That is the
whole security argument for
[agent-cannot-cheat](srn://brass/product/agent-play/requirement/agent-cannot-cheat):
the agent is not trusted less than a human, it is trusted *exactly* as little.

## What the wire actually says

The event names are boardgame.io's, and they are shorter than the channel names
in `transport.yaml`, which are chosen to be readable in a diagram:

| Channel here    | socket.io event | Direction        |
| --------------- | --------------- | ---------------- |
| `sync-request`  | `sync`          | client → server  |
| `move-submit`   | `update`        | client → server  |
| `sync-response` | `sync`          | server → client  |
| `state-update`  | `update`        | server → client  |
| `match-data`    | `matchData`     | server → client  |

`sync` and `update` are each used in both directions with different payload
shapes, which is why the channel list splits them. The socket.io **namespace** is
`/brass` — derived from `Game.name`, not configured — and it is multiplexed over
the fixed HTTP path `/socket.io`. That distinction is load-bearing for
deployment: the Traefik ingress must route `/socket.io`, not `/brass`, and
[edge-router](srn://brass/product/play/component/edge-router) does.

There is a fourth framework event, `chat`, wired on the server and used by
nothing here.

## Every broadcast is a full state

boardgame.io can send RFC-6902 patches instead of whole states when `deltaState`
is enabled. It is not enabled, so each `update` carries the entire `BrassG` —
board, markets, deck, every player, and the log — to every seat, on every move.

Two consequences follow, and both show up elsewhere in this catalog:

- The client has to reconstruct *what happened* by diffing consecutive states,
  which is the entire reason
  [animation](srn://brass/product/play/component/web-client/component/animation)
  exists as a component and
  [game-deltas](srn://brass/product/play/component/web-client/component/animation/datamodel/game-deltas@1)
  exists as a datamodel. The framework threw away the information and we rebuild
  it.
- Redaction has to be perfect, because there is no smaller thing to redact. Each
  recipient's copy passes through `playerView`, which replaces every other
  seat's `hand` entries with `hidden-<pid>-<i>` placeholders. Hand *length* and
  deck *count* remain observable; card identities do not.

## Optimistic concurrency, and the one number that enforces it

Every move envelope carries `stateID`. The server's per-match `PQueue`
serialises updates, and a move whose `stateID` no longer matches the current one
is dropped. That is the entire concurrency-control story for this solution — no
locks, no transactions, no version vectors. It works because
[single-writer-match-state](srn://brass/product/play/component/server/requirement/single-writer-match-state)
guarantees exactly one process holds the match, which is in turn why
`server.replicas` must stay 1
([0006-in-memory-match-storage](srn://brass/adr/0006-in-memory-match-storage)).

## Artifacts

`states.json` is the **game lifecycle** — lobby, the two eras, and the turn
machine inside each — as this conversation sees it, not as any one participant
sees it. It is deliberately not the client's interaction machine; that one lives
in
[action-composition](srn://brass/product/play/component/web-client/component/action-flow/protocol/action-composition).
Note one modelling decision in it: scoring and the canal→rail purge are edge
**actions**, not states, because the framework's XState subset has no eventless
transition and a scoring state would need an invented event to leave — and
because that is also what the code does, inside `endEra`.

`workflows/seat-and-start.yaml` covers the in-game lobby phase, which is where
this protocol carries five moves that have nothing to do with Brass.
`workflows/play-a-turn.yaml` is the loop the whole product exists for: one or
two actions, then the commit that ends the turn.

## The Arazzo description

`arazzo.yaml` re-describes this exchange as one seat drives it, in the OpenAPI
Initiative's [Arazzo](https://spec.openapis.org/arazzo/latest.html) format,
grounded in `transport.yaml` — sync and sit-down, then the actions and the
commit that make a turn. This is the one protocol in the catalog whose AsyncAPI
document declares `operations`, so its steps name operations rather than channel
pointers — and every `action` in it is the mirror of the one in
`transport.yaml`, because that document is written from the authority's side and
Arazzo's `action` is the executor's.

An Arazzo Description has a single executor, so it describes one participant's
path and never the whole exchange: `workflows/` stays the authoritative
choreography, and the sequence diagrams on this page derive from it alone. The
file is unvalidated — snapshotted with the entity, served as authored, and
judged by nothing: the framework states no rule about its contents. The portal
reads it to draw a step graph of each workflow, which checks nothing.
