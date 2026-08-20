---
name: move-envelope
kind: datamodel
version: 1
title: Move envelope
summary: The redux-style action a client puts on the socket update event, carrying the move, the seat's credential and an optimistic-concurrency token.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - transport
  - framework-shape
---

What actually crosses the socket when a player acts. Every move from both
products — a browser click and an agent's `make_move` alike — becomes one of
these, so it is the narrowest point in the whole system and the place
[0002-authoritative-server](srn://brass/adr/0002-authoritative-server) is
enforced.

Like [match-summary](srn://brass/datamodel/match-summary@1), the shape is
boardgame.io's and no code here constructs one by hand: the client's
`moves.build(...)` proxy builds the action, and the transport emits it. It is
modelled because it is the contract two components meet on, and because one of
its fields carries a rule the rest of the catalog keeps referring to.

## `state-id` is the whole optimistic-concurrency story

The client applies a move locally the instant you click, then sends it. The
server compares `state-id` against its own `_stateID` and **refuses the action if
they differ**, which is what makes a stale client's move impossible rather than
merely unlikely. On refusal the client is rolled back to the authoritative state,
and the player sees their optimistic tile disappear.

Together with the framework's per-match promise queue — which serialises every
action for one match through a single worker — this is the mechanism behind
[legal-move-enforcement](srn://brass/requirement/legal-move-enforcement) and the
reason
[single-writer-match-state](srn://brass/product/play/component/server/requirement/single-writer-match-state)
is a hard requirement: the queue is per process, so a second replica would give
one match two writers and the token would stop meaning anything.

The same token is what the MCP session watches. `make_move` records the state id,
dispatches, waits, and reports `ok: false, rejected: true` if it has not advanced
— see
[tool-result](srn://brass/product/agent-play/component/mcp-server/datamodel/tool-result@1).

## `type` and what is actually allowed

`MAKE_MOVE` for the six actions plus the lobby moves; `GAME_EVENT` for phase and
turn events. `UNDO` and `REDO` exist in the framework and are **refused for any
match with more than one player**, so in practice they never occur here.
`playerView` also empties the undo stack it would need.

## Wire form versus this model

On the wire the socket.io event is
`emit('update', action, stateID, matchID, playerID)` — four positional
arguments, of which only the first is the redux action. This model normalises
them into one document, which is how the catalog talks about messages
everywhere else. Nothing is added or removed; only the framing is the catalog's.

`payload.credentials` is the seat secret from
[match-credentials](srn://brass/datamodel/match-credentials@1), sent in full on
every single move.
