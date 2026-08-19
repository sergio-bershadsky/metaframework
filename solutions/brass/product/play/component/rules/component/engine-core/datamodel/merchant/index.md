---
name: merchant
kind: datamodel
version: 1
title: Merchant
summary: A commerce location — its printed bonus, how many tile slots it has, and the seat count at which it activates.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - board-graph
  - static-data
---

# Merchant

The five commerce locations on the board edge, extending
[board-location](srn://brass/product/play/component/rules/component/engine-core/datamodel/board-location@1)
with what makes them commerce rather than industry.

| id           | bonus     | tile slots | active from |
| ------------ | --------- | ---------- | ----------- |
| `shrewsbury` | `vp4`     | 1          | 2 players   |
| `gloucester` | `develop` | 2          | 2 players   |
| `oxford`     | `income2` | 2          | 2 players   |
| `warrington` | `money5`  | 2          | 3 players   |
| `nottingham` | `vp3`     | 2          | 4 players   |

`active-from-players` is what makes the board scale: 5 tile slots at two seats,
7 at three, 9 at four. That is the same fact as
[seat-count-2-to-4](srn://brass/requirement/seat-count-2-to-4) seen from the
merchant side, and it must move in step with
[deck-config](srn://brass/product/play/component/rules/component/engine-core/datamodel/deck-config@1)
— fewer merchants with the same deck makes half the sellable goods unsellable.

## `connects` is documentation, not adjacency

`connects` lists the cities the merchant is drawn next to. **Nothing in the rules
engine reads it.** Real adjacency lives in
[edge](srn://brass/product/play/component/rules/component/engine-core/datamodel/edge@1),
and every reachability question — is this tile connected to a merchant that buys
it, can this location reach the coal market — is answered by a search over
`EDGES`. The field is retained because it makes the static table readable next to
the printed board, and it is called out here so no future consumer mistakes it
for the graph. If the two ever disagree, `edge` is right and `connects` is a
stale comment.

## Location versus tile

This model is the *place*. What is placed on it at setup — which goods it buys
and whether its free barrel is still there — is
[merchant-tile-state](srn://brass/product/play/component/rules/component/engine-core/datamodel/merchant-tile-state@1),
which is per-match and mutable. The bonus belongs to the place and never moves;
the tile belongs to the setup shuffle and is different every game.
