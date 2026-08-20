---
name: diagrams
kind: component
version: 2
title: Diagrams
summary: The derived-drawing subsystem — four renderers over one shared kit, every drawing computed from catalog data and none hand-authored.
status: review
owner: sergio
component-type: ui
lifecycle: released
relations:
  uses:
    - /environment/local
  implements:
    - /product/portal/requirement/every-diagram-has-a-text-equivalent
tags:
  - ui
  - diagrams
---

Four drawings, one shared kit, and a rule that binds all of them: **no diagram
in this portal is authored**. Each is computed from something already in the
catalog — frontmatter relation edges, a workflow YAML, a `states.json`, or the
containment tree — so a picture cannot disagree with the files it is drawn from,
because there is nothing to disagree with. There is no diagram source format, no
`.drawio`, no mermaid a human wrote. `src/components/diagrams/` is 2,816 lines
and `src/lib/diagrams/` is 1,022; between them they hold no coordinates anyone
typed.

## The four, and why they are not one

| Drawing | Derived from | Renderer |
| --- | --- | --- |
| [relation-graph](srn://metaframework/product/portal/component/diagrams/component/relation-graph) | `relations` edges, one hop | React Flow over ELK |
| [solution-map](srn://metaframework/product/portal/component/diagrams/component/solution-map) | containment + crossing edges | React Flow over a polar layout |
| [sequence-diagram](srn://metaframework/product/portal/component/diagrams/component/sequence-diagram) | `workflows/*.yaml` | hand-rolled SVG |
| [state-chart](srn://metaframework/product/portal/component/diagrams/component/state-chart) | `states.json` | mermaid `stateDiagram-v2` |

Three different rendering technologies for four drawings is not drift; each
split has a record. A sequence diagram is a grid, not a free graph, so React
Flow is the wrong tool for it
([0006-custom-sequence-renderer](srn://metaframework/product/portal/adr/0006-custom-sequence-renderer)).
A state chart needs deterministic label placement more than it needs
interactivity, which is why mermaid replaced a custom renderer outright
([0007-mermaid-for-state-charts](srn://metaframework/product/portal/adr/0007-mermaid-for-state-charts)).
The two graphs that *are* free graphs share
[diagram-kit](srn://metaframework/product/portal/component/diagrams/component/diagram-kit)
so they look like siblings.

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

All four emit a text equivalent — the sequence diagram an ordered `<ol>` from
`narrateWorkflow()`, the other three an `sr-only` `<figcaption>` with a headline
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

Only the geometry is tested: `layout.test.ts` (133 lines) and `polar.test.ts`
(227) under `src/lib/diagrams/`, plus `narrateWorkflow` and `statesToMermaid` in
[protocol-model](srn://metaframework/product/portal/component/protocol-model).
Every component in this subtree — 2,816 lines of rendering and interaction — is
verified by looking at it.
