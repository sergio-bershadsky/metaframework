---
name: constrained-move-selection
kind: requirement
version: 1
title: An agent can only submit a move it was just offered
summary: make_move accepts an id from a fresh enumeration and nothing else, so an illegal move has no representation at the tool boundary.
status: review
owner: sergio-bershadsky
requirement-type: functional
priority: must
relations:
  uses:
    - /product/agent-play/component/mcp-server/protocol/mcp-surface
    - /product/agent-play/component/mcp-server/datamodel/move-option@1
tags:
  - mcp
  - integrity
---

# An agent can only submit a move it was just offered

The engine would refuse an illegal move from any client
([legal-move-enforcement](srn://brass/requirement/legal-move-enforcement)). This
requirement is a stronger and different claim about the agent boundary
specifically: an illegal move must be **unrepresentable**, not merely rejected.

The reason is that a rejection loop is a bad shape for a language model. It
spends tokens on attempts that were never going to work, and a bare refusal
teaches it nothing, so it tends to retry variations of the same wrong idea. A
boundary that admits only valid values removes the loop instead of handling it.

## Acceptance criteria

- **AC-1** The `make_move` tool takes a single move id and no other move-bearing argument; there is no shape in which a move could be described directly.
- **AC-2** `make_move` re-enumerates the legal set before matching, so the id is resolved against the board as it is now, not as it was when the list was served.
- **AC-3** An id absent from that fresh enumeration applies nothing and returns `ok: false` carrying the current `legalIds`.
- **AC-4** Move ids are content-derived, so an id built against an older state either names the same move or names nothing — never a different move.
- **AC-5** While a turn commit is owed, the enumeration contains exactly one option, so the agent cannot skip the commit gate even without knowing the rule.
- **AC-6** Every failure is returned as content with `isError` set, never thrown, so the model can recover inside the same conversation.

## Rationale

AC-4 is the criterion that rules out the obvious cheaper design. A positional
index into the last list is shorter and catastrophic: a board that changed
between the list and the call would apply whatever move now sits at that
position, which is a silently wrong move rather than a refused one.

AC-5 shows what the constraint buys beyond safety. The turn-commit gate is a
deviation from the printed game that no model can be assumed to know
([0001-turn-commit-gate](srn://brass/product/play/component/rules/adr/0001-turn-commit-gate)),
and because the enumeration enforces it, the agent obeys a rule it was never
taught.

## Out of scope

Resource sourcing. A move id says what to do, not which coal to spend, so the
engine's auto-source heuristic decides for the agent where a human would be
asked. That is a genuine capability gap between the two, not an oversight, and
closing it means widening this boundary.
