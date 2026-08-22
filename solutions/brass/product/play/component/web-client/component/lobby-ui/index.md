---
name: lobby-ui
kind: component
version: 4
title: Lobby UI
summary: Routing, room creation, seat claiming, credential storage, and the pre-game seating screen.
status: review
owner: sergio-bershadsky
component-type: ui
lifecycle: released
relations:
  uses:
    - /environment/production
    - /environment/local
    - /protocol/lobby-api
    - /datamodel/match-credentials@2
  depends-on:
    - /product/play/component/boardgame-io
  implements:
    - /requirement/no-account-play
  realizes:
    - /capability/table-formation
tags:
  - lobby
  - onboarding
---

`Home.tsx`, `PlayPage.tsx` and `Lobby.tsx` — everything between opening a link and
the host pressing start.

## Two REST calls, then it is a game

The whole pre-game path is: `createMatch` for the host, then `getMatch` plus
`joinMatch` for each joiner. `PlayPage` fetches the match, finds the first player
entry with no `name`, joins it with a name the user typed (or `Player N`), and stores
the returned credential. From that moment nothing else here is REST: seating,
colours, avatars, ready flags and the start itself are ordinary boardgame.io moves
in the `lobby` phase, adjudicated and broadcast like any other move.

That is the decision worth understanding about this component. There is no lobby
service, no room table and no matchmaking state — because seating was modelled as a
game phase, this component is a screen rather than a subsystem.

## Credential storage, and its known defect

Credentials are cached in `localStorage` under `brass:creds:<matchID>` and reloaded
on mount, which is what makes a page refresh rejoin the same seat. The key is the
match, not the seat — so two tabs of the same browser opening the same invite link
find the same entry and both act as the seat claimed first. That is a real defect on
this path; it is recorded on
[match-credentials](srn://brass/datamodel/match-credentials@2), where the shape that
causes it lives.

## Why the join is "first free seat" and not a chooser

`match.players.find((p) => !p.name)`. A joiner does not pick a seat; they take the
next empty one. It keeps the join to a single click after typing a name, which is the
whole point of
[no-account-play](srn://brass/requirement/no-account-play) — and it means a full room
fails with `Room is full` rather than with a seat conflict.

The only place the framework's `players` array leaks into this solution's UI is
right here, in that `find`. Everything downstream reads seats from the game state
instead.
