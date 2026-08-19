---
name: 0001-turn-commit-gate
kind: adr
version: 1
title: An action does not end the turn
summary: Spending the action budget sets awaitingCommit; only an explicit confirmTurn move ends the turn and seals the undo stack.
status: review
owner: sergio-bershadsky
decision-status: accepted
date: "2026-07-17"
deciders:
  - sergio-bershadsky
relations:
  uses:
    - /protocol/game-transport
tags:
  - rules
  - turn
---

# An action does not end the turn

## Context

boardgame.io's default is that a turn ends when its move budget is exhausted.
For Brass that default is hostile, for a reason specific to this game: a turn is
two actions, each of which can consume cubes from the board, drain a market,
flip an opponent's tile and spend money — and the second action is very often
chosen *because* of what the first one revealed. A player who realises after
their second click that they meant to build before selling has, under the
default, already lost the turn.

The framework does offer a turn-scoped undo stack. It is useless if the turn
ends the instant the last action lands.

## Decision

The engine never ends a turn by itself. When the action budget is spent — two
actions, or one in canal-era round one — or the hand empties, the engine sets
`awaitingCommit`, and from that moment the only legal move is `confirmTurn`.
Committing draws the hand back up to eight, advances to the next seat and, at
the end of a round, collects income and recomputes turn order by least spend.

## Consequences

- The turn-scoped undo stack becomes real. Everything done since turn start can
  be reverted right up until the commit, which is the entire user-visible
  benefit.
- `confirmTurn` is a move like any other, so it is enumerated like any other.
  That is what makes the gate free for every client: the browser shows one
  primary button, and an LLM that asks for legal moves is handed exactly one
  option. Neither had to be taught the rule.
- The turn machine gains a state.
  [game-transport](srn://brass/protocol/game-transport)'s `states.json` models
  `awaiting-commit` explicitly, and the commit edge is where income, redeal and
  reordering hang.
- **This engine now differs from the printed game in a way no rulebook
  mentions.** Anyone or anything told "you know Brass" will not know this. It is
  the first thing the MCP server's rulebook resource has to say, and it is why
  that resource exists at all.
- A player can stall indefinitely. There is no timer, no auto-commit and no
  turn clock, so a disconnected seat blocks the table forever. Acceptable among
  friends, unacceptable the moment the game is opened to strangers.
- Every client must handle the state where it is your turn and you have no
  actions left. Forgetting it produces a UI that looks frozen.

## Alternatives considered

- **Auto-end the turn on the last action.** The framework default. Fewer clicks,
  no undo, and a whole class of misclick that cannot be taken back.
- **A confirmation dialog before the second action.** Puts the friction before
  the decision rather than after it, and asks the player to predict a regret
  they have not had yet.
- **Undo after the turn ends.** Would have to unwind another player's already-
  broadcast state, or hold the turn open in a way indistinguishable from not
  having ended it. This is the same decision with a worse implementation.
- **A commit deadline that auto-commits.** Not rejected on merit — it is the
  obvious fix for the stalling consequence above — but deferred: it needs a
  clock in the engine, and the engine is pure by
  [0003-rules-as-shared-pure-package](srn://brass/adr/0003-rules-as-shared-pure-package).
