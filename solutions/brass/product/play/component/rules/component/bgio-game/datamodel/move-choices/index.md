---
name: move-choices
kind: datamodel
version: 1
title: Move choices
summary: The optional, per-unit resource picks a client attaches to a move; omit a list and the engine auto-sources it.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - moves
  - guided-sourcing
---

# Move choices

The answers to the questions
[move-decisions](srn://brass/product/play/component/rules/component/move-enumerator/datamodel/move-decisions@1)
asked, travelling as the last argument of a build, network, develop or sell move.
It is the one place a client's *preference* — as opposed to its *intent* —
crosses into the engine.

Every list is optional, and the two rules that make that safe are the whole point
of this model.

## Rule 1 — an omitted list falls through to the engine's heuristic

Omit `coal` and the engine sources coal itself: nearest connected unflipped mine,
any owner, then the market if the location can reach a merchant. Omit the whole
object and every unit is auto-sourced. This is what lets the same move handler
serve three very different callers — the bot validator and the MCP session both
pass nothing, while the browser wizard fills in exactly the units the player was
prompted for.

It also means guided sourcing can never *become* mandatory without breaking two
of the three consumers, which is a real constraint on this contract's evolution.

## Rule 2 — every supplied pick is re-validated against live state

The engine does not trust the list. It re-plans the move against the state as it
is *now* and asserts each supplied
[candidate](srn://brass/product/play/component/rules/component/move-enumerator/datamodel/candidate@1)
is still a live candidate, comparing on the identity triple `kind + tile-id +
city` only. A pick that no longer matches is `INVALID_MOVE` — and because the
boardgame.io move is transactional, the whole move reverts rather than half
applying.

Narrow identity is what makes this usable rather than infuriating: a market price
that moved between planning and dispatch does not invalidate the pick, but a mine
that was drained does. And the affordability check runs *after* guided picks are
resolved, because a player may deliberately choose an expensive source: the
handler explicitly reverts when the resulting spend exceeds the player's money.

## The lists and their alignment

- `coal`, `iron` — one candidate per cube, in decision order.
- `beer` — a flat list in tile order for a sale; one barrel for a double rail
  build.
- `merchant-per-tile` — index-aligned to the sale's `tile-ids`.
- `develop-bonus` — the odd one out. Not a candidate list but an ordered queue of
  [industry-type](srn://brass/product/play/component/rules/component/engine-core/datamodel/industry-type@1),
  one entry per `develop` merchant bonus that will fire during this sale, routing
  each free develop to the chosen industry's lowest tile. Omitted, the engine
  picks the lowest available tile across the mat, which is legal and usually
  worse.

`develop-bonus` exists because a merchant bonus can itself raise a choice — see
[merchant-bonus](srn://brass/product/play/component/rules/component/engine-core/datamodel/merchant-bonus@1).
A sale that fires two Gloucester barrels needs two entries, in the order the
barrels are consumed.

## Where this model lives

In `bgio-game` rather than in the enumerator, because it is part of the *move
signature*, not of the enumeration. It only has meaning as an argument to a
boardgame.io move, and it is the only model in the rules package whose shape is
dictated by the framework binding.
