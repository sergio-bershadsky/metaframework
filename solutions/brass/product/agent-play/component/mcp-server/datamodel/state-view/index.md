---
name: state-view
kind: datamodel
version: 1
title: State view
summary: The redacted, flattened match document an LLM reads before every decision — its own hand in full, opponents by count only.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - mcp
  - projection
---

# State view

What `get_state` returns. It is a projection of
[game-state](srn://brass/product/play/component/rules/component/engine-core/datamodel/game-state@1)
shaped for a reader that has no memory between calls, cannot run
`levelFromSpace`, and pays for every token it reads. Three transformations turn
one into the other:

1. **Flatten what the model would otherwise have to compute.** `my-turn`,
   `income-level`, `deck-count`, `hand-count`. Each replaces a derivation the
   model would have to get right from primitives, and each is somewhere the
   model could silently get it wrong.
2. **Split by perspective.** `me` carries the full hand and mat; `opponents`
   carry public standing only. The two are different shapes because they are
   different questions.
3. **Drop what is unbounded.** `log` is the last 15 entries; `deck` becomes a
   count.

## The privacy property is structural, not filtered

`opponents` has **no hand field at all**. Not an empty array, not a redacted
list — the property does not exist in the shape. That matters because it means
the guarantee does not depend on this projection being careful: even if it were
careless, the state it is projecting has already had other seats' hands replaced
by placeholders by `playerView` before it reached the MCP process. Two
independent mechanisms, and the requirement
[agent-cannot-cheat](srn://brass/product/agent-play/requirement/agent-cannot-cheat)
holds if either works.

What the model *can* see about an opponent is exactly what a player at the table
sees: cards in hand as a number, money, income level, victory points, spend this
round, links left, and tile count. Their `discard` is public in the game state but
is deliberately not projected here — an omission worth noting, because a strong
player does track discards.

## Deck order

`deck-count` rather than `deck`. The underlying game state ships the deck in
order to every client, so this projection is the only thing standing between an
agent and knowing the future. It is a projection choice, not an enforced
boundary: an MCP session that read the raw state instead would see the order.

## Before the first sync

`get_state` has a second, degenerate return: `{ connected: false, note }` when the
socket has not synced yet. That document is **not** an instance of this model —
it is an explicit early return, and a caller must handle it before assuming this
shape. It is described here rather than folded into the schema as a union branch,
because it carries no game information at all and modelling it as a variant would
suggest the two are alternatives of one thing.

## Why it is a datamodel and not just a serialisation

Because it is the contract the agent persona is written against. The strategy and
move guidance served as MCP resources refer to these field names, so changing
`income-level` back to a track space would silently invalidate prose the model is
reading as instructions. It has a consumer that cannot be recompiled.
