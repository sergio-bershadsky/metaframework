---
name: merchant-bonus
kind: datamodel
version: 1
title: Merchant bonus
summary: The five commerce rewards a merchant location fires when its free beer barrel is consumed by a sale.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - vocabulary
  - scoring
---

# Merchant bonus

A property of the **location**, not of the tile placed on it. Each of the five
merchant locations carries exactly one printed bonus, and it fires once, when
that location's free barrel is spent on a sale:

| Value      | Location   | Effect when the barrel is consumed          |
| ---------- | ---------- | ------------------------------------------- |
| `vp4`      | Shrewsbury | +4 victory points                           |
| `develop`  | Gloucester | one free develop (no iron cost)             |
| `income2`  | Oxford     | +2 income spaces                            |
| `money5`   | Warrington | +5 money                                    |
| `vp3`      | Nottingham | +3 victory points                           |

The mapping is fixed in `board.ts` and is not part of any instance: a
[merchant](srn://brass/product/play/component/rules/component/engine-core/datamodel/merchant@1)
carries its own bonus, and a barrel-bearing
[candidate](srn://brass/product/play/component/rules/component/move-enumerator/datamodel/candidate@1)
echoes it so the sell wizard can say "use the Gloucester barrel (+develop)"
instead of an anonymous "use merchant beer".

## Why `develop` is the awkward one

Four of the five bonuses are a scalar the engine can apply with no further
input. `develop` is a *choice*: it removes the lowest tile from one industry on
the player's mat, and which industry is the player's decision. That is why
[move-choices](srn://brass/product/play/component/rules/component/bgio-game/datamodel/move-choices@1)
carries a `develop-bonus` queue at all — one entry per `develop` bonus that will
fire during a sale. Omit the queue and the engine silently auto-picks the lowest
available tile, which is a legal but usually worse play. This is the single
clearest case of the rule recorded in
[0005-prompt-only-real-choices](srn://brass/product/play/adr/0005-prompt-only-real-choices).
