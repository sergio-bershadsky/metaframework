---
name: action-flow
kind: component
version: 3
title: Action flow
summary: The interaction machinery that narrows the engine's legal-move list down to exactly one dispatch.
status: review
owner: sergio-bershadsky
component-type: ui
lifecycle: released
relations:
  uses:
    - /environment/production
    - /environment/local
    - /protocol/legal-move-api
    - /product/play/component/rules/component/bgio-game/datamodel/move-choices@1
  exposes:
    - /product/play/component/web-client/component/action-flow/protocol/action-composition
  depends-on:
    - /product/play/component/rules/component/move-enumerator
  implements:
    - /requirement/legal-move-enforcement
  realizes:
    - /capability/legal-move-offering
tags:
  - interaction
---

`actionFlow.ts`, plus the composition state held in `GameView` and the prompts in
`SourcePrompt` and `SellWizard`. It converts clicks into exactly one legal move.

## Filter, never recompute

Every function in `actionFlow.ts` takes a `LegalMove[]` and returns a subset or a
projection of it. `buildSlotTargets` collects the slots that have at least one legal
build; `eligibleCardsForSlot` unions the `eligibleCards` of the builds at one slot;
`industriesForSlotCard` narrows those by the chosen card; `buildMoveFor` resolves the
final triple to the single move object that will be dispatched. There is no branch
anywhere that decides a rule.

That is the design claim, and it is testable: this file contains no arithmetic about
cost, no reachability check, no market lookup. If it did, the client would have a
second opinion about legality and the whole "one engine" story would be a slogan.

## The composition order, and why it is map-first

The player clicks the *board* first and the *card* second. Click a slot → the legal
builds there are known → the cards that authorise any of them are offered → if the
chosen card allows more than one industry, ask which. Network is the same shape:
click an edge → resolve to the network move with the *fewest* edges, so a single
click means a single link → offer the eligible cards.

Choosing the fewest-edge move is the reason double rail needs an explicit branch:
`doubleRailMovesForEdge` and `secondEdgeTargets` exist so a player who wants the
two-link rail action can opt into it and be shown exactly which second edges the
enumerator already gated on having two links, £15 and a beer available.

## Prompt only where there is a real choice

Resource sourcing goes through the planners. A `Decision` with one candidate is
`forced` and is never shown; a decision with several is a prompt. The rule the whole
prompt layer is built on is that a player is interrupted only when the answer is not
determined — which is what keeps a build that needs four coal from becoming four
dialogs when all four cubes have one legal source.

The picks are collected into a `move-choices` structure and sent with the move. The
server re-validates every one of them by identity against a freshly replanned
candidate set, so a stale pick is rejected rather than being applied to some other
source. Candidate identity is deliberately `kind` plus tile id plus city only —
price, owner and bonus are incidental, and including them would make a pick fail for
a price change that does not affect which cube is taken.

## Develop and Sell are not in here

Develop dispatches from the player mat's multiset picker, and Sell from its own paged
wizard. Both bypass this machinery entirely, which is a fact about the code rather
than an aspiration about it: the composition machine covers Build, Network and the
three single-card actions, and the two exceptions are modelled as workflows of
[action-composition](srn://brass/product/play/component/web-client/component/action-flow/protocol/action-composition)
rather than pretended into its state chart.
