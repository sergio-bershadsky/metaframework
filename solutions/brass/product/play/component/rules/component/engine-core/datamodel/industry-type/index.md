---
name: industry-type
kind: datamodel
version: 1
title: Industry type
summary: The six industries every tile table, city slot, card face and market rule in the engine is keyed by.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - vocabulary
  - board-game
---

Six values, closed by the printed game: `coal`, `iron`, `brewery`, `cotton`,
`manufacturer`, `pottery`. Everything else in the engine is indexed by one of
them — the industry-tile table, a city's build slots, an industry card's face, a
player mat's remaining levels, a merchant tile's buy list, and the two derived
partitions the rules rely on (`SELLABLE` = cotton/manufacturer/pottery,
`RESOURCE_INDUSTRIES` = coal/iron/brewery).

This is the highest fan-in model in the catalog: it is referenced by
[city](srn://brass/product/play/component/rules/component/engine-core/datamodel/city@1),
[tile-spec](srn://brass/product/play/component/rules/component/engine-core/datamodel/tile-spec@1),
[built-tile](srn://brass/product/play/component/rules/component/engine-core/datamodel/built-tile@1),
[merchant-tile-state](srn://brass/product/play/component/rules/component/engine-core/datamodel/merchant-tile-state@1),
[card](srn://brass/product/play/component/rules/component/engine-core/datamodel/card@1),
[legal-move](srn://brass/product/play/component/rules/component/move-enumerator/datamodel/legal-move@1),
[planned-move](srn://brass/product/play/component/rules/component/move-enumerator/datamodel/planned-move@1)
and
[move-choices](srn://brass/product/play/component/rules/component/bgio-game/datamodel/move-choices@1).
That fan-in is exactly the promotion rule's first trigger, which is why it is an
entity rather than a `$defs` enum copied nine times.

## Why the set is closed and cannot grow

The additive-evolution table says adding an enum value is legal in place. It is
not legal *here* in any meaningful sense: a seventh industry has no tile table,
no slot on any printed city, no card face and no scoring rule. Widening this
enum without widening
[tile-spec](srn://brass/product/play/component/rules/component/engine-core/datamodel/tile-spec@1)
produces a value `tileSpec()` throws on. Treat the set as frozen by the physical
board, not by the schema.

## Spelling

The catalog normalises every property name and enum value to kebab-case, as the
framework does throughout. Here the two spellings coincide — the TypeScript
union in `packages/rules/src/types.ts` uses the same six lowercase words.
