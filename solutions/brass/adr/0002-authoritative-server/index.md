---
name: 0002-authoritative-server
kind: adr
version: 1
title: The server adjudicates every move
summary: Clients propose and may be reverted; only the server-side engine decides what a move does and whether it happened.
status: review
owner: sergio-bershadsky
decision-status: accepted
date: "2026-07-14"
deciders:
  - sergio-bershadsky
relations:
  uses:
    - /protocol/game-transport
tags:
  - foundation
  - authority
---

# The server adjudicates every move

## Context

Brass is a game about scarce shared resources. Coal and iron cubes sit on other
players' tiles and in two market tracks whose price moves as they are drained;
beer barrels are consumed from the board; merchant slots are spent. Almost every
interesting move reads state that another player may be changing at the same
moment, which makes "who decides?" the first question the architecture has to
answer.

The game also has hidden hands, and the project is played by friends over the
internet with no accounts and no reputation. A design where the client computes
outcomes and the server records them is not a security posture; it is a request
to be trusted.

## Decision

The server is the sole authority. A client sends a move *proposal* — a move name,
its arguments, its seat credentials and the `stateID` it was composed against —
and the server-side engine decides what happens. Clients apply moves
optimistically for responsiveness and are overwritten by the authoritative
broadcast that follows.

Concretely: every move handler runs inside the server process; an illegal move
returns `INVALID_MOVE`, which reverts every mutation the handler made and
produces no broadcast at all; each match has its own queue so moves are applied
one at a time; and a proposal carrying a stale `stateID` is dropped without
reply.

## Consequences

- There is no rejection message on the wire. A client learns its move failed by
  observing that nothing happened, which is only tolerable because the UI offers
  none but enumerated moves — see
  [0001-narrow-never-recompute](srn://brass/product/play/component/web-client/adr/0001-narrow-never-recompute).
  Any client that composed its own moves would need a real error channel, and
  there is none to give it.
- Optimistic application means a player can briefly see a state that never
  existed on the server. In practice this is invisible at the latencies the game
  runs at, and the correction is a full state replacement rather than a merge.
- Concurrency control is one integer. No locks, no transactions, no version
  vectors — `stateID` plus a per-match queue is the entire mechanism, and it is
  sufficient *only* because exactly one process holds the match
  ([single-writer-match-state](srn://brass/product/play/component/server/requirement/single-writer-match-state)).
- Handlers must be written to be revertible, not to be careful. They mutate and
  then bail out on `INVALID_MOVE`, relying on the framework's rollback. A
  handler that reached outside game state — logged, called out, cached — would
  break that silently, so nothing in the engine is allowed to have side effects.
- Adding a non-browser client costs nothing in trust. The MCP seat is another
  proposing client under the same authority, which is what makes
  [agent-cannot-cheat](srn://brass/product/agent-play/requirement/agent-cannot-cheat)
  a structural property rather than a promise.

## Alternatives considered

- **Client-authoritative with server validation after the fact.** Cheaper to
  build and it inverts the failure mode: the game continues from a wrong state
  until someone notices. Rejected.
- **Lock-step / deterministic peer simulation.** Attractive for a seeded engine
  and genuinely workable for the rules, but hidden hands kill it — a peer that
  simulates the game holds every hand.
- **Server authority with delta broadcasts (`deltaState`).** Not rejected on
  principle, just not taken: enabling it would cut bandwidth and remove the
  reason the client diffs consecutive states to animate. It stays off because
  full states are simpler to reason about, and the cost is one component
  ([animation](srn://brass/product/play/component/web-client/component/animation))
  reconstructing what the framework threw away.
