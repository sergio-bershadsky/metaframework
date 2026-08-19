---
name: decision
kind: datamodel
version: 1
title: Decision
summary: One unit of resource sourcing and every source that could satisfy it; zero candidates means the move is illegal.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - planning
---

# Decision

Exactly one cube, one barrel or one tile-sale, plus the full list of sources that
could satisfy it. The planners emit an array of these; the UI walks it; and the
three counts it can take mean three different things:

| candidates | meaning                                  | UI behaviour                       |
| ---------- | ---------------------------------------- | ---------------------------------- |
| 0          | the unit is **unsatisfiable**            | the move is illegal — never offered |
| 1          | `forced: true`                            | apply silently, never prompt        |
| 2 or more  | a real choice                             | prompt                              |

That table is the whole content of
[0005-prompt-only-real-choices](srn://brass/product/play/adr/0005-prompt-only-real-choices),
and `forced` exists so the caller does not have to recompute
`candidates.length === 1` to honour it. A wizard that prompts on a forced
decision is not merely noisy: in a game where a build can consume four cubes it
turns a single click into five.

## `need` is always 1, and that is not redundant

The field is a `const 1`. One decision covers exactly one unit, and a move
requiring three coal produces three decisions, not one with `need: 3`. That is
deliberate: coal re-measures "nearest connected mine" *per cube*, and the market
price rises *per cube*, so the second cube's candidate set genuinely differs from
the first's. Collapsing them would lose exactly the information the planner
exists to produce.

The planners model that depletion honestly — they simulate consumption on a local
clone, so the Nth decision reflects the first N-1 already having been taken.

## Ordering is a contract

Decisions are index-aligned to the units they cover, and
[move-decisions](srn://brass/product/play/component/rules/component/move-enumerator/datamodel/move-decisions@1)
groups them by resource. The `merchant` array is index-aligned to the sale's
`tile-ids`. A caller that reorders them will hand the engine picks for the wrong
units, and because
[candidate](srn://brass/product/play/component/rules/component/move-enumerator/datamodel/candidate@1)
identity is validated per unit, most such mistakes surface as an `INVALID_MOVE`
rather than as a wrong-but-accepted move. Most, not all.

## Why a beer decision may deliberately omit a source

For a sale with several possible merchants, the planner refuses to offer the
merchant's free barrel at all. The merchant is chosen *after* beer in the prompt
queue, so binding a provisional merchant's barrel would let the player then
switch merchants — and the engine would reject the now-stale pick by identity.
With one accepting merchant the barrel is offered; with several the engine still
auto-uses it when brewery beer runs short. The candidate list is therefore not
"every source that exists" but "every source it is safe to let the player commit
to at this point in the sequence".
