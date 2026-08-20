---
name: sequence-diagram
kind: component
version: 1
title: Sequence diagram
summary: Hand-rolled SVG over a pure layout pass — lifelines as columns, steps as ordered rows, fragments as nested boxes, and an ordered list that is the diagram in words.
status: review
owner: sergio
component-type: ui
relations:
  uses:
    - /environment/local
  depends-on:
    - /product/portal/component/protocol-model
  implements:
    - /product/portal/requirement/every-diagram-has-a-text-equivalent
tags:
  - diagrams
  - protocol
---

# Sequence diagram

`src/components/diagrams/sequence-diagram.tsx` (616 lines), drawn from a
protocol's `workflows/*.yaml` through `layoutWorkflow()` and `narrateWorkflow()`
in
[protocol-model](srn://metaframework/product/portal/component/protocol-model).
There are 22 such YAML files across 14 `workflows/` directories in the catalog
today.

## No React Flow, deliberately

It is the one diagram that shares nothing with
[diagram-kit](srn://metaframework/product/portal/component/diagrams/component/diagram-kit)
— no ELK, no React Flow, not even the expand control. The reason is in the file:
React Flow "positions nodes freely and routes edges between them, which is the
opposite of what a sequence diagram is. Here the geometry is a grid — lifelines
are columns, steps are ordered rows, fragments are nested boxes." The decision is
[0006-custom-sequence-renderer](srn://metaframework/product/portal/adr/0006-custom-sequence-renderer).

`layoutWorkflow()` is pure and lives in `lib/`, so this file owns nothing but
paint and interaction, and the geometry is testable without a browser.

## A static import, and why that matters

Every other diagram is reached through `next/dynamic({ ssr: false })`. This one
is imported statically, because there is no React Flow weight to defer and
because server-rendering it is what keeps the narration in the delivered HTML —
which is the point of having a narration at all.

## The narration is the diagram

The SVG is marked decorative and the `<ol>` beneath it is `sr-only`. Each line
is one step in the workflow's own vocabulary:

```text
3. checkout → payment: capture (request), guard amount > 0, payload capture-request
```

Fragments (`alt`, `opt`, `par`, `loop`) and their compartments are narrated at
their own depth, so the branch structure survives into the text. `labelOf` maps
each alias to the participant's entity title, so the narration names the same
things the lifelines do.

`narrateWorkflow` is one of only two diagram narrations in the portal with a
test —`src/lib/protocol/workflow.test.ts` covers it directly. The reasoning is
[0010-diagrams-must-be-statable-in-prose](srn://metaframework/product/portal/adr/0010-diagrams-must-be-statable-in-prose).

## Source anchoring

A step's path (`steps[4].alt[0].steps[2]`) is already its path through the YAML,
because the workflow mini-spec keys steps positionally. So hovering a row lights
the lines that authored it with no translation layer anywhere — the diagram
lights whatever it is handed, by the key it already owns. The channel is
[artifact-viewer](srn://metaframework/product/portal/component/console/component/artifact-viewer)'s
anchor context.

## What is absent

No pan, no zoom, no expand control — the SVG is laid out to fit and scrolls with
the block. Payload datamodels are clickable and nothing else is. A workflow that
fails to parse produces no diagram at all; the block shows the parser's
complaint and the source, which is
[entity-view](srn://metaframework/product/portal/component/console/component/entity-view)'s
behaviour, not this component's.

The `E_PROTO_WF_*` classes that would reject a malformed workflow are
implemented, but they meet real content only when the portal renders a protocol
page — they never reach `/diagnostics`.
