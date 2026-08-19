---
name: game-state
kind: datamodel
version: 1
title: Game state
summary: The complete single match document the server owns, mutates and broadcasts — lobby, board, players, markets, deck and log.
status: review
owner: sergio-bershadsky
usage: both
abstract: false
tags:
  - aggregate
  - board-state
---

# Game state

One document, one match. This is boardgame.io's `G` for the Brass game, and it is
simultaneously the storage record, the wire payload and the input to every rule.
It has no sub-aggregates and no identity of its own — the match id lives outside
it, in the framework's match metadata.

It is worth being explicit about how much this one model carries, because it is
the reason several other decisions look the way they do:

- **It is the lobby too.** `seats`, `host-id`, `started` and `seat-count` are
  here rather than in a room registry, per
  [0005-lobby-inside-game-state](srn://brass/adr/0005-lobby-inside-game-state).
  Seating is a game phase; a reload replays the same authoritative state.
- **It is the whole board.** `tiles`, `links`, `merchants`, the two market counts
  and the deck. There is no separate board projection anywhere: the flat SVG
  renderer and the MCP state view are both derived from this.
- **It is broadcast in full, every time.** `deltaState` is unset on the server, so
  each update carries a complete copy. That is why the client has to reconstruct
  "what just happened" by diffing consecutive snapshots — see
  [game-deltas](srn://brass/product/play/component/web-client/component/animation/datamodel/game-deltas@1).
- **It is stored in process memory.** The framework's `InMemory` map, per
  [0006-in-memory-match-storage](srn://brass/adr/0006-in-memory-match-storage).
  That is what pins the deployment to a single replica and ends every live game
  on release.

## Redaction is the only thing between this and cheating

Each recipient's copy passes through `playerView`, which rebuilds `players` and
replaces every *other* seat's `hand` with placeholders
`{ id: "hidden-<player-id>-<index>", type: "location" }`. Nothing else is
redacted, and nothing else needs to be: `deck` order is the one remaining secret
and it is shipped whole — a client that reads it can see the future.

That is a real, currently accepted exposure and it is worth naming rather than
implying: hand identity is protected, deck order is not. See
[hidden-hands](srn://brass/requirement/hidden-hands), whose acceptance criteria
speak about hands specifically.

## The turn machine, as fields

`round`, `actions-this-turn`, `awaiting-commit` and `order` are the turn state.
The pairing that matters is `awaiting-commit`: an action does *not* end a turn.
Once the budget is spent the state sits in `awaiting-commit`, and the only legal
move is `confirmTurn` — recorded in
[0001-turn-commit-gate](srn://brass/product/play/component/rules/adr/0001-turn-commit-gate).
The enumerator honours it absolutely: with `awaiting-commit` set,
`enumerateLegalMoves` returns exactly one move regardless of anything else in
this document.

`order` is rebuilt at each round end, ascending by each player's `spent`.

## Markets are counts, not arrays

`coal-market` is the number of cubes on a 14-space track (setup 13, prices £1 to
£7 two spaces each, £8 when empty); `iron-market` is the same over 10 spaces
(setup 8, £1 to £5, £6 when empty). Cubes always occupy the most expensive
spaces, so a single integer determines every price — buying takes the cheapest
occupied space and the price rises, selling fills the most expensive empty one.
Modelling them as counts rather than arrays is what makes market pricing a pure
function of this document.

## Ending

`ended`, `winner` and `winners` are set together when the rail era finishes.
`winners` is the authoritative list: length 1 for a sole winner, longer for a
shared victory when the leaders tie on all three keys — victory points, then
income **level**, then money. `winner` is `winners[0]`, kept only for
single-winner consumers, and reading it alone silently discards a draw.

## Spelling

Property names here are the catalog's kebab-case normalisation of the
TypeScript `BrassG` interface, whose identifiers are camelCase (`hostID`,
`actionsThisTurn`, `coalMarket`, `nextTileId`). The shape, the cardinalities and
the semantics are identical; only the spelling is the catalog's.
