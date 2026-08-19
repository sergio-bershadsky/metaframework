---
name: action-composition
kind: protocol
version: 1
title: Action composition
summary: How a player turns clicks on the map, a card and an industry into exactly one of the moves the engine already offered.
status: review
owner: sergio-bershadsky
style: request-response
participants:
  - alias: player
    ref: /actor/player
    role: initiator
  - alias: flow
    ref: /product/play/component/web-client/component/action-flow
    role: responder
tags:
  - ui
  - interaction
---

# Action composition

The conversation between a human and the interface that stands between them and
a move. It is a protocol and not merely a component's internals because it has
two participants with genuinely different knowledge: the player knows what they
want, the flow knows what is legal, and every step is the flow narrowing the
second until only one of the first remains.

## Placement

The only component participant is
[action-flow](srn://brass/product/play/component/web-client/component/action-flow)
— actors are excluded from the nearest-common-ancestor computation — so the
protocol sits in that component's own bucket. If a second component ever
participates (a mobile shell, a replay scrubber), this directory moves up, and
that move would be the signal that the interaction contract had become shared
rather than private.

## The invariant that makes it safe

Every state in `states.json` is a **filter over one authoritative list**, never a
computation of its own. The player clicks a slot; the flow keeps the enumerated
moves at that slot. They click a card; it keeps the ones that card authorises.
They click an industry; one move remains and it is dispatched. At no point does
the client ask "may they build here?" — it asks "is there an enumerated move
here?", which is a different and much cheaper question, and it is the reason
build/network/develop legality cannot drift from the engine
([0001-narrow-never-recompute](srn://brass/product/play/component/web-client/adr/0001-narrow-never-recompute)).

## Where the machine deliberately stops

Three real interactions are **not** in this machine, and the omissions are
informative:

- **Develop** opens a multiset picker over the player mat and dispatches
  directly. It never enters the flow, because there is no map target to pick and
  no card ambiguity worth a state.
- **Sell** runs a paged wizard with its own local state, modelled here as
  `workflows/sell-wizard.yaml` rather than a second `states.json` — a protocol
  owns exactly one machine, and the wizard is a sequence, not a lifecycle.
- **Confirm turn** is never a flow at all. It is a single primary button that
  appears while `awaitingCommit` is set, and it is deliberately absent from the
  action bar's kind buttons so that "end my turn" can never be mistaken for an
  action ([0001-turn-commit-gate](srn://brass/product/play/component/rules/adr/0001-turn-commit-gate)).

The machine also has no final state. A turn ends by leaving it — `TURN_ENDED`
returns to `idle` — because the flow outlives any single action and is reset,
not completed.

## Sourcing is a queue, not a form

Once a move is chosen, `dispatching` asks the planner what the move would
consume. Decisions with a single candidate never surface: the flow takes the
forced pick silently, and only genuine choices become prompts, walked one at a
time in `sourcing`. This is the rule that keeps the interface usable — an
unfiltered sourcing form for a two-coal build would ask four questions with one
possible answer each — and it is written down as
[0005-prompt-only-real-choices](srn://brass/product/play/adr/0005-prompt-only-real-choices).

## No transport, on purpose

There is no `transport.yaml`. The `kind` enum offers `http`, `grpc`, `amqp`,
`kafka`, `websocket` and `in-process`, and none of them describes a mouse. This
conversation crosses no process boundary and no module boundary — it crosses a
*human* boundary, which the transport vocabulary does not model. Picking
`in-process` and writing "the wire is a pointer device" in an `x-` field would
be worse than the honest omission: it would put a false row in the derived
transport card. The workflow diagrams and the state chart carry everything this
protocol has to say.

## Artifacts

`states.json` is the client `Flow` machine as it exists in `GameView.tsx`, with
the compound states named after the three shapes a composition can take
(`build`, `network`, `simple`). The four workflows are the four paths through it
that a player actually walks; `compose-double-rail.yaml` is included because the
rail-era two-link action is the only branch where the flow asks a question the
map cannot express.
