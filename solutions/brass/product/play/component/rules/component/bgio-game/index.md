---
name: bgio-game
kind: component
version: 3
title: boardgame.io game binding
summary: The Game object — moves, phases, turn order, playerView and endIf; the only file that imports the framework.
status: review
owner: sergio-bershadsky
component-type: library
lifecycle: released
relations:
  exposes:
    - /product/play/component/rules/component/bgio-game/datamodel/move-choices@1
  depends-on:
    - /product/play/component/rules/component/engine-core
    - /product/play/component/rules/component/move-enumerator
    - /product/play/component/boardgame-io
  implements:
    - /requirement/legal-move-enforcement
    - /requirement/hidden-hands
  realizes:
    - /capability/rule-adjudication
tags:
  - engine
  - framework-binding
---

`game.ts`, and nothing else. It is the seam between a framework-free engine and a
framework, and keeping it to one file is what makes the other two sub-components
testable without a game loop.

## What the `Game` object declares

`setup` builds the initial state. Three phases: `lobby` (start phase, all players
active, moves `sitDown` / `pickColor` / `pickAvatar` / `toggleReady` / `hostStart`,
`next: canalEra`), then `canalEra` and `railEra`, which share one turn config and one
move set — `build`, `network`, `develop`, `sell`, `loan`, `scout`, `pass`,
`confirmTurn`. `endIf` reports the winner once the state says the game ended.

Seating is therefore a **game phase**, not server infrastructure. Two REST calls put
a player in a match, and from that moment every lobby interaction is an ordinary
move on the ordinary transport, adjudicated and broadcast like any other. That is why
this solution needs no lobby service.

## The two properties this file alone provides

**Transactional legality.** Returning `INVALID_MOVE` from a move handler makes
boardgame.io discard every mutation that handler performed. That is what lets a
handler be written as straight-line mutation with a bail-out, rather than as a
validate pass followed by an apply pass — and it means a rejected move cannot leave
the state half-changed. Remove the framework and that guarantee has to be rebuilt by
hand in eight handlers.

**Hidden hands.** `playerView` rewrites the state per recipient: every seat other
than the reader has its `hand` replaced by `hidden-<pid>-<i>` placeholders. Hand
*length* and deck *count* stay observable — they are public information in the
tabletop game — but no card identity for another seat ever leaves the process. This
is the entire mechanism behind
[hidden-hands](srn://brass/requirement/hidden-hands), and it is why the MCP adapter
gets the property for free rather than having to be trusted.

## The turn-commit gate

An action does not end a turn. Once the action budget is spent — two actions, or one
in the first canal round — or the hand is empty, the state enters `awaitingCommit`
and the only legal move becomes `confirmTurn`. Committing draws back up to eight
cards and advances the turn; committing as the last seat in order also collects
income, reorders the play order by spend, and starts the next round.

This is a deliberate deviation from the tabletop game, and every consumer has to know
about it: the client renders a commit button, the MCP rulebook resource states it in
the first paragraph, and the state machine on
[game-transport](srn://brass/protocol/game-transport) models it as an explicit state.

## Guided choices

`move-choices` is the optional structure a client attaches to a move to say which
candidate it picked for each required cube, barrel or merchant. Two rules make it
safe to accept from an untrusted client: an omitted list falls through to the
engine's own heuristic, and every supplied pick is re-validated by identity against a
freshly replanned candidate set. A stale pick is rejected rather than silently
applied to a different source.
