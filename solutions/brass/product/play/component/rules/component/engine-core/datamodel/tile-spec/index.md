---
name: tile-spec
kind: datamodel
version: 1
title: Tile spec
summary: One row of the static industry-tile table — cost, inputs, output, flip VP, income spaces, link VP and era availability.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - static-data
  - rules
---

# Tile spec

The printed numbers on one industry tile, keyed by
[industry-type](srn://brass/product/play/component/rules/component/engine-core/datamodel/industry-type@1)
and `level`. Thirty-one rows across six industries; `count` says how many copies
of that row a player owns, so the six mats total 45 tiles per player
(coal 7, iron 4, brewery 7, cotton 11, manufacturer 11, pottery 5).

This is the single densest table in the engine and the one most likely to be
wrong, which is why
[0004-skills-as-rule-source-of-truth](srn://brass/adr/0004-skills-as-rule-source-of-truth)
exists: every number here was triangulated against the rulebook and three
independent datasets, and the skill files are the arbiter when they disagree.

## What each field actually drives

- `cost`, `coal`, `iron` — the build price. `coal`/`iron` are cubes that must be
  *sourced*, not bought: the enumerator prices only the shortfall against the
  market, which is why a build can be legal at £5 and illegal at £5 one turn
  later with the same tile.
- `beers-to-sell` — barrels needed to flip this tile by selling. `null` means the
  industry is not sold at all (coal, iron, brewery); `0` appears on two rows
  (Manufacturer L3 and L7) and means sellable for free.
- `vp` — victory points scored at end of era, **only if flipped**.
- `income` — income **spaces** gained on flip, not levels. The two are related by
  a non-linear track (`levelFromSpace`), so adding these numbers to a level is a
  standing source of off-by-several bugs.
- `link-vp` — the connection icon. Scored for adjacent links whether or not the
  tile is flipped, which is why an unflipped tile is still worth building next to
  your own canal.
- `can-develop` — `false` is the lightbulb: Pottery L1 and L3 cannot be removed by
  a Develop action.
- `canal-era` / `rail-era` — availability. Level 1 tiles of most industries are
  canal-only, and the era transition purges every unflipped level-1 tile from the
  board.
- `produces` — cubes placed on the tile when built (coal 2/3/4/5, iron 4/4/5/6).
  Breweries are the exception: their row says `0` and the real barrel count comes
  from `beerProduced(era)`, which is 1 in the canal era and 2 in the rail era.
  A consumer that reads `produces` for a brewery gets zero and is wrong.

That brewery exception is the reason this model is worth prose: the schema can
describe the field, only the text can say the field lies for one industry.
