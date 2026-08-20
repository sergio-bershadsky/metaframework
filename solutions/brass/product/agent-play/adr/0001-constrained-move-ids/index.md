---
name: 0001-constrained-move-ids
kind: adr
version: 1
title: The model selects a move id; it never composes a move
summary: make_move accepts only an id from a fresh enumeration, so an illegal move is unrepresentable rather than rejected.
status: review
owner: sergio-bershadsky
decision-status: accepted
date: "2026-07-17"
deciders:
  - sergio-bershadsky
relations:
  uses:
    - /product/agent-play/component/mcp-server/datamodel/move-option@1
tags:
  - mcp
  - llm
---

## Context

A language model asked to play a board game will produce plausible-looking moves
that are wrong in ways the game's own vocabulary cannot express: a city it has
no presence in, an industry the slot forbids, a card it does not hold, a
purchase it cannot afford. Every one of those is a valid *sentence* and an
invalid *move*.

The engine would reject all of them — that is what
[0002-authoritative-server](srn://brass/adr/0002-authoritative-server)
guarantees. But a rejection loop is a bad experience for a model: it spends
tokens on invalid attempts, and it learns nothing from a bare refusal, so it
tends to retry variations of the same wrong idea.

## Decision

The tool boundary takes an **id**, not a move. `get_legal_moves` returns one
[move-option](srn://brass/product/agent-play/component/mcp-server/datamodel/move-option@1)
per legal move — a content-derived id, its kind, a human-readable label, and the
raw move for inspection — and `make_move` takes only that id.

The id mirrors the enumerator's own `agnosticKey`: `build|stafford|0|cotton`,
`network|a~b,c~d`, `develop|coal,iron`, `sell|3,7`, or the bare `loan`, `scout`,
`pass`, `confirmTurn`. `make_move` re-enumerates before matching, so an id is
resolved against the board as it is *now*, not as it was when the list was
served.

## Consequences

- An illegal move is not refused; it is **unrepresentable**. There is no
  argument shape in which one could be written, which is a stronger property
  than validation and needs no test to keep true.
- Ids are invariant to which interchangeable card pays, because the enumerator
  collapses card-agnostic duplicates. The model chooses *what to do*, and the
  engine chooses which of several equivalent cards to spend — with the non-wild
  ordering ensuring it never burns a wild unnecessarily.
- Content-derivation makes staleness safe. An id built against an older board
  either still names the same move or names nothing; it can never name a
  *different* move, which a positional index would have done routinely.
- A stale id returns `ok: false` with the current `legalIds`, so the recovery is
  a re-pick rather than a re-think. The error carries the answer.
- The model needs the `label` to reason at all. A raw id is opaque, so the
  option carries a rendered description — "Build cotton L1 in Stafford (slot 0)"
  — and the quality of the agent's play depends on prose the server writes.
- The surface is coarse by construction. A model cannot express "build here with
  *that* coal", because sourcing is not part of the id; the engine's auto-source
  heuristic decides. That is a real capability gap between the agent and a human
  player, and closing it means widening this boundary.

## Alternatives considered

- **Accept a structured move and validate it.** The conventional API design. It
  makes every illegal move a round trip and a rejection message, and it puts the
  burden of learning the move grammar on the model.
- **Accept free-form natural language and parse it.** Adds an interpretation
  layer that can be wrong in a new way — the model says one thing, the parser
  hears another, and the engine accepts it. Strictly worse than either
  alternative.
- **A positional index into the last list.** Shorter ids and a silent
  catastrophe: a board that changed between the list and the call would apply the
  move now sitting at that position. This is the failure mode content-derived ids
  exist to prevent.
