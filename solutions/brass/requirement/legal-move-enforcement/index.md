---
name: legal-move-enforcement
kind: requirement
version: 1
title: No illegal move is ever accepted
summary: Every path into the game — browser, agent, or a hand-crafted socket frame — is adjudicated by the same engine and refused the same way.
status: review
owner: sergio-bershadsky
requirement-type: functional
priority: must
relations:
  uses:
    - /protocol/game-transport
    - /protocol/legal-move-api
tags:
  - rules
  - integrity
---

# No illegal move is ever accepted

A move is legal or it does not happen. The obligation binds every path: the
browser's action flow, the MCP seat, the bot validator, and anything else that
can open a socket and send a frame. There is no privileged client, and no client
is trusted to have filtered anything.

The mechanism is
[0002-authoritative-server](srn://brass/adr/0002-authoritative-server): handlers
run on the server, an illegal move returns `INVALID_MOVE`, and boardgame.io
reverts every mutation the handler made before returning. Handlers therefore
mutate first and validate affordability last, relying on that rollback — which
makes the guarantee structural rather than a matter of handler discipline.

## Acceptance criteria

- **AC-1** A move the engine refuses leaves game state byte-identical to what it was before the attempt, including markets, cubes, money and the tile counter.
- **AC-2** A move envelope carrying a `stateID` other than the current one is dropped, and no state is broadcast in response.
- **AC-3** An MCP `make_move` naming an id absent from a fresh enumeration applies nothing and returns `ok: false` with the current `legalIds`.
- **AC-4** A refused move produces no broadcast at all, so no other seat observes a state that was never adjudicated.
- **AC-5** A client that composes a move directly on the socket, bypassing the UI, is subject to exactly the same handler as the UI's own dispatch.
- **AC-6** Concurrent moves against one match are applied one at a time, so no two handlers observe the same state.

## Rationale

AC-4 is the criterion that shapes the whole client. Because a rejection produces
silence rather than a message, a client cannot distinguish "refused" from
"slow" — which is tolerable only because
[0001-narrow-never-recompute](srn://brass/product/play/component/web-client/adr/0001-narrow-never-recompute)
guarantees the UI never offers a move the engine would refuse. Any future client
that composes its own moves needs an error channel that does not exist yet.

AC-6 is not a general concurrency claim. It holds because exactly one process
owns the match
([single-writer-match-state](srn://brass/product/play/component/server/requirement/single-writer-match-state));
a second replica would break it silently.

## Out of scope

Whether a legal move is a *good* move. Nothing in this solution advises, warns,
or prevents a player from ruining their position.
