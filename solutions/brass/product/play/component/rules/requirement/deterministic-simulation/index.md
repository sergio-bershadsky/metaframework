---
name: deterministic-simulation
kind: requirement
version: 1
title: A seed and a player count reproduce a game exactly
summary: The engine's only source of randomness is the framework's seeded RNG, so a failing game replays move for move.
status: review
owner: sergio-bershadsky
requirement-type: non-functional
priority: should
relations:
  uses:
    - /environment/local
tags:
  - testing
  - determinism
---

# A seed and a player count reproduce a game exactly

A rules engine that cannot replay a failure is a rules engine whose failures are
anecdotes. Brass has a deep state space — two eras, four players, a shuffled
deck, market prices that move as cubes drain — and a bug that appears once in
several hundred bot games is only fixable if that game can be run again.

The property is bought by purity. `@brass/rules` is framework-free and
side-effect-free by
[0003-rules-as-shared-pure-package](srn://brass/adr/0003-rules-as-shared-pure-package);
the single source of randomness is the framework's seeded `ctx.random`, which
lives on the far side of the boardgame.io binding.

## Acceptance criteria

- **AC-1** Two runs with the same player count, the same seed and the same move sequence produce byte-identical final state.
- **AC-2** The engine calls no wall clock, no `Math.random`, no environment variable and no I/O; every non-determinism enters through `ctx.random`.
- **AC-3** The canal-to-rail reshuffle draws from `ctx.random` and is therefore part of the reproducible sequence, not an independent shuffle.
- **AC-4** A failing bot run can be re-run from its recorded seed and player count and fails the same way.
- **AC-5** Object identity and key order never affect an outcome — nothing in the engine iterates a map and depends on insertion order for a rule.

## Rationale

AC-2 is the criterion with teeth, because it is the one a well-meaning change
breaks. A single `Date.now()` for a log timestamp, or a `Math.random()` for a
tie-break, would cost replay, the bot's reproducibility and the framework's
revert-on-`INVALID_MOVE` guarantee at the same time — the last because a
side-effecting handler cannot be rolled back by restoring state.

AC-5 is the subtle one. Turn order, iteration over seats and candidate ordering
all read objects keyed by player id; a rule that depended on enumeration order
would be deterministic in practice and undefined in principle.

## Measured where

Locally, in the [local](srn://brass/environment/local) environment, by the unit
suite and the bot validator. There is nothing to measure in production — the
property is a property of the code, and the environment edge names where the
check runs rather than where the property matters.

## Out of scope

Replay of a *live* match from the server. There is no trajectory store; the
proposal for one is
[0003-curate-at-read-never-delete](srn://brass/product/agent-play/adr/0003-curate-at-read-never-delete),
and this requirement is what would make such a store replayable at all.
