---
name: hud
kind: component
version: 2
title: HUD
summary: Score track, player strip, markets, action bar, player mat, and card faces — everything around the board.
status: review
owner: sergio-bershadsky
component-type: ui
lifecycle: released
relations:
  uses:
    - /environment/production
    - /environment/local
    - /product/play/component/rules/component/engine-core/datamodel/player-state@1
    - /product/play/component/rules/component/engine-core/datamodel/tile-spec@1
  depends-on:
    - /product/play/component/rules/component/engine-core
tags:
  - hud
---

`ScoreTrack`, `PlayerHud`, `MarketWidget`, `ActionBar`, `PlayerMat`, `PlayedCards`,
`CardPicker`, `cardFace` and `EraIntro`. Everything on screen that is not the board
and not an animation.

## What it owns

Rendering **state that already exists**, and nothing else. Money, income space and
the level derived from it, victory points and their lap position on the score track,
the two market tracks, the cards in hand and what each one authorises, the player
mat's remaining tile levels per industry, and the action bar's commit control.

The one piece of derivation it does is presentational: income *space* is a 0–99
position and income *level* is what a player is paid, so `levelFromSpace` is called
here rather than being carried in state. That is a display concern that happens to
need engine knowledge, which is why this component depends on
[engine-core](srn://brass/product/play/component/rules/component/engine-core) at all.

## The player mat is the interesting one

`PlayerMat` renders each industry's stack of remaining tile levels as an ascending
multiset, and it is also the picker for the Develop action — a player removes one or
two tiles from it to expose higher ones. Develop therefore bypasses the interaction
machine in
[action-flow](srn://brass/product/play/component/web-client/component/action-flow)
entirely and dispatches from here. Sell does the same through its own paged wizard.
That is worth knowing before reading the client state machine, because two of the six
actions are simply not in it.

## Card faces are a contract in miniature

`cardFace` maps a card to what it shows: a location card names a city, an industry
card names one or more industries, and the two wild kinds render as wilds. The rule
that keeps the HUD honest is that a card's *authorising power* is never computed
here — the enumerator's `eligibleCards` says which cards can pay for a target, and
`CardPicker` offers exactly that set.

## The obligation it does not carry

Reduced motion belongs to
[animation](srn://brass/product/play/component/web-client/component/animation), not
here, precisely because this component renders final state with no motion at all.
That split is what makes the reduced-motion promise checkable: skip every animation
and the HUD still shows the correct end state, so nothing is lost but movement.
