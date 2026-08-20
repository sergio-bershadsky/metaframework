---
name: engine-core
kind: component
version: 3
title: Engine core
summary: Board graph, tile tables, markets, income, network reachability, deck, scoring, and the mutating mechanics.
status: review
owner: sergio-bershadsky
component-type: library
lifecycle: released
relations:
  exposes:
    - /product/play/component/rules/component/engine-core/datamodel/game-state@1
    - /product/play/component/rules/component/engine-core/datamodel/city@1
    - /product/play/component/rules/component/engine-core/datamodel/tile-spec@1
  implements:
    - /requirement/rule-correctness
    - /requirement/seat-count-2-to-4
    - /requirement/full-two-era-game
  realizes:
    - /capability/rule-adjudication
tags:
  - engine
  - domain
---

The game itself, with no framework anywhere in it: `types.ts`, `board.ts`,
`industryData.ts`, `market.ts`, `income.ts`, `network.ts`, `deck.ts`, `scoring.ts`
and `mechanics.ts`. Nine files, none of which knows that a turn loop, a socket or a
React component exists.

## What it owns

**The map**, as data rather than as pixels: twenty cities plus two farm breweries as
build locations, merchants, and the edge list joining them with the era each edge is
usable in. Coordinates are the printed board's, carried as `BOARD_EXTENT`, which is
why the flat SVG board can be *projected* from this graph instead of drawn by hand.

**The static tables**: one row per industry tile level — cost, coal and iron inputs,
beer to sell, VP, income, link VP, and the era flags that decide which tiles are
purged at the era change. Everything downstream keys off `IndustryType`, which is why
that six-value enum is the heaviest fan-in datamodel in the solution.

**The mutating mechanics** — `consumeCoalFrom`, `consumeBeer`, `chooseMerchantTile`,
`canOverbuild`, `singleSpaceBlocks` and their neighbours. These are the functions a
move handler calls after legality is settled, and they are where the greedy
resource-resolution rules actually live.

## The rule that makes the whole architecture work

Resource sourcing is *decided* here and *offered* by
[move-enumerator](srn://brass/product/play/component/rules/component/move-enumerator).
The planners mirror the greedy consumption this component performs — coal
re-measuring "nearest connected" per cube, a market price rising as cubes are drawn
— on a local clone, so the candidate list a player is shown is the set the engine
would actually accept. Two implementations of one rule would be a latent
divergence; instead the planners are documented as mirroring `mechanics.ts` and the
bot validator proves it by playing whole games.

## Why it declares no environment

`component-type: library`. It runs inside its embedders and has no runtime of its
own, so a `uses` edge to an environment here would be a category error — the
framework treats it as one.

## Obligations it can discharge alone

Seat counts and the two-era arc are claimed here as well as on the product, because
this component is where they are actually decided: the deck composition per player
count, the merchant activation thresholds, the era-transition purge of level-1
tiles, the link clear, the discard reshuffle, and the redeal. The product-level
claims exist for the same requirements because a player only observes them once the
server and client agree; both claims are true and neither is redundant.
