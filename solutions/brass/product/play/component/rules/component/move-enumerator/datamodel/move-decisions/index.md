---
name: move-decisions
kind: datamodel
version: 2
title: Move decisions
summary: Every resource decision one planned move raises, grouped by coal, iron, beer and sell-merchant.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - planning
---

The answer `planMoveChoices` gives to "if I commit to this move, what am I going
to be asked?". Four arrays of
[decision](srn://brass/product/play/component/rules/component/move-enumerator/datamodel/decision@1),
one per resource category, empty where the category does not apply. It is a pure
read: nothing here mutates the game state.

Which arrays are populated is entirely a function of the move:

| planned move           | coal             | iron             | beer                     | merchant   |
|------------------------|------------------|------------------|--------------------------|------------|
| `build`                | tile spec's coal | tile spec's iron | empty                    | empty      |
| `network`, canal era   | empty            | empty            | empty                    | empty      |
| `network`, single rail | 1                | empty            | empty                    | empty      |
| `network`, double rail | 1 per link       | empty            | 1                        | empty      |
| `develop`              | empty            | 1 per tile       | empty                    | empty      |
| `sell`                 | empty            | empty            | per tile's beers-to-sell | 1 per tile |

A canal-era link is genuinely free of decisions — every canal link costs 3 money
and nothing else — which is why the whole record comes back empty and the UI
dispatches with no prompt at all.

## Alignment rules that the schema cannot state

- `merchant[i]` corresponds to `tile-ids[i]` of the sale.
- `beer` is a **flat** list in tile order, not one entry per tile: a tile needing
  two barrels contributes two consecutive decisions.
- `coal` for a double rail build is one decision per link, **in the order the
  links appear in the move**, and each is planned against a clone that already
  reflects the previous link's consumption. Reordering the links changes the
  answer, which is why the enumerator emits the anchor link first.

Getting any of those wrong hands the engine a pick for the wrong unit. Because
candidate identity is validated per unit, the usual symptom is an `INVALID_MOVE`
on a move the player was correctly offered — an especially confusing failure,
and the reason the alignment is written down here rather than left in the
planner's comments.

## Why this exists as a separate model from the move

A move can be enumerated as legal without anyone knowing what it will *ask*. The
enumerator proves affordability using the engine's own auto-sourcing; the planner
answers the different question of which of those sources the player may choose
between. Keeping them apart is what lets the MCP surface skip the planner
entirely — a model selects a move id and lets the engine auto-source — while the
browser client runs the full wizard against the same enumeration.
