---
name: seat
kind: datamodel
version: 1
title: Seat
summary: A lobby seat — whether anyone sits there, under what name and colour, and whether they have declared themselves ready.
status: review
owner: sergio-bershadsky
usage: both
abstract: false
tags:
  - lobby
---

# Seat

The lobby's whole data model. It lives on
[game-state](srn://brass/product/play/component/rules/component/engine-core/datamodel/game-state@1)
rather than in any server-side room registry, because
[0005-lobby-inside-game-state](srn://brass/adr/0005-lobby-inside-game-state) made
seating a game phase: two REST calls create the match and reserve a player slot,
and everything after that — sitting down, picking a colour, picking an avatar,
readying up, starting — is an ordinary boardgame.io move under the `lobby` phase,
adjudicated by the same authoritative server as a build.

That choice is what makes the lobby reconnect-safe for free. A reload replays the
same authoritative state; there is no separate lobby store that can disagree with
the match.

## The two-stage join, and why `joined` and `name` are separate

A player's `name` arrives with the lobby REST join, which reserves the slot and
issues
[match-credentials](srn://brass/datamodel/match-credentials@1). `joined` is set by
the in-game `sitDown` move over the socket. Between the two the seat is reserved
but not occupied, and `color` and `avatar` are still `null` — which is why both
are nullable rather than absent. The host's start gate is what forbids beginning
a game in that intermediate state.

Colour and avatar are first-come. Both the browser lobby and the MCP session pick
the first free value when none is requested; the MCP session additionally sets
`ai: true` through `sitDown`, and that flag is the single source of truth for the
client's bot badge. A human seat omits it.

## What the schema cannot say

Uniqueness. No two seats may share a `color` or an `avatar`, and that is enforced
in the `pickColor` and `pickAvatar` move handlers, not here. A duplicate would
make two players indistinguishable on the board — the colour is how every tile,
link and player strip is rendered.
