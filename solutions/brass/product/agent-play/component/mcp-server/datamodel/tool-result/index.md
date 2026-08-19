---
name: tool-result
kind: datamodel
version: 1
title: Tool result
summary: The success or failure envelope every MCP tool returns, carrying enough context for the model to recover without a human.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - mcp
  - union
---

# Tool result

A tagged union on `ok`. Its design goal is narrow and unusual: **a failure must
leave the model able to continue**. An agent playing a whole match has no human
to relay a stack trace to, so a failure that only says "something went wrong" ends
the game.

## Failures are returned, never thrown

Every tool handler wraps its work and converts a thrown error into a result
document with `isError: true` set on the MCP response — the model receives the
message as readable text instead of the call hard-failing. That is a deliberate
inversion of the usual advice, and it is what makes the agent loop self-healing:
the model re-lists matches, re-reads legal moves, and tries again.

## The three failures worth distinguishing

- **Stale move id.** `make_move` re-enumerates and finds no move with that id.
  The result carries `legal-ids` — the ids that *are* valid right now — so the
  model's next call needs no extra round trip. This is the common case after an
  opponent moves, and it is why an id can be offered and refused without anything
  being wrong.
- **Applied but not accepted.** The move id matched, was dispatched, and the
  authoritative state id did not advance within the wait window. `rejected: true`
  says so. It is genuinely ambiguous — an engine rejection and a still-pending
  update look the same from here — and the message says as much rather than
  guessing.
- **Wrong moment.** Not your turn, game over, not synced yet. Plain `error` text.

Both failure paths return the current `state` where they have one, so the model
can re-orient in the same call it failed on.

## Why `ok` is a boolean tag

The framework's convention is kebab-case string tags. Here the tag is the
boolean `ok`, because that is the shape the tools actually return and the shape
the model has been reading. Recording the real wire form was judged more useful
than a tidier tag: the union is still derivable — the two branches carry distinct
`const` values for the same required property — and the deviation is confined to
the choice of value type.

## The state a success carries

`applied` echoes the id, kind and label of what was played, so the model can
confirm the engine did what it intended rather than inferring it from a diff, and
`state` is a fresh
[state-view](srn://brass/product/agent-play/component/mcp-server/datamodel/state-view@1)
taken **after** the move. Together they mean a successful `make_move` needs no
follow-up `get_state`, which halves the calls in the agent's turn loop.

Note that `state` and `applied` are optional even on success: `join_match` and
`leave_match` return `ok: true` with neither, or with `state` alone.
