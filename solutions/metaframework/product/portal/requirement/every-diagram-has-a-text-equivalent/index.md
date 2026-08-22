---
name: every-diagram-has-a-text-equivalent
kind: requirement
version: 2
title: Every diagram states itself in words
summary: Every derived drawing in the portal ships a text equivalent in the DOM that carries the same facts as the picture.
status: review
owner: sergio
requirement-type: non-functional
priority: must
relations:
  uses:
    - /product/portal/component/diagrams
tags:
  - accessibility
  - diagrams
  - ai-readable
---

A picture the catalog cannot state in prose is a picture the catalog cannot
review. Every drawing the portal derives — the relation graph, the solution map,
the sequence diagram, the state chart, the Arazzo step graph — must ship, in the
rendered DOM, a text
form carrying the same facts: the entities, the connections between them, and
the direction of each connection.

Accessibility and AI-readability are the same requirement here, which is why one
statement covers both. A screen reader, `grep`, and a model handed the page all
need the same thing: the picture, said. This is the diagram-shaped half of the
solution-level obligation
[human-and-ai-readable](srn://metaframework/requirement/human-and-ai-readable),
and its reasoning is
[0010-diagrams-must-be-statable-in-prose](srn://metaframework/product/portal/adr/0010-diagrams-must-be-statable-in-prose).

## Acceptance criteria

- **AC-1** Every diagram component renders a text equivalent in the DOM at the
  same time as the drawing, not behind an interaction.
  - Verified 2026-08-19. `sequence-diagram.tsx` emits an `sr-only` `<ol>` from
    `narrateWorkflow()`; `relation-graph.tsx`, `solution-map.tsx` and
    `state-chart.tsx` each emit an `sr-only` `<figcaption>` with a headline and
    one or two lists.
- **AC-2** The drawing itself is marked decorative, so an assistive reader is
  given the text rather than the geometry.
- **AC-3** The text names both ends of every connection and the kind of
  connection, not merely a count.
  - `describe()` in `relation-graph.tsx` emits `checkout (component) depends on
    inventory (component).` per edge; `narrateWorkflow()` emits
    `3. checkout → payment: capture (request)` per step.
- **AC-4** The text states what the drawing conveys by position or emphasis and
  not by a label.
  - The solution map's narration lists nodes by ring (`2 steps away: …`) and
    names the entities that are visually receded, because recession is meaning
    that a non-visual reader would otherwise lose.
- **AC-5** An entity that appears in the drawing with no connections at all is
  named in the text.
  - `relation-graph.tsx` appends `No relations: …`; an isolated node is the case
    a picture makes easiest to overlook.
- **AC-6** A diagram whose source artifact will not parse renders no drawing and
  no narration, and the block shows the parser's complaint against the source
  instead — silence is never presented as an empty diagram.

## How far it is enforced

Not far, and the gap is the point of writing this down.

Nothing checks any of the criteria automatically. There is no CI in this
repository, no accessibility linter, and no component test of any kind — all 16
vitest files live under `src/lib/**` and `find src -name '*.test.tsx'` returns
nothing.

Of the four narrations, exactly one is exercised by a test: `narrateWorkflow()`,
in `src/lib/protocol/workflow.test.ts`. The other three — `describe()` in
`relation-graph.tsx`, `describe()` in `solution-map.tsx` and
`stateChartSummary()` reached from `state-chart.tsx` — are computed inside client
components and are asserted by nobody. AC-1 through AC-5 above were verified by
reading the files on 2026-08-19, not by running anything.

The structural half is stronger than the textual half. Because
`layoutWorkflow()`, `polarLayout()` and `statesToMermaid()` are pure functions in
`lib/`, a change to what a diagram *shows* usually breaks a test even though a
change to what it *says* does not.

## Out of scope

Colour contrast, focus order and keyboard reachability of the canvases. Those
are real accessibility obligations and this requirement is not about them; it is
about whether the information in a drawing exists anywhere but the drawing.
