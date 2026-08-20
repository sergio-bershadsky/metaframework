---
name: 0010-diagrams-must-be-statable-in-prose
kind: adr
version: 1
title: A diagram the catalog cannot state in prose is a diagram it cannot review
summary: Every derived drawing ships a text equivalent in the DOM and the drawing itself is marked decorative — accessibility and AI-readability treated as one requirement.
status: review
owner: sergio
decision-status: accepted
date: "2026-08-19"
deciders:
  - sergio
relations:
  uses:
    - /product/portal/component/diagrams
tags:
  - portal
  - diagrams
  - ai-readable
---

## Context

The framework's founding principle is that the catalog must be readable by a
human and by a model — README's "human + AI readable — the catalog must make
sense with `grep` alone". A drawing is where that principle is easiest to break:
an SVG is opaque to `grep`, opaque to a screen reader, and opaque to a model
handed the page.

Two constituencies want the same thing here and are usually treated as separate
budgets. A screen-reader user needs the picture said; a model reading the DOM
needs the picture said; a reviewer skimming a diff needs to know what the picture
claimed. One text equivalent serves all three, and the portal's own comment in
`sequence-diagram.tsx` puts it flatly: "Accessibility and AI-readability are the
same requirement."

## Decision

Every derived drawing states itself in words, in the rendered DOM, at the same
time as the drawing. The SVG or canvas is marked decorative and the text is the
canonical reading. The rule is written as the sentence the code carries: *a
picture the catalog cannot state in prose is a picture the catalog cannot
review.* Its testable form is
[every-diagram-has-a-text-equivalent](srn://metaframework/product/portal/requirement/every-diagram-has-a-text-equivalent).

## Consequences

- **Every renderer carries a narrator.** The sequence diagram emits an ordered
  list from `narrateWorkflow()`; the relation graph, the solution map and the
  state chart each emit an `sr-only` `<figcaption>` with a headline and lists.
  Four drawings, four pieces of prose to keep true.
- **It constrains where a diagram may be rendered.** The sequence diagram stays a
  *static* import rather than a lazy client one specifically so its narration is
  in the server HTML — reachable by a fetch, not only by a browser that ran the
  JavaScript
  ([0006-custom-sequence-renderer](srn://metaframework/product/portal/adr/0006-custom-sequence-renderer)).
  The other three narrate from inside client components, so their text exists
  only after hydration. That is a real weakening of the rule, and it is the
  gap `grep` would find first.
- **The narration has to carry what the geometry encodes.** Where a drawing says
  something by position, the text has to say it in words: the solution map's
  narration lists nodes by ring and names the entities it visually recedes,
  because recession is meaning a non-visual reader would otherwise lose.
- **A drawing that cannot be stated does not ship.** There is no diagram in this
  portal whose content is only expressible visually, and adding one would mean
  either writing its narrator or rejecting the drawing.
- **Almost none of it is enforced.** One of the four narrations —
  `narrateWorkflow()` — is covered by a test. The other three are computed inside
  client components and asserted by nobody; there is no CI, no accessibility
  linter and no component test in the repository. The rule survives on author
  discipline, and this ADR is the place that says so.

## Alternatives considered

- **An `alt` or `aria-label` on each diagram.** The conventional answer, and it
  is what most documentation sites do. Rejected as a summary where the
  requirement is the content: "relation graph for checkout" tells a non-visual
  reader that a picture exists, not what it says. The obligation is the entities,
  the connections and their direction — that does not fit an attribute.
- **Generate the text on demand, behind a "describe this diagram" control.**
  Rejected because it fails two of the three constituencies: `grep` and a model
  reading the served HTML never press a control, and it would make the text a
  feature rather than the canonical form.
- **Accept that diagrams are visual, and rely on the underlying artifact.** The
  workflow YAML and `states.json` are in the page already, below the drawing.
  Rejected because a source file is not a reading: the point of the drawing is
  the derivation, and the derivation is exactly what a reviewer needs stated.
