---
name: multi-client-e2e
kind: requirement
version: 1
title: Real multi-browser games are verified on every change
summary: A Playwright harness drives 2, 3 and 4 real browser contexts through a full game on every change. Currently unmet.
status: draft
owner: sergio-bershadsky
requirement-type: non-functional
priority: should
relations:
  uses:
    - /environment/local
    - /product/play/component/e2e-harness
tags:
  - testing
  - regression
---

# Real multi-browser games are verified on every change

The bot validator proves the *engine* finishes games and accepts every move it
enumerates. It proves nothing about the interface: whether a slot is clickable,
whether the card picker offers the right faces, whether the commit button
appears when the budget runs out, or whether four browsers watching one match
stay in agreement.

Only a multi-context browser harness answers those, and it is the sole place in
this solution where **multi-actor concurrency** is exercised at all — n real
clients against one authority, interleaving in ways a single-process test cannot
reproduce.

## Acceptance criteria

- **AC-1** A Playwright run opens one browser context per player and drives 2-, 3- and 4-player games through the DOM as separate humans.
- **AC-2** Each run completes a full two-era game and asserts the reported winner matches the engine's own computation.
- **AC-3** No illegal move is accepted by way of the UI; a target the enumeration does not offer is not clickable.
- **AC-4** The suite runs on every pull request, in CI, and a failure blocks the merge.
- **AC-5** The selectors the suite depends on are stable enough that a UI refactor breaks a test rather than silently skipping one.

## Rationale

AC-5 is the criterion the current state fails hardest. The harness depends on
roughly a hundred `data-testid` attributes in the web client, and that is a real
interface with no version, no owner and no test of its own. When the board was
replaced by
[0002-flat-svg-board](srn://brass/product/play/adr/0002-flat-svg-board) and the
action bar was redesigned, testids went with them.

## Why this is a draft, and unmet

Three facts, stated so nobody mistakes the harness for coverage:

- Three of the five specs reference selectors that no longer exist —
  `do-action`, the `view-iso`/`view-flat` switcher, and `.era-toggle` among them
  — so they cannot pass.
- No GitHub workflow runs `pnpm e2e`. CI runs typecheck, the rules tests and the
  client tests, and stops there. AC-4 is unmet by configuration, not by
  flakiness.
- The one recorded passing run in `test-results/.last-run.json` appears to be a
  single spec (`build-flow`) rather than the suite. That reading is an
  inference from the file, not a reproduction.

The obligation is real and the priority is `should`, so the product ships
without it under protest. The workaround is the bot validator plus manual play,
which covers the engine well and the interface not at all.

## Out of scope

Visual regression. `screenshots/` and `test-results/` are gitignored development
ephemera, and pixel comparison of a live board would be noise.
