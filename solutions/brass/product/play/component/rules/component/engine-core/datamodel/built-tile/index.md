---
name: built-tile
kind: datamodel
version: 1
title: Built tile
summary: An industry tile occupying one city slot — its level, its remaining cubes or barrels, and whether it has flipped.
status: review
owner: sergio-bershadsky
usage: both
abstract: false
tags:
  - board-state
---

# Built tile

A tile taken from a player's mat and placed in a city slot. Extends
[owned-piece](srn://brass/product/play/component/rules/component/engine-core/datamodel/owned-piece@1)
with where it is, what it is, and how far through its life it has got.

`(city, slot-index)` is unique across the board at any moment: two tiles in one
slot is an overbuild that has not completed, not a state the engine ever holds.
Placement is what the `slots` array of
[city](srn://brass/product/play/component/rules/component/engine-core/datamodel/city@1)
authorises, and re-ordering that array would silently relocate every instance of
this model.

## `resources` means three different things

The field is one integer and its unit depends on `industry`:

- **coal or iron** — the cubes placed at build time, from the `produces` column
  of [tile-spec](srn://brass/product/play/component/rules/component/engine-core/datamodel/tile-spec@1).
  Other players consume them; when the last one leaves, the tile flips.
- **brewery** — beer barrels, and the count does *not* come from `produces`
  (which is 0 for every brewery row) but from `beerProduced(era)`: 1 barrel in
  the canal era, 2 in the rail era.
- **cotton, manufacturer, pottery** — always 0. These tiles hold nothing; they
  flip by being sold, not by being drained.

A consumer that reads `produces` to predict this number is wrong for breweries,
which is the single most likely mistake in reimplementing the board display.

## `flipped` is the whole economy

An unflipped tile scores no victory points and pays no income; flipping is what
converts a build into both. Coal, iron and brewery tiles flip when their last
cube or barrel is taken — by *any* player, which is why building a mine next to
an opponent is sometimes correct. Cotton, manufacturer and pottery flip when sold
to a merchant that accepts them, at the barrel cost in `beers-to-sell`.

The `link-vp` connection icon scores either way. That asymmetry — flip VP only
when flipped, link VP always — is why an unflipped tile is still worth having on
the board.

## Era transition

The canal-to-rail transition removes every level-1 tile still on the board. That
is a purge of instances of this model keyed on `level`, and it is the reason
level 1 tiles are mostly canal-only in
[tile-spec](srn://brass/product/play/component/rules/component/engine-core/datamodel/tile-spec@1).
