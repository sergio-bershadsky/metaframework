---
name: dead-selectors
kind: metric
version: 1
title: Dead harness selectors
summary: How many distinct data-testid values the Playwright specs drive that the client no longer carries, read from the working tree at a commit.
status: draft
owner: sergio-bershadsky
metric-type: count
target: "0"
window: "instant"
direction: lower-is-better
relations:
  measures:
    - /product/play/component/e2e-harness
  uses:
    - /environment/local
tags:
  - testing
  - rot
---

The client carries 107 `data-testid` attributes across 69 distinct values. Nothing
versions them, no client test asserts their presence, and
[e2e-harness](srn://brass/product/play/component/e2e-harness) is written entirely
against them. This is the number that says how far apart the two have drifted:
how many of the ids the specs actually type into a selector no longer exist in
the client source.

It is the only metric in this catalog whose subject is a component's *coupling*
rather than its behaviour, and that is deliberate — the undeclared contract is
this component's real risk, and the catalog can only say so with an edge and a
number.

## Definition

Numerator has no denominator here: count the **distinct** `data-testid` values
referenced anywhere under the `@brass/e2e` package — specs and `helpers.ts` alike
— that match no `data-testid` in the client's source. A grep on both sides, in
the working tree, at one commit.

Distinct values rather than call sites, because one dead id disables every spec
that reaches it and counting the call sites would weight the number by how often
a helper happens to be reused.

A denominator was considered and dropped: the share of the harness's ids that
still resolve would be the more informative figure, and this catalog does not
state how many distinct ids the harness references. Writing a ratio would mean
inventing the denominator, so the count is what gets written.

## Rationale

The reading at the time of the survey is **3** — `do-action`, `view-iso` and
`view-flat` — and each of them is load-bearing. `do-action` takes `play.spec.ts`
and `screenshots.spec.ts` with it through `takeOneTurn`; `view-iso` and
`view-flat` vanished with the board-view toggle and take `flat-board.spec.ts`.
Three ids, three of the five specs.

Target zero, because there is no such thing as an acceptable dead selector: an id
the harness drives and the client does not carry is a test that cannot pass, and
the failure is silent until someone runs a suite that
[nothing in CI runs](srn://brass/actor/ci-runner). `test-results/.last-run.json`
records `passed` with no failed tests, which the harness's own page reads as a
single-spec run rather than a full pass; a number like this one is what would
settle that inference instead of leaving it as one.

`window: instant` for the same reason as
[rejected-enumerated-moves](srn://brass/product/play/component/rules/metric/rejected-enumerated-moves):
it is a reading of a working tree at a commit, not an aggregate over a period,
and no other window literal would be true.

## Known distortions

- **Zero would not mean the harness works.** Selectors resolving is necessary and
  nowhere near sufficient — an assertion can be wrong, a flow can have changed
  shape, and `pnpm e2e` still appears in no workflow. The obligation
  ([multi-client-e2e](srn://brass/product/play/requirement/multi-client-e2e))
  stays unmet at a reading of zero.
- **Deleting a spec improves it.** Removing `flat-board.spec.ts` would take two
  dead ids out of the numerator without a line of the client changing. Read it
  next to how many specs exist, never alone.
- **It only sees ids written as literals.** A selector composed at runtime from a
  variable is invisible to both greps, and would be counted as neither alive nor
  dead.
