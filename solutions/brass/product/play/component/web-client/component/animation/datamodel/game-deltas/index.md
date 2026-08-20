---
name: game-deltas
kind: datamodel
version: 1
title: Game deltas
summary: What changed between two consecutive game states, reconstructed by diffing because the transport ships no deltas.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - animation
  - derived
---

This model exists because of an absence. The server broadcasts the whole
[game-state](srn://brass/product/play/component/rules/component/engine-core/datamodel/game-state@1)
on every update — `deltaState` is unset, so there is no patch stream — and the
client therefore has a sequence of photographs and no film. `diffGames(prev, next)`
recovers the film, and this is its output.

Nothing on the server produces or consumes it. It is a purely client-side
derivation, and it exists at exactly one point of the architecture: the animation
layer, which turns it into short-lived presentation events (a coin pulse, a
victory-point tick, an income payout fly, a spend animation on a newly built
tile).

## It is a diff, so it must be robust about not having a previous frame

Two rules make the difference between "animates the truth" and "animates the
whole board on page load":

- **`prev === null`** — the first render. Every delta is zero, `new-tiles` is
  empty and `round-rolled` is false, so the opening snapshot never animates.
- **A player present in `next` but missing from `prev`** — a seat that only
  appears in the newer snapshot yields zero deltas, because a just-appeared
  player has no previous value to move from. Without this rule, someone joining
  mid-lobby appears to have just gained £17.

Both are properties of the diff, not of the schema, and both are the kind of
thing that is only ever discovered by watching it go wrong.

## `income-level` is a level, and it is here for a reason

`per-player` carries three deltas and one absolute. The absolute, `income-level`,
is the player's current income **level** taken from `next` — and it is exactly
the money `collectIncome` pays out at round end, since the payout is `money +=
level`. So the animation can size the payout fly correctly without duplicating
the non-linear space-to-level mapping described in
[player-state](srn://brass/product/play/component/rules/component/engine-core/datamodel/player-state@1).

`d-income-level` is a *level* delta too, not a space delta, for the same reason:
a tile flip that advances two spaces may be worth one level or none, and it is
the level the player cares about.

## `round-rolled` is an inference, and an honest one

There is no "income was collected" event on the wire. The client infers it: the
round number or the era changed between snapshots, and `collectIncome` runs in
`endOfRound` before that bump. The inference is sound for the current engine and
would silently break if a future change bumped the round without paying income.
It is recorded here rather than left implicit precisely because the coupling is
invisible from either side.

## `new-tiles` is a projection, not a tile

Deliberately three fields — `id`, `city`, `owner` — and not a whole
[built-tile](srn://brass/product/play/component/rules/component/engine-core/datamodel/built-tile@1).
The animation needs to know where to fly a piece from and whose colour to draw
it in; industry, level, flip state and cube count are all read from the live
board when the animation actually renders. Carrying them in the diff would mean
carrying a snapshot that is stale by the time it is used.
