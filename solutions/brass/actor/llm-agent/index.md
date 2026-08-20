---
name: llm-agent
kind: actor
version: 1
title: LLM agent
summary: External model runtime that occupies one seat in a match through the MCP server and plays it to completion.
status: review
owner: sergio-bershadsky
actor-type: external-system
goals:
  - Learn this engine's rules before playing, not a generic Brass rulebook.
  - Take one free seat and submit only moves the engine just offered.
  - Play a whole game without a human relaying state or transcribing moves.
relations:
  uses:
    - /product/agent-play/component/mcp-server
tags:
  - llm
  - mcp
---

A model runtime — in practice a Claude Code session driving the `brass-player`
persona — that connects to one
[mcp-server](srn://brass/product/agent-play/component/mcp-server) process over
stdio, takes a seat, and runs the turn loop itself.

## Why `external-system` and not `system`

The model runtime is outside our ownership boundary. We do not describe its
internals, we cannot change its behaviour, and we can only negotiate with it through
a tool schema. What *is* ours is the persona file
`.claude/agents/brass-player.md` and the three `rules://brass/*` resources the MCP
server serves — those are described on the components that own them, not here.

The boundary test also asks whether anything must name this counterpart in a
`uses`, `exposes`, `depends-on` or `implements` edge. Nothing does: the MCP server
is the thing components point at, and the agent only ever appears in the
[mcp-surface](srn://brass/product/agent-play/component/mcp-server/protocol/mcp-surface)
conversation. So an actor is the right shape, and no `external` component is needed.

## One server, one seat

A `BrassSession` holds exactly one seat. Two Claude opponents at one table means two
registered MCP servers and two dispatched agents — the persona file says so
explicitly, and the tool namespace (`mcp__brass__*` versus `mcp__brass-2__*`) is how
the invoker keeps them apart. There is no multi-seat mode and no plan for one; the
alternative would put a scheduler inside a component whose entire design claim is
that it holds no game logic.

## What it is structurally incapable of

Cheating. The agent's process never receives another seat's cards: the engine's
`playerView` replaces them with `hidden-<pid>-<i>` placeholders before the state
leaves the server, so the redaction is the same one a browser gets. And it cannot
invent a move — `make_move` accepts an id from a fresh enumeration and nothing else.
Both are claimed as requirements
([agent-cannot-cheat](srn://brass/product/agent-play/requirement/agent-cannot-cheat),
[constrained-move-selection](srn://brass/product/agent-play/requirement/constrained-move-selection))
rather than left as a property of the current implementation.
