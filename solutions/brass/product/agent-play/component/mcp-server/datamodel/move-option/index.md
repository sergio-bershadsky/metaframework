---
name: move-option
kind: datamodel
version: 1
title: Move option
summary: One selectable move offered to the model — a content-derived id, a human-readable label, and the move itself.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - mcp
---

The unit `get_legal_moves` returns and `make_move` accepts an id from. It is the
mechanism behind
[constrained-move-selection](srn://brass/product/agent-play/requirement/constrained-move-selection):
the model does not *compose* a move, it *selects* one, and a move that is not
legal right now is unrepresentable at the tool boundary. There is no free-form
move argument to abuse.

Three fields, and each answers a different need:

- `id` — what the model sends back. Content-derived, so it means the same thing
  in the next enumeration if the move is still available.
- `label` — what the model reasons over. "Build cotton L1 in Stafford (slot 0)"
  is a proposition; the raw move object is a data structure.
- `move` — the full
  [legal-move](srn://brass/product/play/component/rules/component/move-enumerator/datamodel/legal-move@1),
  so nothing is hidden and the model can inspect card ids or edge lists when the
  label is not enough.

## The id is content-derived, and that is the safety property

`move-key` mirrors the enumerator's own semantic identity: `build|<city>|<slot>|<industry>`,
`network|<sorted edge pairs>`, `develop|<sorted industries>`, `sell|<sorted tile ids>`,
and the bare words `loan`, `scout`, `pass`, `confirm-turn`. Deliberately absent
from every one of them: which card the move would spend. Card choice is not part
of the move's meaning, so the same move keeps the same id however the hand
changes around it.

`make_move` re-enumerates before applying and looks the id up in the *fresh*
list. Two consequences follow, and they are the whole point:

- A **stale id** — offered a moment ago, no longer legal — matches nothing and
  the call returns `ok: false` with `legal-ids`, rather than applying some other
  move. See
  [tool-result](srn://brass/product/agent-play/component/mcp-server/datamodel/tool-result@1).
- A **hallucinated id** cannot collide with a real move by accident, because ids
  are structured strings over board vocabulary rather than opaque handles.

Uniqueness holds within one enumeration by construction: the enumerator
deduplicates on exactly this key before emitting, so no two options in one list
can share an id.

## What it deliberately does not carry

No cost, no resource plan, no evaluation. The model is given the legal set and
its own judgement; the planner
([move-decisions](srn://brass/product/play/component/rules/component/move-enumerator/datamodel/move-decisions@1))
is not exposed over MCP at all, and the engine auto-sources every cube. That is a
real limitation — the agent cannot choose to drain a rival's mine rather than the
nearest one — and it is the price of a tool surface a model can use without
modelling the resource economy.
