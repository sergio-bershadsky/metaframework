---
name: mcp-server
kind: component
version: 1
title: MCP server
summary: One stdio MCP process holding exactly one seat in one match — a state-in, move-out adapter with no game logic.
status: review
owner: sergio-bershadsky
component-type: service
relations:
  uses:
    - /environment/local
    - /protocol/lobby-api
    - /protocol/game-transport
    - /protocol/legal-move-api
  exposes:
    - /product/agent-play/component/mcp-server/protocol/mcp-surface
    - /product/agent-play/component/mcp-server/datamodel/state-view@1
  depends-on:
    - /product/play/component/server
    - /product/play/component/rules
    - /product/play/component/boardgame-io
  implements:
    - /product/agent-play/requirement/constrained-move-selection
    - /product/agent-play/requirement/agent-cannot-cheat
tags:
  - mcp
  - adapter
x-package: "@brass/mcp"
---

# MCP server

A Model Context Protocol server over stdio. Underneath the MCP surface it is just
another boardgame.io client: it joins through the lobby REST API, connects a
socket.io client for one seat, and exposes that seat's redacted view plus its exact
legal moves.

```
external LLM  ──MCP(stdio)──▶  this process  ──REST + socket.io──▶  game server
```

## The design claim, and how it is enforced

**No game logic lives here.** Legality is the engine's, adjudication is the server's,
and this process contains neither. What it contains is `BrassSession` — one seat's
connection state — and a translation layer that turns the engine's `LegalMove` objects
into `{ id, kind, label, move }` options and turns a returned id back into a move.

The ids are **content-derived**, e.g. `build|stafford|0|cotton`. That single choice is
what makes an illegal move unrepresentable at the tool boundary: the model cannot
compose a move, it can only name one that was just offered, and an id from a stale
state does not accidentally match a different move — it matches nothing, and
`make_move` returns `ok:false` with the current legal ids so the model can re-read
and pick again.

## Six tools, four resources

`list_matches`, `join_match`, `get_state`, `get_legal_moves`, `make_move`,
`leave_match`. Joining reserves a seat, connects, sits down flagged as an AI seat,
picks a free colour and avatar, and readies up — auto-selecting any of match, seat,
colour or avatar that the caller omitted.

Three static `rules://brass/*` documents teach the model this engine and are owned by
[rules-briefing](srn://brass/product/agent-play/component/mcp-server/component/rules-briefing).
The fourth resource, `match://current/state`, is the live view and is subscribable:
on every transport state change the server emits `sendResourceUpdated`, which is how
an agent learns its turn came round without polling.

## Failures are returned, never thrown

Every tool handler wraps its work and, on error, returns the message with
`isError: true` rather than raising. The reason is behavioural: a hard failure ends
the model's turn with no recoverable information, while a returned error lets it
re-list matches or re-read legal moves and continue. It is the same instinct behind
returning `legalIds` on a rejected move.

Note the transport hazard this component lives with: **stdout is the MCP channel**,
so every diagnostic goes to stderr. A stray `console.log` corrupts the protocol
stream.

## What it does not have

**Reconnect.** A dropped socket does not resume the seat, and `leave_match`
disconnects this session without releasing the server-side seat hold — so a dropped
agent leaves a seat that nobody can take.
[long-running-reconnect](srn://brass/product/agent-play/requirement/long-running-reconnect)
records it as a `must` in `draft`.

**A remote transport.** Only stdio, and only
[local](srn://brass/environment/local). That is not an incomplete rollout — it is a
gate:
[authenticated-remote-transport](srn://brass/product/agent-play/requirement/authenticated-remote-transport)
says no public MCP endpoint may exist before authentication does. `BRASS_SERVER_URL`
still lets a locally-launched adapter join the *hosted* game, which is the useful
half of remote play without the exposed half.
