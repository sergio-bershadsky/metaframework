---
name: 0005-lobby-inside-game-state
kind: adr
version: 1
title: Seating is a game phase, not server infrastructure
summary: Colour, avatar, ready and host-start are moves in a lobby phase of the game, not lobby-server features.
status: review
owner: sergio-bershadsky
decision-status: accepted
date: "2026-07-14"
deciders:
  - sergio-bershadsky
relations:
  uses:
    - /protocol/lobby-api
    - /protocol/game-transport
tags:
  - lobby
  - foundation
---

## Context

Before a game of Brass can start, four things must be true that the board game
itself never mentions: everyone who intends to play is present, each has a
colour, each has an avatar, and each has said they are ready. Something has to
own that, and there were two candidates: the framework's match metadata, which
already has a players array with names and an opaque `data` field, or the game
state itself.

The pressure toward the first is that it is *there*, with REST routes already
mounted. The pressure toward the second is that presence in a board game is not
a technical detail — who is seated determines turn order, deck size, merchant
setup and the length of an era.

## Decision

The lobby is the game's first phase. `BrassGame.phases.lobby` starts the match,
runs with every seated client simultaneously active, and carries five moves:
`sitDown`, `pickColor`, `pickAvatar`, `toggleReady` and `hostStart`. Seat state
lives in `G.seats[playerID]` as a
[seat](srn://brass/product/play/component/rules/component/engine-core/datamodel/seat@1)
— joined, name, colour, avatar, ready, and an `ai` flag. `hostStart` transitions
the phase to `canalEra`.

The framework's lobby is used for exactly two things and no more: creating a
match and minting a seat credential.

## Consequences

- Seating rules are engine rules, unit-testable and adjudicated by the same
  authority as everything else. Two seats cannot hold the same colour because a
  move handler says so, not because a UI disabled a button.
- Real-time presence is free. The lobby screen updates through the same state
  broadcast as the game board; there is no second channel and no polling.
- Deck size, merchant setup and turn order read `seatedIDs(G)`, so a four-seat
  match played by two people is a two-player game in every rule that counts. The
  framework's `numPlayers` is a capacity, not a player count — a distinction
  worth stating because nothing in the code names it.
- **A seat is claimed twice**, once through `join-match` and once through
  `sit-down`, and the two can disagree. A client that gets its credential and
  then dies holds a framework seat the game never shows as joined, and nothing
  reaps it. That is the price of the split, and it is real:
  [long-running-reconnect](srn://brass/product/agent-play/requirement/long-running-reconnect)
  is the same defect seen from the agent's side.
- The framework's `update-player` route, which exists to set exactly this kind of
  metadata, is dead. Match metadata and game state therefore describe the same
  seats differently, and any tool reading the lobby API sees names but no
  colours, no readiness and no bot flag.

## Alternatives considered

- **Seat metadata in the framework's player `data` field.** It fits, and it
  would have kept the pre-game entirely out of the engine. Rejected because the
  rules need seated-ness: an engine that cannot see who is playing cannot build
  the right deck, and passing it in as `setupData` fixes the count at creation
  time, before anyone has arrived.
- **A separate lobby service.** A second process, a second store, a second
  authority, and a synchronisation problem between them — for a screen that
  exists for ninety seconds.
- **Start the game on a fixed seat count chosen at creation.** Simpler, and it
  makes the invite flow worse: the host would have to decide how many friends
  are coming before sending the link, and a no-show would strand the match.
