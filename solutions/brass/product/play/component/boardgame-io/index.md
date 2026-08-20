---
name: boardgame-io
kind: component
version: 2
title: boardgame.io
summary: The turn-based game framework this solution does not own — lobby REST, socket transport, storage, authority.
status: review
owner: sergio-bershadsky
component-type: external
lifecycle: released
relations:
  exposes:
    - /protocol/lobby-api
    - /protocol/game-transport
tags:
  - third-party
  - framework
x-version: ^0.50.2
---

# boardgame.io

An open-source turn-based game framework, described here as far as this solution's
boundary requires and no further. Without this node in the graph, "the server is
twenty-six lines" reads as a gap in the description instead of as the decision it is.

## Why a component and not an actor

Because things must point at it. `depends-on` and `uses` accept components,
products, datamodels, protocols and environments — never actors — so the moment
[server](srn://brass/product/play/component/server) and
[bgio-game](srn://brass/product/play/component/rules/component/bgio-game) need to
declare a structural dependency, the framework has to be a component. `external` is
exactly that: a node at the boundary, described locally, with no claim that this
solution understands or controls its insides.

## What it actually supplies

Five things, each of which would otherwise be a component in this catalog:

- **The lobby REST surface.** Every route under `/games` — create, list, fetch, join,
  leave, play-again, update-player — is the framework's, not ours. No repository code
  implements one, and only four of them are called.
- **The socket transport.** A socket.io server, the `/brass` namespace, and the
  `sync` / `update` / `matchData` event vocabulary.
- **Storage.** The `InMemory` match map that makes the server a single writer.
- **Serialisation of moves per match.** A per-match queue, so two simultaneous moves
  in one match are applied in a defined order rather than interleaved.
- **The credential check.** Per-seat credentials minted on join and verified on every
  move — this solution's entire authentication story.

It also supplies the transactional `INVALID_MOVE` semantics and the client-side
optimistic-then-authoritative behaviour, both described where they are used.

## Two components expose the same protocols, and that is not a mistake

Both this component and
[server](srn://brass/product/play/component/server) declare `exposes` toward
[lobby-api](srn://brass/protocol/lobby-api) and
[game-transport](srn://brass/protocol/game-transport). The two edges say different
things: the framework *defines* those surfaces, our server *serves* them at a
hostname. Reading only one of the two produces a false picture — either that we wrote
a REST API we did not, or that the framework is deployed somewhere it is not.

## What is deliberately not described

Its internal turn scheduling, its plugin system, its React bindings' render
behaviour, and its storage adapters other than `InMemory`. Where any of those matter
they are restated as obligations on this solution's side — the single-writer
requirement exists precisely because this component's storage default is a process
map.

`external` components own no sub-components, which is the framework's way of saying
the same thing: we describe the boundary, not the inside.
