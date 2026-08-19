---
name: 0001-narrow-never-recompute
kind: adr
version: 1
title: The client narrows the engine's move list and never re-derives legality
summary: Map-first interaction is a filter over enumerateLegalMoves, not a client-side reimplementation of the build rules.
status: review
owner: sergio-bershadsky
decision-status: accepted
date: "2026-07-19"
deciders:
  - sergio-bershadsky
relations:
  uses:
    - /protocol/legal-move-api
tags:
  - client
  - rules
---

# The client narrows the engine's move list and never re-derives legality

## Context

The action bar redesign inverted the order in which a player supplies input.
The old flow asked for a card first and then a target; the new one is map-first
— click a slot, then choose which card pays for it, then, only if the card is
ambiguous, which industry.

That inversion looks like it needs new legality logic. To highlight buildable
slots before a card is chosen, the client seemingly has to answer "could *any*
card build here?", which is a question the engine answers with several hundred
lines of network reachability, market pricing, overbuild rules, era gating and
mat state.

## Decision

It needs none of it. `enumerateLegalMoves(G, playerID)` already returns every
legal move annotated with `eligibleCards` — the full set of hand cards that
would authorise that exact action at that exact target — with `cardId` as merely
the default pick. So the new order is not new logic; it is a different order of
narrowing the same authoritative list:

```
enumerateLegalMoves ─filter by slot/edge─▶ ─filter by card─▶ ─filter by industry─▶ one move ─▶ commit
```

The client filters. It never asks whether something is legal; it asks whether the
enumeration contains it.

## Consequences

- Build, network and develop legality **cannot** drift between client and
  engine, because the client holds no second opinion to drift from. This is the
  strongest correctness property in the UI and it costs nothing to maintain.
- The narrowing helpers are pure functions over `LegalMove[]` with no React and
  no state, so the whole interaction layer is unit-testable without a browser.
- The client is bound to the shape of `LegalMove` far more tightly than to the
  engine's behaviour. Adding a field is free; changing `eligibleCards`'
  ordering, or collapsing moves differently, breaks the UI immediately — which is
  the right trade, because it breaks at compile time or in a unit test rather
  than in a game.
- A target the enumerator does not offer is simply not clickable. There is no
  "why can't I build here?" affordance, and the honest reason is that the client
  does not know — only that nothing was offered. That is a real usability cost of
  this decision.
- The same list, unfiltered, is what
  [mcp-surface](srn://brass/product/agent-play/component/mcp-server/protocol/mcp-surface)
  hands to a model. Human and agent are narrowing the identical set, which is why
  [legal-move-enforcement](srn://brass/requirement/legal-move-enforcement) can be
  stated once for both.
- The enumerator becomes the bottleneck for UI expressiveness. Any affordance the
  interface wants must first exist as an enumerated move, so a UI feature can
  require an engine change — and that is the cost that buys the guarantee.

## Alternatives considered

- **Recompute buildable slots and eligible cards client-side in the new order.**
  The obvious implementation. It duplicates engine rules in a second language of
  the same language, and every future rule fix would have to be made twice.
  Rejected in the design spec, explicitly.
- **Ask the server per interaction.** Correct and unusable at hover latency; it
  would also make the board's highlights depend on the network.
- **Enumerate per-card as the player picks.** Would have preserved the old
  card-first order and lost the map-first interaction, which was the point of the
  redesign.
