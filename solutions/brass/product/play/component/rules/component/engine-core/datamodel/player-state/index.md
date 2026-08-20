---
name: player-state
kind: datamodel
version: 1
title: Player state
summary: One player's money, income marker, victory points, spend, hand, discard, remaining mat tiles and remaining link tokens.
status: review
owner: sergio-bershadsky
usage: both
abstract: false
tags:
  - rules
  - player
---

Everything a seat owns that is not on the board. Setup gives every player £17,
income space 10 (which is income level 0), 14 link tokens and a full mat of 45
tiles; `vp`, `spent` and `discard` start empty and `hand` is dealt to 8.

## `income-space` is not income

The single most misread field in the engine. The income track has 100 *spaces*
and 41 *levels*, and the mapping is deliberately non-linear:

| spaces  | levels    | spaces per level |
| ------- | --------- | ---------------- |
| 0 to 10 | -10 to 0  | 1                |
| 11 to 30| 1 to 10   | 2                |
| 31 to 60| 11 to 20  | 3                |
| 61 to 96| 21 to 29  | 4                |
| 97 to 99| 30        | 3                |

Flipping a tile advances the marker by *spaces* — the `income` column of
[tile-spec](srn://brass/product/play/component/rules/component/engine-core/datamodel/tile-spec@1).
Taking a loan drops it by *levels*, and lands the marker on the highest space of
the new level. Money collected at end of round is the level, not the space.
Adding a tile's `income` to a level, or comparing two players by space instead of
level, is wrong in both directions and the bug is invisible below space 11 where
the two happen to differ by a constant.

This is also why the MCP surface publishes `income-level` and never the space:
the model would otherwise have to reimplement `levelFromSpace` to reason about
its own income. See
[state-view](srn://brass/product/agent-play/component/mcp-server/datamodel/state-view@1).

## `spent` drives turn order

Money spent during the current round, reset each round. At end of round players
are reordered ascending by `spent` — the player who spent least goes first next
round. It is a rule, not a statistic, and it is the reason a cheap turn can be
worth more than a strong one.

## `mat` is a stack, not a set

`mat[industry]` is the ascending list of levels still available, and a build
always takes element 0. You cannot choose to build a level 3 cotton while a
level 1 remains; you must Develop the lower ones away first, and Develop is
itself gated by the `can-develop` flag. So the mat is really six stacks, and
"which industry can I build at what level right now" is answered by reading six
heads.

## Hand and discard

`hand` is the private half and is redacted for every other seat before broadcast;
`discard` is public — discards are face up, apart from the canal-setup seed
cards, which carry `face-down` on the
[card](srn://brass/product/play/component/rules/component/engine-core/datamodel/card@1)
itself. The canal-to-rail transition reshuffles every discard back into the deck
and redeals to 8.
