---
name: owned-piece
kind: datamodel
version: 1
title: Owned piece
summary: Abstract base for a numbered piece placed on the board and belonging to exactly one player.
status: review
owner: sergio-bershadsky
usage: both
abstract: true
tags:
  - foundation
  - board-state
---

# Owned piece

Two things are placed on the board by players and by nobody else: industry tiles
and links. This base carries what they share — a monotonic numeric `id` and an
`owner`.

It is `abstract: true`; the concrete descendants are
[built-tile](srn://brass/product/play/component/rules/component/engine-core/datamodel/built-tile@1)
and
[built-link](srn://brass/product/play/component/rules/component/engine-core/datamodel/built-link@1),
each adding its own placement fields with a root `allOf`. As with every base
here, `additionalProperties` is left unset so those additions are not rejected.

## Why the id is numeric and where it comes from

Both counters live on
[game-state](srn://brass/product/play/component/rules/component/engine-core/datamodel/game-state@1)
— `next-tile-id` and `next-link-id` — and are incremented on placement. They are
per-match, not global, and they are the only stable handle a client has on a
board piece: a Sell move names `tile-ids`, the move id for a sale is literally
`sell|<tile-id>`, and a resource
[candidate](srn://brass/product/play/component/rules/component/move-enumerator/datamodel/candidate@1)
identifies a source mine by `tile-id`. Reusing an id inside one match would let a
stale pick resolve to a different piece — the exact failure the candidate
identity rule is designed to reject.

Note that the two counters are independent, so a tile and a link may share a
numeric id. Nothing compares them across kinds, but a consumer that flattens both
into one collection keyed by id will collide.

## Ownership is not colour

`owner` is a player id string (`"0"` through `"3"`), the same key used in
`game-state.players` and `game-state.seats`. Colour is a seat property that can
still be `null` while a seat exists, so rendering must resolve owner to seat to
colour rather than storing colour on the piece.
