---
name: deck-config
kind: datamodel
version: 1
title: Deck config
summary: The per-face card distribution for one seat count — how many of each location and industry card the deck holds.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - static-data
  - setup
---

# Deck config

The recipe `buildDeck` shuffles. Given a seat count it returns the complete
distribution, and because nothing is removed at setup it is also "how many cards
are in this era's deck" — the canal-to-rail transition reshuffles every discard
back into a full deck.

Verified totals:

| Seats | Location cards | Industry cards | Dual cotton/manufacturer | Total |
| ----- | -------------- | -------------- | ------------------------ | ----- |
| 2     | 27             | 13             | 0                        | 40    |
| 3     | 35             | 13             | 6                        | 54    |
| 4     | 41             | 15             | 8                        | 64    |

The wild pools are *not* in this model: `wildLocation` and `wildIndustry` both
start at 4 at every seat count and live on
[game-state](srn://brass/product/play/component/rules/component/engine-core/datamodel/game-state@1).
Wilds are never dealt, only obtained by scouting.

## Two things that look like bugs and are not

**The 2-player deck has no Cotton/Manufacturer dual cards and no Uttoxeter.**
Blue-banner locations (Leek, Stoke-on-Trent, Stone, Uttoxeter) enter at three
seats, teal (Belper, Derby) at four. Uttoxeter then gets a *second* copy at four
seats, giving 41 rather than 40 location cards. Card removal in the printed game
is by the corner player-count number, not by the board banner, which is exactly
why the second Uttoxeter is a 4-only copy rather than a blue one.

**Coal and pottery counts change with seat count but iron and brewery do not.**
Iron 4 and brewery 5 at every count; coal goes 2/2/3 and pottery 2/2/3. That
asymmetry is printed, not derived.

## Shape

`locations` is an open map from city id to copy count, so it is deliberately not
enumerated in the schema — the key set differs per seat count and the ids are the
same board-location ids used everywhere else. `industry` is a closed object over
the four single-industry faces; cotton and manufacturer appear only as the dual
card, which is why they have no entry there.
