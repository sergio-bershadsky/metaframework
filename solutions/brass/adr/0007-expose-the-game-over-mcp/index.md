---
name: 0007-expose-the-game-over-mcp
kind: adr
version: 1
title: Reopen "no AI opponents" from outside, as MCP
summary: Instead of a server-side bot, an external LLM joins as an ordinary party through an MCP server holding one seat.
status: review
owner: sergio-bershadsky
decision-status: accepted
date: "2026-07-17"
deciders:
  - sergio-bershadsky
relations:
  uses:
    - /product/agent-play/component/mcp-server
tags:
  - mcp
  - llm
---

## Context

"AI opponents" was an explicit non-goal of v1, recorded in
[out-of-scope-v1](srn://brass/requirement/out-of-scope-v1). The reasoning was
sound: a competent Brass AI is a research project, and the game is for playing
with friends.

Then two things changed. The bot validator already existed and already played
complete rule-legal games — so *something* could occupy a seat. And a language
model good enough to reason about a board became available on the other side of
a standard protocol. The question stopped being "can we build an AI?" and became
"can we let one in?", which is a much smaller question with a much better answer.

## Decision

We expose the game over the **Model Context Protocol**. A separate process,
[mcp-server](srn://brass/product/agent-play/component/mcp-server), holds exactly
one seat in one match and offers six tools and four resources over stdio. It
contains no game logic: it joins through the lobby, connects a boardgame.io
client for its seat, serves that seat's player view and the enumerated legal
moves, and forwards the move the model selects.

The old non-goal is not withdrawn. There is still no AI *inside* this system.
There is a door.

## Consequences

- The cheating question answers itself. The MCP process is an ordinary client
  under [0002-authoritative-server](srn://brass/adr/0002-authoritative-server),
  so `playerView` strips other hands before they reach it and the engine refuses
  anything illegal. We got
  [agent-cannot-cheat](srn://brass/product/agent-play/requirement/agent-cannot-cheat)
  for free, structurally, rather than by writing a sandbox.
- Fairness stops being a design problem. A server-side bot with access to raw
  `G` would need a deliberate self-blinding layer, and that layer would be the
  most security-critical untested code in the project.
- It is a **second product**, not a feature.
  [agent-play](srn://brass/product/agent-play) has a different consumer (an LLM
  host, not a browser), a different distribution channel (an MCP registration,
  not a deployment), and a different stage — the game is live while the MCP
  surface has neither reconnection nor authentication. Folding it into
  [play](srn://brass/product/play) would have deleted the only field able to say
  that.
- The model must be taught *this* engine, not Brass in general — the two-action
  turn and the `confirmTurn` gate appear in no published rulebook. That is why
  the rules resources exist, and why their fidelity is an open obligation.
- The seat is marked. `sitDown(name, true)` sets `Seat.ai`, and the client shows
  a bot badge, so a human at the table always knows what they are playing
  against. That was a precondition, not an afterthought.
- Two obligations open the moment this door does, and both are recorded as unmet
  `must`s:
  [long-running-reconnect](srn://brass/product/agent-play/requirement/long-running-reconnect)
  and
  [authenticated-remote-transport](srn://brass/product/agent-play/requirement/authenticated-remote-transport).
  The second is the sharper one: a public MCP endpoint is a move-injection
  surface.

## Alternatives considered

- **A server-side bot reusing the bot validator.** The right answer if the goal
  were "fill an empty seat with something". It runs inside the game server with
  raw `G` — every hand visible — and behind no standard boundary, so every
  fairness property would have to be re-established by hand.
- **The MCP server owns the decision loop via sampling.** `sampling/createMessage`
  would let this server drive the game and ask the host's model for each move.
  Elegant, and rejected on support: client sampling coverage is uneven, and the
  failure is silent — a host without it simply cannot play. Keeping the loop in
  the agent means the server stays a thin adapter
  ([0002-agent-owns-the-loop](srn://brass/product/agent-play/adr/0002-agent-owns-the-loop)).
- **A REST API for bots.** Would have meant designing an authorisation model, a
  move vocabulary and a state projection from scratch, then persuading someone to
  implement a client for it. MCP supplies all three conventions and arrives with
  hosts that already speak it.
