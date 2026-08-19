---
name: move-enumerator
kind: component
version: 1
title: Move enumerator
summary: The shared legal-move enumerator and the read-only resource planners every client narrows against.
status: review
owner: sergio-bershadsky
component-type: library
relations:
  exposes:
    - /protocol/legal-move-api
    - /product/play/component/rules/component/move-enumerator/datamodel/legal-move@1
  depends-on:
    - /product/play/component/rules/component/engine-core
  implements:
    - /requirement/legal-move-enforcement
    - /product/play/component/rules/requirement/enumerator-engine-parity
tags:
  - engine
  - contract
---

# Move enumerator

Two files, `legalMoves.ts` and `planners.ts`, and the most important contract in the
solution. Everything that offers a player a choice — the browser's action flow, the
MCP tool surface, the bot validator — asks this component what is legal and offers
only that.

## `enumerateLegalMoves` — the list of what can be done

Returns a discriminated union over eight kinds: `build`, `network`, `develop`,
`sell`, `loan`, `scout`, `pass`, `confirmTurn`. Each carries the concrete target and
an `eligibleCards` array: every hand card that could authorise *this exact*
action-plus-target. The single-field `cardId` on each move stays the default choice
so existing dispatch keeps working, and it is defined as element zero of
`eligibleCards`.

That ordering is an invariant, not an implementation detail. `eligibleCards` is
ordered non-wild first, so the default spend never burns a wild card when an ordinary
one would do — a wild is worth keeping and a UI that picks arbitrarily would throw
them away. Anything that reorders that array changes the game.

The enumerator also collapses per-card duplicates for card-agnostic actions through a
semantic `agnosticKey` — a Network action on the same edge set is one move, not one
per card that could pay for it — so the client renders one affordance rather than
eight identical ones.

## The planners — where a required resource could come from

`planMoveChoices`, `planSell` and `planSellTileBeer` are pure analysers that never
mutate state. They answer "this move needs three coal and a beer; for each unit,
which sources are legal?" and return one `Decision` per unit, each holding the full
`Candidate` list.

The sourcing rules they encode are subtle enough to be worth stating: coal comes
from the nearest *connected* unflipped mine of any owner, ties being the player's
free choice, falling back to the market only if the location connects to a merchant;
iron from any unflipped works anywhere, with no distance and no connection, falling
back to a market that is always reachable; beer from your own brewery with no
connection needed, a connected opponent brewery, or the barrel on the merchant being
sold to. Where a sequence of cubes depletes its sources, the planner simulates that
depletion so the Nth cube's candidates reflect the first N−1 already taken.

An empty candidate list means the unit is unsatisfiable, which means the move is
illegal — that is how a planner and an enumerator stay consistent without a second
legality pass.

## Why the exposed types are the coupling that matters

`LegalMove`, `Candidate`, `Decision`, `MoveDecisions` and `PlannedMove` are imported
by three components in two products. A change to any of them breaks all three at
compile time, which is the property that lets
[web-client](srn://brass/product/play/component/web-client) be trusted never to
re-derive a rule: it cannot invent an affordance the enumerator did not name,
because it has nothing to invent one from.

## The parity claim

[enumerator-engine-parity](srn://brass/product/play/component/rules/requirement/enumerator-engine-parity)
is this component's central obligation and the reason the bot validator exists. The
enumerator mirrors the validation inside the move handlers rather than sharing it;
divergence is therefore possible in principle, and the bot's job is to find it by
playing complete games from fixed seeds and asserting the engine accepts every move
the enumerator offered.
