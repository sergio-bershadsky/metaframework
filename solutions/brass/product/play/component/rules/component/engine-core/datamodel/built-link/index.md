---
name: built-link
kind: datamodel
version: 1
title: Built link
summary: A canal or rail token a player has placed on one printed edge, joining two board locations into their network.
status: review
owner: sergio-bershadsky
usage: both
abstract: false
tags:
  - board-state
  - network
---

# Built link

The dynamic half of the network: a player's token on one of the 39 printed
[edge](srn://brass/product/play/component/rules/component/engine-core/datamodel/edge@1)
connections. Extends
[owned-piece](srn://brass/product/play/component/rules/component/engine-core/datamodel/owned-piece@1)
with the pair of endpoints and which era's token it is.

`a` and `b` are the endpoint ids, and like the underlying edge they are
**undirected**: every consumer tests both orderings, and the enumerator sorts the
pair before building a move id. An edge may hold at most one link, by anybody —
links are not per-player parallel tracks.

## The link is what "network" means

Almost every legality question in the game reduces to reachability over these
tokens plus your tiles:

- **Presence.** You may build only in your own network once you have any tile or
  link on the board; before that, anywhere a card authorises.
- **Coal.** Sourced from the *nearest connected* unflipped mine, any owner. If no
  board coal is reachable, you may buy from the market — but only if the location
  is connected to a merchant.
- **Beer.** Your own brewery needs no connection; an opponent's does.
- **Selling.** The tile must be connected to a merchant that accepts the good.

Iron is the exception that proves the pattern: it needs no connection at all,
from any works or from the market.

Because `also-connects` on the underlying edge adds a third location, a single
link can join three places at once — that one instance is load-bearing for both
scoring and reachability.

## `kind` and the era wipe

`kind` records whether this is a canal or a rail token, and it always equals the
era in which it was built. Its lifetime is short: **every link is removed from the
board at the canal-to-rail transition**, so a rail-era board starts with no
network whatsoever and presence is re-established from tiles alone. A consumer
holding link ids across the transition is holding stale references, and the
animation layer's diff will report the entire link set as gone in one step.
