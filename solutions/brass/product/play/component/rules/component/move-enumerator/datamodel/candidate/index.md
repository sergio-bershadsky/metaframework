---
name: candidate
kind: datamodel
version: 1
title: Candidate
summary: One source a required cube, barrel or sale could be satisfied from — a board tile, a market, or a merchant destination.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - planning
---

A single selectable option for a single unit. The planners produce them; the
sourcing UI renders them; the engine re-validates the player's pick against a
freshly computed set before applying anything.

`kind` splits into two, and the second does double duty:

- `board-tile` — a coal mine, iron works or brewery on the board. Carries
  `tile-id`, `city` and `owner-id`. Any owner's tile is fair game; consuming an
  opponent's mine is normal play.
- `market` — either the coal or iron market (carries `price`) **or** a merchant
  destination for a sale or a merchant barrel (carries `city` = the merchant's
  location id, and no price).

That overloading is worth naming: `kind: market` with a `price` and `kind: market`
without one are different things, distinguished only by which planner produced
them. It is the one place in this model set where the shape is looser than the
domain.

## Identity is three fields, deliberately

`sameCandidate` compares **`kind` + `tile-id` + `city`** and nothing else.
`price`, `owner-id` and `bonus` are incidental: they describe the candidate at
the moment it was planned, and they can be stale by the time the move is
dispatched. If price were part of identity, a pick made a moment before someone
else drained a mine would fail to match, and the player would see an
`INVALID_MOVE` for a choice that is still perfectly legal. If it were *not*
compared, a stale pick could resolve to a different source at a different price
than the one the player was shown.

Narrow identity, therefore, is what makes guided sourcing safe:
[move-choices](srn://brass/product/play/component/rules/component/bgio-game/datamodel/move-choices@1)
re-plans against live state and asserts every supplied pick is still a live
candidate by these three fields.

## `bonus`

Present only on a merchant-barrel candidate coming from the sell planner, and
only so the wizard can say "use the Gloucester barrel (+develop)" rather than an
anonymous "use merchant beer". It is the location's printed
[merchant-bonus](srn://brass/product/play/component/rules/component/engine-core/datamodel/merchant-bonus@1),
echoed for display. Because it is incidental to identity, a candidate that
carries it and one that does not are the same candidate.
