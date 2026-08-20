---
name: merchant-tile-state
kind: datamodel
version: 1
title: Merchant tile state
summary: A merchant tile in a commerce slot — which goods it buys, whether it takes anything, and whether its free barrel is still there.
status: review
owner: sergio-bershadsky
usage: both
abstract: false
tags:
  - board-state
  - commerce
---

What the setup shuffle put on a merchant slot, and what is left of it. Distinct
from
[merchant](srn://brass/product/play/component/rules/component/engine-core/datamodel/merchant@1),
which is the immutable printed location: the bonus belongs to the place, the
buy-list belongs to the tile, and the tile is different every game.

Nine tiles exist; how many are in play follows the seat count through
`active-from-players`, giving 5 slots at two seats, 7 at three, 9 at four. The
pool is `[[], [], ["manufacturer"], ["cotton"], all]` plus `["pottery"], []` at
three seats and `["manufacturer"], ["cotton"]` at four.

## `all` and `buys` together, and the blank tile

Three distinct states, and only two fields to express them:

| `all`   | `buys`      | meaning                                        | `beer` at setup |
| ------- | ----------- | ---------------------------------------------- | --------------- |
| `true`  | `[]`        | accepts any sellable good                      | 1               |
| `false` | non-empty   | accepts exactly those industries                | 1               |
| `false` | `[]`        | **blank tile** — accepts nothing                | 0               |

The blank is the one worth stating: `all: false` with an empty `buys` is not a
missing value, it is a real tile that buys nothing and carries no barrel. Code
that treats an empty `buys` as "unspecified, so allow everything" inverts the
rule and makes every merchant universal. `merchantAccepts` is the single reader
and it gets this right; anything reimplementing it must too.

## `beer` is a barrel with a bonus attached

Each non-blank tile starts with one free barrel. Consuming it is what fires the
location's
[merchant-bonus](srn://brass/product/play/component/rules/component/engine-core/datamodel/merchant-bonus@1),
so the barrel is worth more than a barrel — it is why a sale routed through
Gloucester is worth a free develop and the same sale through Oxford is worth two
income spaces. Once spent the field is 0 for the rest of the era; the canal-to-rail
transition resets every barrel.

That coupling is also why the sell wizard cannot pick beer before it picks a
merchant. The planner deliberately refuses to offer a merchant barrel while more
than one accepting merchant is still possible: binding a provisional merchant's
barrel would let the player then switch merchants, and the engine would reject
the pick by identity. See
[decision](srn://brass/product/play/component/rules/component/move-enumerator/datamodel/decision@1).
