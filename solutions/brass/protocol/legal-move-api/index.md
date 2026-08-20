---
name: legal-move-api
kind: protocol
version: 1
title: Legal-move API
summary: The in-process enumerate-and-plan surface of @brass/rules that the browser, the MCP seat and the bot all call.
status: review
owner: sergio-bershadsky
style: request-response
participants:
  - alias: enumerator
    ref: /product/play/component/rules/component/move-enumerator
    role: provider
  - alias: action-flow
    ref: /product/play/component/web-client/component/action-flow
    role: consumer
  - alias: mcp
    ref: /product/agent-play/component/mcp-server
    role: consumer
tags:
  - rules
  - in-process
---

There is no wire here. This is a TypeScript module boundary — `import
{ enumerateLegalMoves } from '@brass/rules'` — and it is nevertheless the most
consequential contract in the solution, because it is the **one place three
independent surfaces agree about what a player may do**.

## Why an import deserves a protocol entity

Because the alternative was tried and rejected in writing. When the action bar
was redesigned, the obvious implementation was to recompute buildable slots and
eligible cards in the client, in the new location-first order. That was
[rejected](srn://brass/product/play/component/web-client/adr/0001-narrow-never-recompute):
it duplicates engine rules and invites drift. What shipped instead is a pure
narrowing of the list this API returns —

```
enumerateLegalMoves ─filter by slot/edge─▶ ─filter by card─▶ ─filter by industry─▶ one move ─▶ commit
```

— which means the client's notion of legality *cannot* diverge from the
engine's, because it never forms one.

The same list feeds `get_legal_moves` on
[mcp-surface](srn://brass/product/agent-play/component/mcp-server/protocol/mcp-surface)
and the bot validator that plays hundreds of full games in CI. Three consumers,
one enumeration, and
[enumerator-engine-parity](srn://brass/product/play/component/rules/requirement/enumerator-engine-parity)
is the standing proof that what the enumerator offers, the engine accepts.

## Placement is the interesting part

The consumers sit in three different places — `action-flow` deep inside the web
client, `mcp-server` in the other product, and the provider under
`rules`. Their common pair prefix is empty, so the protocol lands at the
solution root. That is exactly right and slightly uncomfortable: a
compile-time import between two workspace packages is modelled next to the HTTP
lobby, because architecturally it *is* the same kind of thing — a contract with
several consumers whose change breaks all of them at once. The difference is
only that here the breakage is a red squiggle at build time rather than a 500 in
production.

## The two halves of the surface

**Enumerate** — `enumerateLegalMoves(G, playerID)` returns every legal move as a
tagged union, each already annotated with `eligibleCards`: the *full set* of hand
cards that would authorise that exact action at that exact target. `cardId` is
only the default pick, and the ordering invariant is the load-bearing detail:
non-wild cards come first, so element 0 is a real card whenever one exists and a
naive consumer never burns a wild it did not have to.

Moves that differ only in which interchangeable card pays for them are collapsed
by an `agnosticKey`, so the list is a set of *decisions*, not a cross-product of
decisions and payments.

**Plan** — `planMoveChoices(G, playerId, move)` takes a
[planned-move](srn://brass/product/play/component/rules/component/move-enumerator/datamodel/planned-move@1)
and returns, per resource, one
[decision](srn://brass/product/play/component/rules/component/move-enumerator/datamodel/decision@1)
per cube, barrel or merchant tile the move consumes, each listing every
[candidate](srn://brass/product/play/component/rules/component/move-enumerator/datamodel/candidate@1)
that could satisfy it. A decision with zero candidates means the move is not
actually playable; a decision with one candidate is forced and must never be
shown to a human
([0005-prompt-only-real-choices](srn://brass/product/play/adr/0005-prompt-only-real-choices)).
`planSell` and `planSellTileBeer` are the sell-specific entry points the wizard
walks tile by tile.

## What the planner is not

It is advisory. Nothing the planner returns is binding: the engine re-plans
against live state when the move arrives and validates every supplied pick by
identity — kind, tile id and city only, deliberately ignoring price, owner and
bonus, so that a pick made against a stale board is rejected rather than
silently redirected. A caller that omits its picks entirely gets the engine's
auto-sourcing heuristic and a legal move either way.

## Artifacts

`transport.yaml` declares `kind: in-process`, the `@brass/rules` module, and the
four exported functions with their datamodels. There is no `states.json`: a
function call has no conversation state. `workflows/enumerate-and-plan.yaml` is
one call/return pair per function, which is a thin diagram on purpose — the
value of this protocol is in the shapes it moves, not in the order it moves them.
