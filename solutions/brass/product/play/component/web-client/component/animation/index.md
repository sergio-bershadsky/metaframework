---
name: animation
kind: component
version: 2
title: Animation layer
summary: Reconstructs what happened between two consecutive states and plays it, without ever touching game state.
status: review
owner: sergio-bershadsky
component-type: ui
lifecycle: released
relations:
  uses:
    - /environment/production
    - /environment/local
  exposes:
    - /product/play/component/web-client/component/animation/datamodel/game-deltas@1
  depends-on:
    - /product/play/component/web-client/component/hud
    - /product/play/component/web-client/component/board-view
  implements:
    - /product/play/component/web-client/requirement/reduced-motion
tags:
  - animation
  - presentation
---

# Animation layer

`anim/gameDeltas.ts` and `anim/AnimationLayer.tsx`. A presentation-only overlay with
`pointer-events: none` that never dispatches a move and never changes state.

## It exists because the transport ships whole states

boardgame.io hands the client the entire `G` on every update — `deltaState` is unset,
so there is no delta on the wire. The framework therefore tells the client *what is
true now* and never *what just happened*, and an animation needs the second.

`gameDeltas.ts` recovers it by diffing a `useRef` of the previous snapshot against the
next one: per player, the change in money, victory points and income level, plus the
current income level (which is exactly the payout, since collecting income adds the
level to money); plus the tiles that are new since the last state, and whether the
round rolled. That derived structure is
[game-deltas](srn://brass/product/play/component/web-client/component/animation/datamodel/game-deltas@1),
and it exists as a datamodel because it is a real shape with a real contract, not
because anything sends it anywhere.

## Why it depends on the HUD and the board

To know where to fly things to. Coins fly toward a player's HUD card, so it reads the
score track's lap geometry (`lapCell`) and the board's owner-colour mapping
(`colorHex`). Those two imports are the coupling: this component cannot be understood
or moved without the two it draws over.

## Reduced motion is its whole obligation

With `prefers-reduced-motion` set, nothing flies, nothing pulses and nothing bursts.
The reason that is safe — and the reason the requirement is checkable rather than
aspirational — is that this layer adds no information. The HUD and the score track
already render the final state; skipping the motion skips motion and nothing else. A
design in which an animation carried the only indication that income was collected
would make the same promise impossible to keep.

## The boundary that keeps it harmless

Nothing here reads legality, dispatches, or writes to state. The strongest statement
of that is structural: its only inputs are two consecutive snapshots and its only
outputs are short-lived effects. A bug in this component can make the game look
wrong; it cannot make the game *be* wrong.
