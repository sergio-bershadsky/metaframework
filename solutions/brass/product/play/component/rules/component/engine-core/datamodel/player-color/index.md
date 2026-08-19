---
name: player-color
kind: datamodel
version: 1
title: Player colour
summary: The four seat colours a player may claim in the lobby; one colour per seat, first come first served.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - vocabulary
  - lobby
---

# Player colour

`red`, `yellow`, `purple`, `teal` — the four physical player sets in the box, and
therefore the hard ceiling on seat count. The engine exports them as an ordered
`PLAYER_COLORS` tuple, and both seat-claiming paths walk that order to find a
free one: the browser lobby offers the untaken colours, and the MCP session's
`pickFreeColor` takes the first free one when the model expresses no preference.

Uniqueness is a game-state invariant, not a schema one: JSON Schema can say
"this seat's colour is one of four", it cannot say "no two seats share one". The
check lives in the `pickColor` lobby move, and the client renders every player's
strip, mat, tiles and links from this value — a duplicate would make two players
visually indistinguishable on the board.

## Why four is not negotiable

The value set and the supported seat range are the same fact seen twice.
[seat-count-2-to-4](srn://brass/requirement/seat-count-2-to-4) is stated in terms
of seats; this enum is what makes five impossible without new art. The colour is
nullable on a
[seat](srn://brass/product/play/component/rules/component/engine-core/datamodel/seat@1)
because a joined player has a name before they have a colour — the lobby's ready
gate is what forbids starting in that state.
