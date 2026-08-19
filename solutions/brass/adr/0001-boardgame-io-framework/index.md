---
name: 0001-boardgame-io-framework
kind: adr
version: 1
title: Build on boardgame.io
summary: Turn logic, server authority, secret state and seeded replay come from boardgame.io rather than from code we write.
status: review
owner: sergio-bershadsky
decision-status: accepted
date: "2026-07-14"
deciders:
  - sergio-bershadsky
relations:
  uses:
    - /product/play/component/boardgame-io
tags:
  - foundation
  - framework
---

# Build on boardgame.io

## Context

Brass: Birmingham is a hidden-information, turn-based game for two to four
players, with a strict turn order that is itself a game rule (least-spent goes
first), an eight-card hand nobody else may see, and a two-era structure that
reshuffles everything in the middle. A from-scratch multiplayer implementation
would have to build, before any Brass rule could be written: a match registry, a
seat-and-credential scheme, a socket transport with reconnect, per-match
serialisation of concurrent moves, per-player state redaction, and a seeded RNG
so that a game can be replayed.

None of that is Brass. All of it is the part of a multiplayer board game that is
tedious and easy to get subtly wrong, and it is exactly the part a single
developer working evenings cannot afford to spend the project's budget on.

## Decision

We build on **boardgame.io**. It supplies the `Game` shape (setup, phases,
moves, turn order, `endIf`), the authoritative master with per-match move
serialisation, the socket.io transport, the lobby REST API, seat credentials,
`playerView` redaction, and a seeded `ctx.random`. Our code supplies the Brass
rules and nothing else.

The framework is modelled as a component we do not own,
[boardgame-io](srn://brass/product/play/component/boardgame-io), so that the
things it provides appear in this catalog as decisions rather than as gaps.

## Consequences

- [server](srn://brass/product/play/component/server) is twenty-six lines: a
  `Server({ games, origins })` call and a port. The whole authoritative tier is
  configuration.
- Turn order, which is a *rule* in Brass, has to be expressed through the
  framework's `turn.order` hooks and manual `events.endTurn({next})` calls
  rather than as a plain function over player state. The engine drives turns
  explicitly for exactly this reason.
- We inherit the framework's storage default —
  [in-memory](srn://brass/adr/0006-in-memory-match-storage) — and its
  consequences, which are severe enough to need their own record.
- We inherit its lobby surface whole. Four routes are live and unused, and
  [lobby-api](srn://brass/protocol/lobby-api) enumerates them so that "unused"
  is written down rather than assumed.
- Package resolution is a permanent small tax: boardgame.io's subpath folders
  ship no `exports` map, so every consumer imports concrete
  `dist/cjs`/`dist/esm` files behind local `.d.ts` shims. Three packages carry
  such a shim.
- `INVALID_MOVE` gives us transactional move handlers for free — a rejected move
  reverts every mutation it made — and the engine leans on that hard enough
  that handlers deliberately mutate first and validate affordability last.

## Alternatives considered

- **Colyseus.** A strong room/state-sync framework, but it models state
  synchronisation, not turns. Turn order, phases, hidden state and replay would
  all have been ours to write, which is most of what we were trying to buy.
- **A hand-rolled Node server plus socket.io.** Maximum control, and the control
  was not the problem. It puts the entire authority-and-redaction surface —
  precisely where a cheating bug lives — into the least-reviewed code in the
  project.
- **Client-authoritative with a referee.** Rejected before it was designed. Once
  a client can compute state, hidden hands are a convention rather than a
  property, and [hidden-hands](srn://brass/requirement/hidden-hands) becomes
  unenforceable.
