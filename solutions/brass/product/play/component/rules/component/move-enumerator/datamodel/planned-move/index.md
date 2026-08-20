---
name: planned-move
kind: datamodel
version: 1
title: Planned move
summary: A move described just enough to plan the resource decisions it entails — the planner's input, before anything is committed.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - union
  - planning
---

What a caller hands `planMoveChoices` to ask "what will this cost me in
decisions?" — a tagged union on `type`, with only the four actions that consume
resources. Loan, scout, pass and confirm-turn have no branch here, because they
raise no decision at all.

## Why it is not the same model as `legal-move`

They look alike and are deliberately different in three ways:

1. **Different tag name.** `type` here, `kind` on
   [legal-move](srn://brass/product/play/component/rules/component/move-enumerator/datamodel/legal-move@1).
   That is not tidiness — it stops the two from being structurally
   interchangeable in a language with structural typing, which is exactly the
   confusion worth preventing.
2. **No card.** Planning is card-independent. Which card authorises a build has
   no bearing on where its coal comes from, so `card-id` and `eligible-cards`
   are absent.
3. **Fewer branches.** Four, not eight.

The shapes mirror the argument lists of the engine's own move handlers, which is
the property that keeps planning honest: if the planner accepted a shape the
handler could not, a planned move could be unplayable.

## Sequence

The intended call order is enumerate, then plan, then dispatch:

1. `enumerateLegalMoves` returns the legal set — affordability already proved
   against the engine's auto-sourcing.
2. The player picks one; the caller reshapes it into this model and calls
   `planMoveChoices`, receiving
   [move-decisions](srn://brass/product/play/component/rules/component/move-enumerator/datamodel/move-decisions@1).
3. Forced decisions are applied silently, real ones are prompted, and the answers
   travel as
   [move-choices](srn://brass/product/play/component/rules/component/bgio-game/datamodel/move-choices@1)
   attached to the dispatched move.

Step 2 is optional. The MCP surface omits it entirely and lets the engine
auto-source, which is why an agent can play a full game without ever modelling a
coal cube.
