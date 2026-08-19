---
name: full-two-era-game
kind: requirement
version: 1
title: A match runs canal era through rail era to a decided winner
summary: The whole game is playable end to end, including the era transition that purges tiles, clears links and reshuffles the deck.
status: review
owner: sergio-bershadsky
requirement-type: functional
priority: must
relations:
  uses:
    - /protocol/game-transport
tags:
  - rules
  - lifecycle
---

# A match runs canal era through rail era to a decided winner

A Brass implementation that plays one era is a demo. The era transition is where
most of the game's structure lives — it scores, it destroys, it reshuffles, and
it re-seats the table — and an implementation that stops before it has skipped
the hard half.

The lifecycle is modelled in
[game-transport](srn://brass/protocol/game-transport)'s state machine: lobby,
canal era, rail era, finished, with the same turn machine inside each era and
the transition carried as actions on the era edge.

## Acceptance criteria

- **AC-1** An era ends at the end of the round in which the deck is empty and every hand is empty — not at the moment the last card is drawn.
- **AC-2** Ending the canal era scores links and industries, then removes every level-1 industry tile, clears all links, and resets each merchant's beer barrel.
- **AC-3** All discards are reshuffled into a new deck, the canal seed card is turned face up, turn order is recomputed by least spent, and every player is dealt a fresh hand of eight.
- **AC-4** No income is collected in the final round of the rail era; the game ends on scoring.
- **AC-5** The game reaches `ended` with `winner` and `winners` set, and a tie on VP, income level and money is reported as a shared victory rather than an arbitrary pick.
- **AC-6** Canal-era round one grants one action per turn; every other round in both eras grants two.

## Rationale

AC-1 is stated negatively because the natural implementation is wrong: ending
the era when the deck empties cuts the round short and denies the remaining
seats their last turns. The engine checks the condition only in `endOfRound`,
which is what makes the criterion testable.

AC-5 exists because a shared victory was one of the audit's low-severity
findings — the original implementation kept a single `winner` and had nowhere to
put a tie. `winners` is the real answer and `winner` survives as the first tied
id for older consumers, which is a compatibility shim worth knowing about.

## Out of scope

Rematch and series play. `playAgain` is a live framework route that nothing in
this repository calls.
