---
name: 0002-agent-owns-the-loop
kind: adr
version: 1
title: The agent owns the loop; the server is a thin adapter
summary: The MCP server holds no game logic and drives no decisions — the host's model decides, and this process only reads state and forwards moves.
status: review
owner: sergio-bershadsky
decision-status: accepted
date: "2026-07-17"
deciders:
  - sergio-bershadsky
relations:
  uses:
    - /product/agent-play/component/mcp-server/protocol/mcp-surface
tags:
  - mcp
  - architecture
---

## Context

MCP allows the direction of control to run either way. A server can be passive —
offering tools the host's model calls — or it can drive, using
`sampling/createMessage` to ask the host's model for a decision and then act on
the answer itself. The second shape is genuinely attractive here: a game is a
loop, the server knows when a turn arrives, and it could run the whole match by
asking for one move at a time.

There was also a temptation on the other axis. The MCP process already imports
`@brass/rules`, so it *could* score positions, rank moves, prune obviously bad
options, or run a search. Every one of those would improve play.

## Decision

The server is a **state-in / move-out adapter** and nothing else. It holds one
seat's session, serves that seat's player view and the enumerated legal moves,
forwards the selected move, and emits a notification when the state changes. The
decision loop belongs to the agent on the other side of stdio.

It contains no game logic: no evaluation, no ranking beyond the labels it
renders, no filtering of the legal set, no search.

## Consequences

- Nothing has to be re-implemented. The engine adjudicates, the enumerator
  enumerates, `playerView` redacts, and this process is roughly five hundred
  lines of plumbing over all three.
- Client sampling support stops mattering. A host that cannot sample can still
  play, because it was always going to be the one calling.
- The model's reasoning is entirely visible in the host's transcript. Nothing
  about a move is decided in a process nobody is watching, which matters for a
  project whose stated interest is studying how well a model plays.
- Play quality is the model's, not ours. A weak agent plays weakly and there is
  no server-side floor under it — deliberately, since a hidden heuristic would
  make the resulting trajectories worthless as evidence about the model.
- The instructions string and the three rules resources become the entire
  interface for teaching the loop: connect, read the rules, list, join, and on
  each turn get state, get moves, move, commit. If that text is wrong, the agent
  is wrong, and nothing catches it
  ([briefing-fidelity](srn://brass/product/agent-play/component/mcp-server/component/rules-briefing/requirement/briefing-fidelity)).
- The seat has no autonomy. If the host stops calling, the seat stalls and the
  table waits — there is no fallback to a bot, and the turn-commit gate has no
  timer.
- One seat per process. Holding two would mean two boardgame.io clients and two
  live-state resources on one stdio channel, and the resource URI
  `match://current/state` is singular for that reason.

## Alternatives considered

- **Server-driven via `sampling/createMessage`.** Elegant and the loop would be
  ours to shape. Rejected on uneven host support and on observability: the
  model's turn-by-turn reasoning would live inside this process instead of the
  user's transcript.
- **A hybrid: server pre-filters or ranks the legal set.** Would raise play
  quality immediately and would quietly make the server the player. It also
  breaks the property that the agent sees exactly what the engine allows, which
  is what makes
  [constrained-move-selection](srn://brass/product/agent-play/requirement/constrained-move-selection)
  meaningful.
- **Reuse the bot validator inside the server as a fallback.** Tempting for the
  stalling problem, and it would make every trajectory ambiguous about who
  actually played the game.
