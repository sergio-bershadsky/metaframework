---
name: out-of-scope-v1
kind: requirement
version: 1
title: Recorded non-goals for v1
summary: Spectators, chat, accounts, ranked play and a native mobile app are declined on purpose, and stay declined until this record changes.
status: review
owner: sergio-bershadsky
requirement-type: functional
priority: wont
relations:
  uses:
    - /protocol/lobby-api
    - /protocol/game-transport
tags:
  - scope
---

Every one of these has been asked for, and every one has an answer. The point of
writing them down as a `wont` rather than deleting them is that the same request
arrives again next month and deserves a recorded answer rather than a blank
catalog.

The list is the design spec's own, unchanged: **AI opponents, spectators, chat,
persistent accounts, ranked play, mobile-native**.

## Acceptance criteria

- **AC-1** No component implements a spectator mode; a non-seated observer cannot connect to a match at all.
- **AC-2** No chat surface exists in the client, and the framework's `chat` socket event is unused.
- **AC-3** There is no account store, no login, and no identity that outlives a single match.
- **AC-4** There is no rating, ladder or match history, so no game outcome is recorded anywhere after the match ends.
- **AC-5** There is no native mobile build; the browser client is the only client a human uses.
- **AC-6** No component in this catalog carries an `implements` edge to this requirement.

## Where these would have had to land

The two `uses` edges are not claims of implementation — AC-6 forbids that — they name
the two surfaces every declined item would have had to appear on, which is what makes
"declined" checkable rather than rhetorical.
[lobby-api](srn://brass/protocol/lobby-api) is the only place an identity is ever
established, so accounts and ranked play would begin there; its `join-match`
operation returning a per-match secret and nothing else is AC-3 in one line.
[game-transport](srn://brass/protocol/game-transport) is the only live channel, so a
spectator connection and a chat surface would both be channels on it; the framework's
`chat` event appearing in no channel of its `transport.yaml` is AC-2 in one line.

## Rationale

Each declined item costs something specific:

- **Spectators** would need a seat-less connection and a redacted view for a
  non-player, which is a second `playerView` and the most likely place a hidden
  hand would leak.
- **Chat** is a moderation surface. The players are in a voice call already.
- **Accounts** would put personal data in a hobby project's database and turn a
  restart-loses-games deployment into a data-loss incident.
- **Ranked play** needs persistence and an anti-abuse story, and both presuppose
  strangers.
- **Mobile-native** is a second client for the same rules, and the board does not
  fit a phone.

## The one that was reopened

**AI opponents** is on the original list and has been reopened from a different
angle. [0007-expose-the-game-over-mcp](srn://brass/adr/0007-expose-the-game-over-mcp)
does not build an AI; it opens a door for an external one, as an ordinary party
under the same authority as a human. The non-goal — an AI *inside* this system,
with privileged access to state — stands.

That distinction is the reason this record is worth keeping. Read as "no AI",
the decision looks reversed; read as written, it was honoured by finding a shape
that did not violate it.

## Out of scope

Nothing further. This entity is the out-of-scope list.
