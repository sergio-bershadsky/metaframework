---
name: diagrams
kind: component
version: 5
title: Diagrams
summary: The derived-drawing subsystem — five renderers over one shared kit, every drawing computed from catalog data and none hand-authored.
status: review
owner: sergio
component-type: ui
lifecycle: released
relations:
  uses:
    - /environment/local
  implements:
    - /product/portal/requirement/every-diagram-has-a-text-equivalent
  realizes:
    - /capability/derived-visualization
tags:
  - ui
  - diagrams
---

Five drawings, one shared kit, and a rule that binds all of them: **no diagram
in this portal is authored**. Each is computed from something already in the
catalog — frontmatter relation edges, a workflow YAML, a `states.json`, an
`arazzo.yaml`, or the containment tree — so a picture cannot disagree with the
files it is drawn from,
because there is nothing to disagree with. There is no diagram source format, no
`.drawio`, no mermaid a human wrote. Between them, `src/components/diagrams/`
and `src/lib/diagrams/` hold no coordinates anyone typed.

## The five, and why they are not one

| Drawing | Derived from | Renderer |
| --- | --- | --- |
| [relation-graph](srn://metaframework/product/portal/component/diagrams/component/relation-graph) | `relations` edges, one hop | React Flow over ELK |
| [solution-map](srn://metaframework/product/portal/component/diagrams/component/solution-map) | containment + crossing edges | React Flow over a polar layout |
| [sequence-diagram](srn://metaframework/product/portal/component/diagrams/component/sequence-diagram) | `workflows/*.yaml` | hand-rolled SVG |
| [state-chart](srn://metaframework/product/portal/component/diagrams/component/state-chart) | `states.json` | mermaid `stateDiagram-v2` |
| [arazzo-graph](srn://metaframework/product/portal/component/diagrams/component/arazzo-graph) | `arazzo.yaml` | React Flow over ELK |

Three different rendering technologies for five drawings is not drift; each
split has a record. A sequence diagram is a grid, not a free graph, so React
Flow is the wrong tool for it
([0006-custom-sequence-renderer](srn://metaframework/product/portal/adr/0006-custom-sequence-renderer)).
A state chart needs deterministic label placement more than it needs
interactivity, which is why mermaid replaced a custom renderer outright
([0007-mermaid-for-state-charts](srn://metaframework/product/portal/adr/0007-mermaid-for-state-charts)).
The three graphs that *are* free graphs share
[diagram-kit](srn://metaframework/product/portal/component/diagrams/component/diagram-kit)
so they look like siblings.

One of the five is unlike the other four in a way worth stating here rather than
only on its own page: every other drawing is derived from a file this framework
**owns and validates**, and `arazzo-graph` is derived from one it deliberately
does not. Reading a foreign document to show it is not the same as checking it,
and the reader behind that canvas raises nothing, ever
([0020-arazzo-as-a-sibling-role](srn://metaframework/adr/0020-arazzo-as-a-sibling-role)).

## Colour is not available to a diagram

The console's rule — colour is ontology, one hue per entity kind — costs the
diagrams their easiest encoding. An edge type may not own a hue, so
`relation-graph` tells `uses` from `depends-on` from `implements` by stroke
weight, dash pattern and arrowhead, and its legend shows line samples rather
than colour chips. The solution map does the same for its two edge languages.
The accent hue is spent on one thing only: which edges touch the entity the page
is about. See
[0003-colour-is-ontology](srn://metaframework/product/portal/adr/0003-colour-is-ontology).

## Every drawing states itself in words

All five emit a text equivalent — the sequence diagram an ordered `<ol>` from
`narrateWorkflow()`, the other four an `sr-only` `<figcaption>` with a headline
and a list. The SVG or canvas is decorative; the text is the canonical reading,
for a screen reader, for `grep`, and for a model handed the DOM. That obligation
is
[every-diagram-has-a-text-equivalent](srn://metaframework/product/portal/requirement/every-diagram-has-a-text-equivalent),
and its reasoning is
[0010-diagrams-must-be-statable-in-prose](srn://metaframework/product/portal/adr/0010-diagrams-must-be-statable-in-prose).

## What is absent

There is no export. No diagram can be saved as SVG or PNG, copied as text, or
printed; `useExpandable` fills the viewport and that is the whole story.

There is no diagram for a datamodel's composition — the `allOf` DAG is rendered
as a lineage list by
[artifact-viewer](srn://metaframework/product/portal/component/console/component/artifact-viewer),
not as a graph — and none for an environment's `topology.yaml`, which has zero
mentions anywhere in `src`.

Mostly only the geometry is tested: `layout.test.ts` and `polar.test.ts`
under `src/lib/diagrams/`, plus `narrateWorkflow` and `statesToMermaid` in
[protocol-model](srn://metaframework/product/portal/component/protocol-model).
`arazzo-graph` is the one exception, and only because its model is a *reader* of
a foreign format rather than a layout: `arazzo.test.ts` covers the document, the
step graph and the text equivalent, and every Arazzo file the shipped catalog
carries is walked by `fixture-check.test.ts`. Every component in this subtree — all the
rendering and all the interaction — is still verified by looking at it.
