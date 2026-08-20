---
name: player
kind: actor
version: 1
title: Player
summary: Human who takes a seat in a match from an invite link and plays it through the browser.
status: review
owner: sergio-bershadsky
actor-type: human
goals:
  - Take a seat from an invite link without creating an account.
  - Be offered only the moves the rules allow, and never have to check a rulebook mid-turn.
  - Finish a full two-era game with friends in one sitting.
relations:
  uses:
    - /product/play/component/web-client
tags:
  - player-facing
---

Anybody holding the invite URL `/play/:matchID`. There is no signup, no profile and
no persistent identity: a player is a name typed into one field plus a credential
string the server issues on join, cached in `localStorage` under
`brass:creds:<matchID>`.

## Why the role is this thin

The whole product is a friends-around-a-table game shipped to a browser. Every
feature that would need an account — ranking, history, friend lists — is a recorded
non-goal in [out-of-scope-v1](srn://brass/requirement/out-of-scope-v1). What a
player gets instead is the property that matters for a one-evening game: the link
is the identity, and a page reload rejoins the same seat because the credential
survives in local storage.

The limit of that design is recorded honestly on
[match-survives-refresh](srn://brass/product/play/requirement/match-survives-refresh):
a reload rejoins, a *server restart* does not, because match state lives in the
server process.

## The rule-enforcement promise

A player never composes an illegal move, because the client only draws the moves the
engine enumerated. This is not politeness — it is the same list the server will
adjudicate against, computed by the same code. The player-visible consequence is
that a slot you cannot build on is not clickable, and a card that cannot authorise
the build you picked is not offered.

## Not the same actor as the host

[host](srn://brass/actor/host) is a different role held by one of the players in
every match: the person who created the room and can start the game. One human
holds both roles for the whole match; they are separate actors because their goals
are different and the lobby phase distinguishes them by `hostID`.
