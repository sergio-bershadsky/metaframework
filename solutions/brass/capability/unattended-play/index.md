---
name: unattended-play
kind: capability
version: 1
title: Play a seat with nobody sitting at it
summary: Let a language model hold one seat in a live match — learn this engine, read its own view, and take its turns to the end with no human relaying anything.
status: review
owner: sergio-bershadsky
tags:
  - llm
  - mcp
---

Brass Online can put a seat in the hands of something that is not a person. The
occupant is briefed on the engine it is about to play, is given its own redacted
view of the board and the exact moves available to it, and submits them itself —
no human transcribing a position into a chat window, no human typing a move back
in. From the table's side nothing is different: the seat takes its turns, holds
its cards, and can be beaten.

The two halves are both necessary and neither is obvious. The first is the
briefing: three static documents served over `rules://brass/*` that describe
**this** implementation — the two-action turn with its explicit `confirmTurn`
gate, the auto-resolved resource sourcing, and every place the engine departs
from the printed rules. A generic Brass rulebook would have the model play a
different game and lose. The second is the loop: the occupant is woken by a
notification when the state changes, reads it, reads its moves, plays, and
commits, and it does that itself because
[0002-agent-owns-the-loop](srn://brass/product/agent-play/adr/0002-agent-owns-the-loop)
put the decision on the far side of stdio deliberately.

Rebuild the transport as streamable HTTP, replace MCP with a REST bot API,
replace the model with a search: the sentence holds. What ends it is the solution
deciding to put an opponent *inside* the server, which is a recorded non-goal
([out-of-scope-v1](srn://brass/requirement/out-of-scope-v1)) that
[0007-expose-the-game-over-mcp](srn://brass/adr/0007-expose-the-game-over-mcp)
reopened from the only angle that keeps it a non-goal: the agent plays from
outside, as an ordinary client.

## Boundaries

- **One seat per process, and that is a design position rather than a phase.** A
  `BrassSession` holds exactly one seat; two model opponents at one table means
  two registered MCP servers and two dispatched agents. A scheduler inside the
  adapter would put game logic into a component whose entire claim is that it
  has none.
- **Bounded by the life of one socket.** There is no reconnect: a dropped
  connection does not resume the seat, and `leave_match` disconnects without
  releasing the server-side hold, so a dropped agent leaves a seat nobody can
  take. The capability is real and it is realized with that hole in it —
  [long-running-reconnect](srn://brass/product/agent-play/requirement/long-running-reconnect)
  is a `must` in `draft`, and a match of Brass runs for an hour.
- **Local by gate, not by accident.** The adapter speaks stdio only and declares
  only [local](srn://brass/environment/local). A public endpoint is refused
  until authentication exists
  ([authenticated-remote-transport](srn://brass/product/agent-play/requirement/authenticated-remote-transport)),
  and `BRASS_SERVER_URL` is what lets a locally-launched adapter still join the
  hosted game — the useful half of remote play without the exposed half.
- **Play quality is not inside this capability.** There is no server-side floor
  under a weak model: no evaluation, no ranking, no pruning. A bad agent plays
  badly for an hour, and that outcome is the evidence the project wanted rather
  than a defect in the doing.

## What the occupant is structurally incapable of

Two things, and both are properties of where the capability is realized rather
than of the model's good behaviour.

It cannot see another hand: redaction happens in the engine, before the state
reaches this adapter's transport, so the MCP process receives exactly what a
browser receives
([agent-cannot-cheat](srn://brass/product/agent-play/requirement/agent-cannot-cheat)).
And it cannot invent a move: ids are content-derived and re-matched against a
fresh enumeration, so a stale id is a clean miss rather than a plausible id
resolving to a different move on a board that has moved on
([constrained-move-selection](srn://brass/product/agent-play/requirement/constrained-move-selection)).

The agent is not trusted less than a human. It is trusted exactly as little, and
by the same mechanism.

## Not this

- *Seating* is [table-formation](srn://brass/capability/table-formation), and the
  agent's seat is claimed through the same lobby calls a browser uses. What is
  specific here begins after the seat exists.
- *Being offered legal moves* is
  [legal-move-offering](srn://brass/capability/legal-move-offering). The model
  gets the same enumeration the browser narrows; the ids are a projection of it,
  not a second answer.
- *An AI opponent* is the thing this is not, and the distinction is the whole of
  [agent-play](srn://brass/product/agent-play)'s reason to be a separate product.
  Nothing in [play](srn://brass/product/play) depends on this capability, and
  nothing in the server knows an agent is at the table beyond the `ai` flag the
  sit-down move sets for a badge.
- *Studying how well a model plays* is what the capability is for and is not a
  capability itself. There is no trajectory store — P-MCP-4 does not exist — so
  everything anybody learns from a game currently lives in the host's transcript.
