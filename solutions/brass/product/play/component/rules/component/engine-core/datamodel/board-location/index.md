---
name: board-location
kind: datamodel
version: 1
title: Board location
summary: Abstract base for anything that sits at a fixed point on the printed map — an id, a display name and board-art coordinates.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: true
tags:
  - foundation
  - board-graph
---

Every node of the board graph is a labelled point on a piece of printed
cardboard. This model factors that out: a stable `id` used as the vertex key
everywhere in the engine, a `name` for display, and the `x`/`y` the artwork puts
it at.

It is `abstract: true` — nothing is ever a bare board location. Two concrete
models extend it with a root `allOf`:
[city](srn://brass/product/play/component/rules/component/engine-core/datamodel/city@1)
(a build location, so it adds a region and slots) and
[merchant](srn://brass/product/play/component/rules/component/engine-core/datamodel/merchant@1)
(a commerce location, so it adds a bonus and tile slots). The base deliberately
leaves `additionalProperties` unset; closing it would reject every property both
descendants add, because `allOf` branches are evaluated independently.

## What the id is load-bearing for

The `id` is the only join key in the whole engine. An
[edge](srn://brass/product/play/component/rules/component/engine-core/datamodel/edge@1)
names two of them; a
[built-tile](srn://brass/product/play/component/rules/component/engine-core/datamodel/built-tile@1)
names one; a
[built-link](srn://brass/product/play/component/rules/component/engine-core/datamodel/built-link@1)
names two; a location [card](srn://brass/product/play/component/rules/component/engine-core/datamodel/card@1)
names one; and network reachability is a breadth-first search over exactly these
strings. Cities and merchants share one id namespace — `network.ts` distinguishes
a merchant from a city by membership test, not by a type tag — so renaming a
city id silently changes what "connected to a merchant" means. That single
namespace is why this base exists rather than two unrelated shapes.

## Coordinates

`x` and `y` are board-art pixels, not a projection anyone should reinvent. Their
extent is `{ minX: 25, maxX: 871, minY: 26, maxY: 939 }`, exported as
`BOARD_EXTENT` and used to centre the layout. The flat SVG board is projected
live from these numbers, which is the whole point of
[0002-flat-svg-board](srn://brass/product/play/adr/0002-flat-svg-board): the map
is data the engine already owns, not a second asset that can drift from it.
