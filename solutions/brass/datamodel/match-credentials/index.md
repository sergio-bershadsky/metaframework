---
name: match-credentials
kind: datamodel
version: 2
title: Match credentials
summary: The per-seat secret issued once at join, cached client-side, and presented on every move for the rest of the match.
status: review
owner: sergio-bershadsky
usage: both
abstract: false
tags:
  - lobby
  - security
---

This is the entire authentication model of the product. There are no accounts, no
sessions and no tokens with an expiry: joining a seat returns an opaque secret,
and presenting it is what proves you are that seat for the rest of the match.
That is deliberate, and it is what
[no-account-play](srn://brass/requirement/no-account-play) asks for — a player
follows an invite link, types a name, and plays.

The server side of the check is the framework's: every move carries the
credential in its
[move-envelope](srn://brass/datamodel/move-envelope@1) payload and the master
compares it against the seat's stored value before applying anything. Nothing in
this repository implements it, which is one of the substantial things
[0001-boardgame-io-framework](srn://brass/adr/0001-boardgame-io-framework) bought.

## Two independent caches

The browser stores this record in `localStorage` under `brass:creds:<match-id>`;
the MCP session holds it in memory for the life of the process. Both then survive
exactly as far as their store does, which is the difference between the two
products' reconnect stories:

- A browser reload finds the record and rejoins the same seat — that is
  [match-survives-refresh](srn://brass/product/play/requirement/match-survives-refresh).
- An MCP process restart loses it, and there is no path to recover the seat. That
  gap is [long-running-reconnect](srn://brass/product/agent-play/requirement/long-running-reconnect),
  currently unmet.

A server restart defeats both, because the match itself lives in process memory
([0006-in-memory-match-storage](srn://brass/adr/0006-in-memory-match-storage)).
The credential outlives the thing it authenticates against.

## A known collision, stated plainly

The browser key is **the match id alone**. Two tabs on the same match in the same
browser profile therefore share one entry: the second tab to join overwrites the
first tab's record, and both then act as the seat that joined last. This is not a
theoretical concern — opening a second tab to "watch" is the obvious thing a
player tries, and there are no spectators
([out-of-scope-v1](srn://brass/requirement/out-of-scope-v1)).

Keying by `<match-id>:<player-id>` would not fix it either, since the player id is
not known before the join. A fix means keeping a list per match and letting the
user pick, or scoping the key to a per-tab id.

## Not a bearer token for anything else

The credential authorises moves in one match and nothing more. It grants no
access to the lobby API, cannot create or delete matches, and is not checked by
any route this repository added — the server is framework configuration and
nothing else. There is no revocation, and no rotation.
