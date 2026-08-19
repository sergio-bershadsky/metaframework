---
name: edge
kind: datamodel
version: 1
title: Edge
summary: A printed connection between two board locations and the eras in which a link may be built on it.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - board-graph
  - static-data
---

# Edge

The static half of the network. An edge is a *possible* connection printed on the
board; a
[built-link](srn://brass/product/play/component/rules/component/engine-core/datamodel/built-link@1)
is a player's canal or rail actually placed on one. Thirty-nine edges: 30 usable
in both eras, 8 rail-only, 1 canal-only (Burton-on-Trent to Walsall).

An edge is **undirected** despite having `from` and `to`. Every consumer compares
both orderings, and the enumerator's move id sorts the endpoint pair before
joining it — that is what makes `network|a~b` and `network|b~a` the same move id.
Treating the pair as ordered anywhere would double-count the graph.

Note that an edge is not a city-to-city relation: `cannock` connects to
`northern` (a farm brewery), and `coalbrookdale` to `shrewsbury` (a merchant).
Locations of all three kinds live in one id namespace, and network reachability
runs over the whole thing.

## `also-connects` — one edge, three endpoints

Exactly one edge carries it: `kidderminster`–`worcester` also touches the
`southern` farm brewery. It is a genuine three-endpoint connection on the printed
board, and it changes two things a two-endpoint model would get wrong: link
scoring counts the third location's connection icons, and network presence
propagates through it. Because it is a single instance of a single special case
it is an optional property rather than a redesign of the edge into a hyperedge —
but any code that flattens edges into pairs and drops this field is quietly
wrong, in scoring and in legality both.

## `type` and era usability

`both` means canal-era and rail-era alike; `canal` and `rail` are era-exclusive.
`edgeUsableInEra` is the only reader. The canal-to-rail transition clears every
built link from the board, so era-exclusivity is about which edges are *offerable*
in the current era, never about what survives — nothing does.
