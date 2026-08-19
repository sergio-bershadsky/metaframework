---
name: reduced-motion
kind: requirement
version: 1
title: Motion is skipped for anyone who asked their OS to skip it
summary: Under prefers-reduced-motion no fly or zoom animation runs, and no game information is carried only by an animation.
status: review
owner: sergio-bershadsky
requirement-type: non-functional
priority: should
relations:
  uses:
    - /environment/production
    - /product/play/component/web-client/component/animation
tags:
  - accessibility
  - client
---

# Motion is skipped for anyone who asked their OS to skip it

Because the framework broadcasts whole states and never says what changed, the
client reconstructs the difference between consecutive states and plays it back:
money and VP counters roll, new tiles fly onto the board, income markers step.
It is the only way a player can tell what an opponent just did without reading
the log.

That makes motion **informative**, which is exactly the case where a reduced-
motion setting is most likely to be implemented as "turn the feature off" and
lose information with it. It must instead be implemented as "arrive at the same
end state instantly".

## Acceptance criteria

- **AC-1** With `prefers-reduced-motion: reduce`, no fly, slide, zoom or counter-roll animation runs anywhere in the client.
- **AC-2** Every state the animation would have passed through is still reached; the end state after a change is identical with and without motion.
- **AC-3** No information exists only in an animation — anything a movement conveys is also readable from the board, the HUD or the activity log once it settles.
- **AC-4** The preference is honoured on first paint, not applied after an animation has already started.
- **AC-5** Turn-end animation never delays input: a player whose turn begins can act immediately, whether or not the previous turn's playback has finished.

## Rationale

AC-3 is the criterion that constrains design rather than implementation. It
forbids the tempting shortcut where a change is announced *only* by a flying
tile, because that announcement does not exist for a reduced-motion reader — and
the flat board makes it easy to comply, since the board is a projection of state
rather than a scene with history
([0002-flat-svg-board](srn://brass/product/play/adr/0002-flat-svg-board)).

AC-5 exists because animation is driven by state arrival, not by the local
player's turn, and a playback that blocked input would punish the fastest player
at the table.

## Measured where

In [production](srn://brass/environment/production), in a browser with the
system preference set. It is one of only two non-functional requirements in this
catalog with an objectively checkable criterion — there are no latency budgets,
availability targets or SLOs anywhere in this project, and none is invented
here.

## Out of scope

Screen-reader support, keyboard-only play and colour-contrast conformance. All
are real accessibility obligations and none is claimed; the game is currently a
mouse-driven visual interface, and saying so is more useful than a criterion
nobody meets.
