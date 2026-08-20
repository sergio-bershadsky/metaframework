---
name: long-running-reconnect
kind: requirement
version: 1
title: A dropped agent resumes the same seat mid-game
summary: A socket that drops during a multi-hour match must be re-established into the same seat. Currently unmet — no reconnect path exists.
status: draft
owner: sergio-bershadsky
requirement-type: non-functional
priority: must
relations:
  uses:
    - /environment/production
    - /protocol/lobby-api
tags:
  - resilience
  - mcp
---

A game of Brass runs for an hour or more. Sockets drop over that span — a
suspended laptop, a network change, a host restart — and a browser survives it
because the seat credential is in `localStorage`
([match-survives-refresh](srn://brass/product/play/requirement/match-survives-refresh)).

The agent has no equivalent. Its credential lives in process memory and dies
with the process, so a dropped MCP session is a seat that nobody can re-enter
while the match is still running.

## Acceptance criteria

- **AC-1** A dropped socket is re-established automatically, into the same seat, without a new lobby join.
- **AC-2** The seat credential survives a restart of the MCP process, so a relaunched server resumes rather than starts over.
- **AC-3** `leave_match` releases the seat on the server, so a seat that is genuinely abandoned becomes claimable again.
- **AC-4** A resumed session re-syncs to authoritative state and re-emits the live-state notification, so the agent wakes correctly on its next turn.
- **AC-5** A match with a disconnected agent seat remains playable by the humans in it, or fails visibly rather than silently stalling.

## Why this is unmet

Three concrete gaps, each independent:

- There is **no reconnect path**. The session holds one boardgame.io client; if
  it stops, the tools raise "Not in a match" and the only recovery is a fresh
  `join_match`, which needs a *free* seat.
- The seat is not free, because **`leave_match` never releases it**. It drops the
  socket and clears local state; the framework-level claim from
  [lobby-api](srn://brass/protocol/lobby-api)'s `join-match` stays, and the
  framework's own `leave` route is one of the four this repository never calls.
- Nothing persists. The credential is a field on an in-memory session object.

The consequence is the worst combination: a seat that is occupied, unplayable,
and unreclaimable — and because
[0001-turn-commit-gate](srn://brass/product/play/component/rules/adr/0001-turn-commit-gate)
has no timer, the table waits on it forever.

It is a `must` because a table blocked by an abandoned seat is a broken game,
and it is `draft` because nothing implements it. Phase P-MCP-2 of the MCP plan
names reconnection explicitly.

## Measured where

In [production](srn://brass/environment/production), against a real match over a
real network — the environment where long games and unreliable sockets actually
coincide.

## Out of scope

Reconnecting a *human* seat, which already works through the stored credential
and needs nothing from this requirement.
