---
name: host
kind: actor
version: 1
title: Host
summary: Human who creates the room, holds seat 0, and decides when the table is complete enough to start.
status: review
owner: sergio-bershadsky
actor-type: human
goals:
  - Create a room and hand out exactly one link.
  - See who is seated, which colour they took and whether they are ready, before starting.
  - Start the game only once the table is complete.
relations:
  uses:
    - /product/play/component/web-client
tags:
  - player-facing
---

# Host

The player who clicked **Create session room**. The server issues them seat `0` and
the game state records `hostID: '0'`; from then on they are an ordinary
[player](srn://brass/actor/player) with exactly one extra capability — the
`hostStart` move.

## Why this is an actor and not a flag

The host has a goal the player does not: *deciding the table is complete*. That is a
judgement call no rule can make, because the engine happily starts a two-player game
and cannot know that a third friend is still opening the link. The whole lobby phase
— seats, colours, avatars, ready flags — exists to give the host enough information
to make that call, which is why it is modelled as a game phase rather than as server
infrastructure.

## The single link

The host's product is one URL. There is no invite mail, no room code, no
distinction between a private and a public room; the link *is* the access control,
and the first person to open it takes the first unnamed seat. The trade this makes
is stated in [no-account-play](srn://brass/requirement/no-account-play): friction is
zero and there is no way to eject a wrong joiner other than starting again.

## Known sharp edge

Credentials are cached per match, not per seat. Two tabs of the same browser opening
the same invite link find the same `brass:creds:<matchID>` entry and both become the
seat that was claimed first. That is a real defect on the join path rather than a
property of this role, and it is recorded where it belongs, on the
[match-credentials](srn://brass/datamodel/match-credentials@1) model.
