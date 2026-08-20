---
name: match-summary
kind: datamodel
version: 1
title: Match summary
summary: The match metadata the lobby REST API returns — id, seats, timestamps — as boardgame.io defines it, not as this solution designed it.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - lobby
  - framework-shape
---

The document `GET /games/brass` and `GET /games/brass/:id` return. It sits at
solution level because **both** products consume it and **neither** owns it: the
browser lobby lists and joins rooms with it, and the MCP session discovers open
matches with it. No code in this repository constructs one.

That is the honest description of this model: it is boardgame.io's shape,
documented here because two of our components depend on it. Recording it as a
catalog entity is what makes the dependency on
[0001-boardgame-io-framework](srn://brass/adr/0001-boardgame-io-framework) visible
as a data contract rather than only as a library choice. It cannot be evolved by
us at all — a change here is a framework upgrade.

## Seat occupancy is inferred from a missing name

There is no `occupied` flag. A seat is free exactly when its `name` is absent,
and both consumers implement precisely that test — the client's `find((p) => !p.name)`
and the MCP session's identical predicate. It works, and it is worth writing down
because it is unobvious and it is load-bearing: a future feature that assigned
placeholder names to empty seats would make every room look full to both clients
at once.

`credentials` is stripped from this public view. The per-seat secret is returned
once, to the joiner, as
[match-credentials](srn://brass/datamodel/match-credentials@1) — that asymmetry is
the whole of the lobby's access control.

## What this model does not contain

The game itself. `players` here is framework seat metadata, entirely separate
from the [seat](srn://brass/product/play/component/rules/component/engine-core/datamodel/seat@1)
records inside the match state, which carry the colour, avatar, ready flag and
bot marker. Two parallel notions of "seat" exist, joined only by the player id
string, and that duplication is a direct consequence of
[0005-lobby-inside-game-state](srn://brass/adr/0005-lobby-inside-game-state): the
framework's seat reservation stayed, and the game's own lobby was built beside it
rather than on top of it.

The practical consequence: a name set here does not appear on the board until the
`sitDown` move runs, and the two can disagree.

## Timestamps

`created-at` and `updated-at` are epoch milliseconds, not RFC 3339 strings — the
framework writes `Date.now()`. Both clients pass them through untouched.
