---
name: relation-graph
kind: component
version: 1
title: Relation graph
summary: The frontmatter relation edges of one entity drawn as a graph, scoped to one hop, with edge types told apart by line rather than by colour.
status: review
owner: sergio
component-type: ui
relations:
  uses:
    - /environment/local
  depends-on:
    - /product/portal/component/diagrams/component/diagram-kit
  implements:
    - /product/portal/requirement/every-diagram-has-a-text-equivalent
tags:
  - diagrams
  - graph
---

# Relation graph

`src/components/diagrams/relation-graph.tsx` (693 lines), React Flow over the
shared ELK layout, fed by `src/components/entity/entity-graph.tsx` (64 lines).
It draws the five authored edge types of `frontmatter.md` plus the derived
inbound ones, around the entity whose page it is on.

## One hop

`EntityGraph` collects the entity's resolved outgoing edges and its inbound
index, and **returns null below two relations**. Nothing deeper is ever drawn.
The docstring gives the reason: "a whole-solution graph is a hairball that
answers no question, whereas *what does this touch, and what touches it* is
exactly what a reviewer opens a component page to find out". The decision is
[0008-one-hop-neighbourhood-graph](srn://metaframework/product/portal/adr/0008-one-hop-neighbourhood-graph),
and the whole-solution view it deferred later arrived as a separate,
structure-only drawing —
[solution-map](srn://metaframework/product/portal/component/diagrams/component/solution-map).

An edge whose target is not in the catalog is dropped rather than drawn as a
stub: an unresolved reference is reported by the loader and shown as a broken
badge in the relations list, and a graph is the wrong place to learn about it.

## Edge types without a hue

`EDGE_STYLES` is the whole vocabulary, and every distinction in it is
geometric because colour is spent on kind:

| Edge | Width | Dash | Arrowhead |
| --- | --- | --- | --- |
| `uses` | 1.25 | solid | closed |
| `exposes` | 2 | solid | closed |
| `depends-on` | 1.25 | `7 4` | closed |
| `implements` | 1.25 | `1.5 3.5` | closed |
| `supersedes` | 1.25 | `11 4` | open |

The legend draws the same samples rather than colour chips, and the toolbar
toggles edge types off by that vocabulary. Stroke is `--border-strong` for every
type; the accent hue is reserved for edges touching the focused entity, which is
the one thing a reader needs the graph to tell them at a glance. Node colour is
the kind's hue, read from the same `lib/ui/kind.ts` table the tree and badges use
([0003-colour-is-ontology](srn://metaframework/product/portal/adr/0003-colour-is-ontology)).

## Text equivalent

`describe()` emits one sentence per edge — `checkout (component) depends on
inventory (component).` — and a final line naming any node with no relations at
all, which is the case a picture makes easiest to overlook. The figcaption is
`sr-only` and carries a headline with the node and relation counts. It is
computed in this client component and no test covers it.

## What is absent

There is no path finding, no filtering by kind, no expansion to a second hop and
no way to reach a whole-solution relation graph from here. Layout runs on
estimated node sizes and then again on measured ones, so the graph visibly
settles; `LayoutPending` covers the first frame.
