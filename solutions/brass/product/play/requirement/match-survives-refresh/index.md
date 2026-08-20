---
name: match-survives-refresh
kind: requirement
version: 1
title: A reload rejoins the same seat
summary: Refreshing the page returns a player to their own seat mid-game; a server restart does not, and that boundary is stated.
status: review
owner: sergio-bershadsky
requirement-type: functional
priority: should
relations:
  uses:
    - /datamodel/match-credentials@1
    - /protocol/game-transport
tags:
  - resilience
  - client
---

Browsers reload. A tab crashes, a laptop sleeps, someone hits F5 out of habit —
and in a game that runs for an hour with no accounts, losing a seat to any of
those would be fatal to the session.

The mechanism is the credential stored under `brass:creds:<matchID>` when the
seat was claimed. On reload the client reads it back and re-syncs the socket for
that seat; the server still holds the match, so the player rejoins a game in
progress with no visible discontinuity.

## Acceptance criteria

- **AC-1** Reloading `/play/<matchID>` in the same browser profile rejoins the same seat, with the same colour, avatar and hand, mid-game.
- **AC-2** The rejoining client receives a full authoritative state on sync and does not need to reconstruct anything from before the reload.
- **AC-3** A player who reloads on their own turn keeps the turn, including any actions already taken and the live undo stack.
- **AC-4** **A server restart does not preserve anything.** Match state lives in the process, so a restarted server has no match to rejoin and every seat is lost.
- **AC-5** Opening the invite link in a different browser profile with no stored credential offers a free seat, not the seat held by the first profile.

## Rationale

AC-4 is the reason this is a `should` and not a `must`, and it is written as a
criterion rather than a caveat so that the boundary cannot be read as an
implementation gap. It follows directly from
[0006-in-memory-match-storage](srn://brass/adr/0006-in-memory-match-storage) and
is lifted only by moving storage to Postgres.

AC-3 is worth testing separately because it is the case where a reload is most
valuable and most likely to be wrong: the undo stack is turn-scoped framework
state, not game state, and the client must not assume it survived.

## Known defect

Because the credential key is the match id alone, a **second tab** of the same
profile is indistinguishable from a reload and takes over the same seat. AC-5
covers a different profile; the same-profile case is the collision recorded on
[match-credentials](srn://brass/datamodel/match-credentials@1).

## Out of scope

Reconnection for the MCP seat, which has no persistence at all — see
[long-running-reconnect](srn://brass/product/agent-play/requirement/long-running-reconnect).
