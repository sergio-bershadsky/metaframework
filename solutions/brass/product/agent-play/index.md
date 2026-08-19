---
name: agent-play
kind: product
version: 1
title: Agent play
summary: An LLM plays a seat — one stdio MCP server plus the agent persona that drives it through a whole game.
status: review
owner: sergio-bershadsky
lifecycle: incubating
primary-actors:
  - /actor/llm-agent
  - /actor/maintainer
relations:
  depends-on:
    - /product/play
  implements:
    - /requirement/legal-move-enforcement
tags:
  - mcp
  - llm
  - incubating
---

# Agent play

A model sits at the table. Not as an AI opponent inside the server — as an ordinary
client that happens to be an LLM, connected through a Model Context Protocol adapter
that holds exactly one seat.

## Why this is a product and not a component of `play`

Four axes, and it diverges on all of them. Its consumer is an LLM host, not a
browser. Its distribution channel is an MCP server registration in a client config
plus `.claude/agents/brass-player.md`, not a `helm upgrade`. Its release cadence is
independent — nothing about the live game changes when a tool description does. And,
decisively, its **stage** is different: `lifecycle: incubating` against `play`'s
`active`.

That last field is the argument. P-MCP-0 and P-MCP-1 have shipped, P-MCP-2
(long-running reconnect) is partial, and P-MCP-3 (streamable HTTP plus auth) and
P-MCP-4 (trajectory store) do not exist. Folding this into `play` would delete the
only place that difference can be stated, and would quietly assert that a phase-1
adapter with no reconnect and no authentication is as finished as the game it
attaches to.

## What it is made of

- [mcp-server](srn://brass/product/agent-play/component/mcp-server) — the stdio MCP
  process. Six tools, four resources, one seat.
- [rules-briefing](srn://brass/product/agent-play/component/mcp-server/component/rules-briefing)
  — the engine-specific rulebook, strategy primer and move guide served over
  `rules://brass/*`, so a model learns *this* engine rather than a generic Brass.

## The dependency, and its direction

`depends-on: /product/play` — reuse by reference across a product boundary. The MCP
server is a client of the game server, imports `@brass/rules` for the enumerator,
and speaks the same lobby REST and socket transport the browser does. It absorbs
none of them: every one of those is an edge on the component page.

Nothing in `play` depends on `agent-play`. Turn that around and the whole design
claim collapses — an AI opponent inside the server was the rejected alternative, and
[out-of-scope-v1](srn://brass/requirement/out-of-scope-v1) records it as a non-goal
that this product reopened deliberately from a different angle.

## What it claims and what it does not

It claims [legal-move-enforcement](srn://brass/requirement/legal-move-enforcement)
at product level, because the whole tool surface is built to make an illegal move
unrepresentable: `make_move` takes an id from a fresh enumeration and nothing else.

It does not yet meet two `must` requirements, and both are written down in `draft`
rather than omitted:
[long-running-reconnect](srn://brass/product/agent-play/requirement/long-running-reconnect)
(a dropped socket does not resume a seat, and `leave_match` never releases the
server-side hold) and
[authenticated-remote-transport](srn://brass/product/agent-play/requirement/authenticated-remote-transport)
(no public endpoint may exist before authentication does — unmet on purpose).
