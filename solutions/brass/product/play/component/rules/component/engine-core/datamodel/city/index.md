---
name: city
kind: datamodel
version: 1
title: City
summary: A build location — its region and its ordered list of industry slots, each slot naming the industries allowed in it.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - board-graph
  - static-data
---

A build location: extends
[board-location](srn://brass/product/play/component/rules/component/engine-core/datamodel/board-location@1)
with the two things that make it buildable — the region whose banner colour
governs when its cards enter the deck, and the ordered `slots` printed on it.

There are **22** build locations, not 20. Twenty named cities plus the two
unnamed farm breweries (`northern`, `southern`), which the engine models with
this same shape: one slot each, allowing `brewery` only. They are true build
targets, not decoration, and the code path that most often forgets it is card
authorisation — a Wild Location card explicitly **cannot** be played at a farm
brewery, which is a special case coded in `legalMoves.ts` and stated in
[rule-correctness](srn://brass/requirement/rule-correctness).

## Slots are positional, and the position is part of the identity

`slots` is an array of arrays: `slots[i]` is the set of industries the *i*-th
printed space accepts. Birmingham's is
`[["cotton","manufacturer"], ["manufacturer"], ["iron"], ["manufacturer"]]`.
A [built-tile](srn://brass/product/play/component/rules/component/engine-core/datamodel/built-tile@1)
records `slot-index`, so reordering this array silently relocates every tile
already on the board and every move id the MCP surface has handed out — a move
id is literally `build|stafford|0|cotton`. Slot order is therefore frozen data,
not a rendering preference.

Two rules read the slot sets rather than a single slot:

- **Single-industry-space priority.** An empty *mixed* space is illegal while an
  empty single-`X` space for the same industry remains in the same city.
  `singleSpaceBlocks` implements it; overbuilding an occupied slot is exempt.
- **Overbuild.** Only a same-industry tile of a strictly higher level may replace
  an occupant, with the extra coal/iron restrictions in `mechanics.ts`.

Neither is expressible in JSON Schema, which is the point of writing them down
here.

## Spelling

The runtime `region` value for the Black Country is `black_country` and the
runtime ids are camelCase (`burtonOnTrent`, `stokeOnTrent`). The catalog
normalises identifiers to kebab-case for consistency with every other schema
here; the enum value below is `black-country`. Consumers reading live engine
state must map the one to the other — the *values* are the catalog's spelling,
the transport's spelling is the TypeScript one.
