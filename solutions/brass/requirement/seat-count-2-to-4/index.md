---
name: seat-count-2-to-4
kind: requirement
version: 1
title: Two, three and four players are all fully supported
summary: Every seat count has its own deck, its own merchant setup and its own active merchants, and none is a degraded case of another.
status: review
owner: sergio-bershadsky
requirement-type: functional
priority: must
relations:
  uses:
    - /product/play/component/rules/component/engine-core/datamodel/deck-config@1
tags:
  - rules
  - setup
---

# Two, three and four players are all fully supported

Brass changes shape with the number of players, and not by a scaling factor: the
deck gains whole banner colours, the merchant pool gains tiles, and some
merchants do not activate at all below a threshold. A two-player game with the
four-player deck is not a harder two-player game, it is a different one.

The framework's own player count is a *capacity*, not a seat count. Matches are
always created with four framework seats, and the rules read `seatedIDs(G)` —
who actually sat down in the game's lobby phase
([0005-lobby-inside-game-state](srn://brass/adr/0005-lobby-inside-game-state)).
Everything below is keyed on the second number.

## Acceptance criteria

- **AC-1** The draw deck totals 40 cards at two seats, 54 at three and 64 at four, counted from the same configuration the game builds from.
- **AC-2** Blue-banner locations appear only at three seats and above, teal only at four; the second, four-player-only Uttoxeter copy appears only at four.
- **AC-3** The merchant tile pool holds 5 tiles at two seats, 7 at three and 9 at four.
- **AC-4** A merchant whose activation threshold exceeds the seated count takes no tile and buys nothing for the whole game.
- **AC-5** Turn order, income collection, era end and scoring iterate seated players only; an empty framework seat is invisible to every rule.
- **AC-6** The bot validator plays complete games at each of two, three and four seats, and each run finishes with a decided winner.

## Rationale

AC-2 states the removal rule in the form the code uses. Cards are removed by the
**corner player-count number**, not by board banner colour — the two coincide
almost everywhere and diverge at Uttoxeter, which is exactly where a
banner-based implementation would be wrong by one card at three players.

AC-5 is what makes the four-seat-capacity decision safe. It is the criterion
that would catch a rule reading `ctx.numPlayers` where it meant "players in this
game", which is the single easiest mistake to make in this codebase.

## Out of scope

Solo play and the five-player variant. Neither exists in the printed game, and
the lobby's `hostStart` refuses fewer than two seated players.
