---
name: 0005-prompt-only-real-choices
kind: adr
version: 2
title: Prompt only when the choice is real
summary: A resource decision with one candidate is taken silently; only decisions with two or more distinct options reach the player.
status: review
owner: sergio-bershadsky
decision-status: accepted
date: "2026-07-17"
deciders:
  - sergio-bershadsky
relations:
  uses:
    - /product/play/component/rules/component/move-enumerator/datamodel/decision@2
tags:
  - ui
  - interaction
---

## Context

Brass makes the player source every cube and barrel a move consumes, and the
sourcing rules are genuinely interesting: coal comes from the nearest connected
mine or, if none is reachable, from the market at a price that rises as it
drains; iron comes from any works or the market; beer for a sale may be the
seller's own, an opponent's, or a merchant's — and a merchant barrel fires a
bonus. Which one you spend matters.

It matters, however, only *sometimes*. A build in a city with one reachable coal
source and two cubes to place raises two decisions with one possible answer
each. An interface that asks anyway turns a two-click action into a six-click
one and trains the player to click through prompts without reading them — which
is precisely the habit that makes the rare real choice go wrong.

## Decision

The planner returns one
[decision](srn://brass/product/play/component/rules/component/move-enumerator/datamodel/decision@2)
per unit consumed, each with its full candidate list. A decision is shown to the
player **iff it has more than one candidate**. Forced decisions are taken
silently, and a decision with zero candidates means the move is not playable
rather than that a question needs asking.

The same rule governs cards: the discard picker opens only when more than one
*distinct card face* is eligible. Three copies of one location card are one
choice, not three.

## Consequences

- The common path stays short. Most builds and most links dispatch with no
  sourcing prompt at all, and the prompts that do appear are worth reading.
- The rule is one pure predicate, `candidates.length > 1`, applied by a queue
  builder — so "did we ask too much?" is a unit test, not a design review.
- The interface never asks a question whose answer it already knows, and never
  answers one the player should have. Both halves are needed: silently
  auto-picking a *real* choice would spend an opponent's barrel, or a merchant's
  with its bonus, without consent.
- The engine keeps its own auto-sourcing heuristic for callers that supply
  nothing — the bot, and any omitted category. Two mechanisms therefore decide
  sourcing, and they must agree about what is legal even though they disagree
  about what is preferable.
- **The distinct-face rule is a judgement about identity, not about count.** It
  is right for interchangeable location cards and would be wrong the moment a
  card carried per-copy state; nothing enforces the distinction but this record.
- Cancelling costs nothing, because nothing is sent until the last question is
  answered — the whole composition is local until dispatch.

## Alternatives considered

- **Always prompt, for consistency.** Predictable, teachable, and the source of
  prompt blindness. Rejected on the grounds that consistency in an interface is
  a means, not an end.
- **Never prompt; always auto-source.** Simplest of all, and it removes a real
  decision from a game where that decision is part of the play — spending an
  opponent's beer is a tactical act, not a detail.
- **A single sourcing form showing every decision at once.** Fewer round trips
  and it cannot work: the beer available for a sale depends on which merchant is
  chosen for that tile, so some decisions are only knowable after earlier ones
  are answered. The queue exists because the dependency is real.
