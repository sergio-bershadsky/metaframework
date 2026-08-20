---
name: legal-move
kind: datamodel
version: 1
title: Legal move
summary: One rule-legal move, tagged by kind, carrying its target and every hand card that could authorise it.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - union
  - rules
---

The most important contract in the architecture. `enumerateLegalMoves(G, playerID)`
returns an array of these, and three independent consumers spend it: the browser
UI narrows it into clickable affordances, the MCP session offers it to a model as
a list of ids, and the bot validator plays it to prove the engine accepts
everything the enumerator emits.

Because all three compile against the same TypeScript union, a change to this
shape breaks them at build time rather than at play time. That is the whole
argument of
[0003-rules-as-shared-pure-package](srn://brass/adr/0003-rules-as-shared-pure-package),
and the reason the client is forbidden from re-deriving legality —
[0001-narrow-never-recompute](srn://brass/product/play/component/web-client/adr/0001-narrow-never-recompute).

## The tag and the eight branches

A discriminated union on `kind`, one branch per action the game defines plus the
turn-commit gate:

| `kind`         | payload                                | notes                                                       |
| -------------- | -------------------------------------- | ----------------------------------------------------------- |
| `build`        | `city`, `slot-index`, `industry`       | one entry per legal (city, slot, industry) triple            |
| `network`      | `edges`                                | one or two edges; two only in the rail era                   |
| `develop`      | `industries`                            | one or two industries, possibly the same one twice          |
| `sell`         | `tile-ids`                              | one tile per entry as enumerated today                      |
| `loan`         | none                                    | offered while income level minus 3 stays above -10          |
| `scout`        | `cards` (exactly 3)                     | illegal while already holding a wild                        |
| `pass`         | none                                    | always legal                                                |
| `confirm-turn` | none                                    | the **only** move offered while `awaiting-commit` is set     |

`confirm-turn` is not an action and takes no card — it is the gate from
[0001-turn-commit-gate](srn://brass/product/play/component/rules/adr/0001-turn-commit-gate).
When it appears it appears alone.

## `eligible-cards` is the invariant worth protecting

Every action discards exactly one card, but *which* card is usually the player's
free choice: network, develop, sell, loan, scout and pass accept any hand card,
and build accepts any card whose face authorises that city or industry. So each
enumerated move carries the full list of authorising card ids, and `card-id` is
merely the default.

Two properties of that list are load-bearing and neither is expressible in
schema:

1. **It is ordered non-wild-first.** Wilds are scarce — mintable only by Scout,
   from a pool of four each — so spending one where an ordinary card would serve
   is strictly worse.
2. **Element 0 is `card-id`.** The default is therefore always the cheapest
   correct choice, and a consumer that ignores `eligible-cards` entirely still
   plays well. The bot does exactly that.

Break the ordering and nothing fails a test; the bot simply starts burning wilds.

## Deduplication, and why identical-looking moves collapse

Moves that differ only in which interchangeable card they spend are collapsed
into one entry keyed by a semantic identity — the same key the MCP surface
publishes as a move id
([move-option](srn://brass/product/agent-play/component/mcp-server/datamodel/move-option@1)).
`network` sorts each edge's endpoints and then sorts the edge list, `develop` and
`sell` sort their arrays, and `build` keys on city, slot and industry. Two entries
in one enumeration therefore never share an id, which is what makes selection by
id safe.
