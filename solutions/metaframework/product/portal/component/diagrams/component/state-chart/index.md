---
name: state-chart
kind: component
version: 2
title: State chart
summary: A protocol's states.json drawn by mermaid, always, with interactivity recovered from the generated SVG only where it can be verified.
status: review
owner: sergio
component-type: ui
lifecycle: released
relations:
  uses:
    - /environment/local
  depends-on:
    - /product/portal/component/diagrams/component/diagram-kit
    - /product/portal/component/protocol-model
  implements:
    - /product/portal/requirement/every-diagram-has-a-text-equivalent
tags:
  - diagrams
  - protocol
  - mermaid
---

`src/components/diagrams/state-chart.tsx` (493 lines), rendering mermaid
`stateDiagram-v2` text produced by `statesToMermaid()` in
[protocol-model](srn://metaframework/product/portal/component/protocol-model).
There are 8 `states.json` files in the catalog today.

## Rebuilt, not tuned

This component replaced a custom React Flow renderer wholesale, per
decision-record amendment 2026-08-19-e and
[0007-mermaid-for-state-charts](srn://metaframework/product/portal/adr/0007-mermaid-for-state-charts).
The division of labour is strict and is what makes the replacement reviewable:
`parseStates` stays the validator and the model, `statesToMermaid` is a pure
tested function that decides every word on the drawing, and this component only
renders that text and dresses the SVG. The chart's own text is therefore
assertable in `src/lib/protocol/mermaid.test.ts` without a DOM.

Mermaid is heavy, so it follows the Monaco discipline: dynamically imported
behind a module-level singleton, initialised exactly once, so no page pays for
it before a state chart is on screen.

## Interactivity is recovered, and each recovery guards itself

Mermaid emits an SVG; this component has to find its own model inside it. Three
joins, three different levels of confidence, and the file is explicit about
which is which:

- **States** join by mermaid's stable node ids (`state-<alias>-<n>`), mapped
  back through the generator's alias map. Reliable.
- **Transitions** join **by rank**. Mermaid numbers its edges in statement
  order, but notes share the counter, so the numbers index nothing on their own;
  the arrow paths are sorted by `n` and zipped against the generator's
  `edgeOrder`. The join is **verified by count before it is trusted** — if the
  SVG disagrees, edge interactivity is dropped rather than mis-wired. Labels
  join exactly, by the `data-id` they carry themselves.
- **Hover dimming** is computed from the chart model, not from the SVG, and
  applied as a class.

That "dropped rather than mis-wired" clause is the honest half of the amendment:
fine-grained interactivity here is best-effort, not contractual, and whatever
does not survive mermaid's output is reported rather than faked.

## What was knowingly given up

The amendment lists it, and it is true of the shipped component: no pan or zoom
(the expand-to-viewport control from
[diagram-kit](srn://metaframework/product/portal/component/diagrams/component/diagram-kit)
is kept, wheel-zooming a canvas is not), no compact/detailed density toggle, and
no hover detail panels on states or expanded transition labels. Mermaid renders
what the text declares, inline.

What was bought: deterministic label placement. The custom renderer went through
a two-pass measure-then-relayout pipeline, a label-spread solver with obstacle
avoidance and per-chart calibration constants, and still grazed labels on
`promotion-evaluation` and on the brass 30-edge action-composition chart.

## Text equivalent

`stateChartSummary()` supplies an `sr-only` figcaption: a headline, then one
list of states and one of transitions. Unlike the sequence diagram's narration
it is not exercised by a test that asserts its wording — `states.test.ts` covers
the parser and `mermaid.test.ts` covers the generated diagram text, and the
summary sits between them.

## What is absent

Mermaid's theme is supplied from `lib/ui/console-tokens.ts`, the hand-converted
hex mirror of the console palette. Nothing keeps the two in step, so a token
change in `globals.css` silently leaves this chart on the old colours.

A `states.json` that fails the XState-v5 subset check produces no chart; the
block shows the errors and the source instead.
