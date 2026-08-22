---
name: arazzo-graph
kind: component
version: 1
title: Arazzo step graph
summary: One workflow of an arazzo.yaml drawn as a step graph, read from a document this framework deliberately does not validate, with declared order and inferred order drawn as different edges.
status: review
owner: sergio
component-type: ui
lifecycle: released
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
  - protocol
---

`src/components/diagrams/arazzo-graph.tsx`, React Flow over the shared ELK
layout, fed by the `arazzo.yaml` branch of
`src/components/entity/entity-artifacts.tsx`. It draws one Arazzo workflow at a
time — steps as nodes, the terminal an `end` action reaches, and four kinds of
edge between them.

It exists because there was nothing to defer to. The 0.2.0 survey found
Redocly's Arazzo visualization not started and the only renderer in existence a
VS Code extension, so an artifact the catalog ships would otherwise have been
the one artifact on a protocol page that stayed a wall of YAML while
`states.json` and `workflows/*.yaml` beside it both drew.

## Drawing is not validating

This is the only renderer here whose source the framework does not own and does
not check. `kinds/protocol.md` states no field table for an Arazzo Description,
so no rule reaches its contents and no diagnostic is raised from them
([0020-arazzo-as-a-sibling-role](srn://metaframework/adr/0020-arazzo-as-a-sibling-role)).
That is not an accident of sequencing — there is no published JSON Schema for
Arazzo 1.1 to validate a document against, which is precisely why the record
rejected *specifying* a parse and admitted a read.

The reader (`src/lib/protocol/arazzo.ts`) is built to that shape. It returns
null rather than throwing for any input at all, treats every field as optional
including the ones the standard marks REQUIRED, takes the first reference field
when a step illegally carries two, and steps over entries of the wrong type
instead of failing the document. It is reachable from no diagnostic path. A
renderer that meets a field it does not know draws less; a validator would have
to call the document wrong, and this one is not entitled to.

## Declared order and inferred order are different edges

The distinction the drawing exists to make. `dependsOn` is a prerequisite the
document states, so it is drawn solid and heavy. Consecutive steps are also
joined — Arazzo runs steps in the order they are written unless something says
otherwise — but that edge is *read off their position* rather than stated, so it
is dashed, and it is drawn **only where the later step declares no `dependsOn`
of its own**. Where it does, the file has already said what the order is, and a
sequence edge beside it would assert a second, weaker prerequisite nothing
claimed.

| Edge | Meaning | Width | Dash | Stroke |
| --- | --- | --- | --- | --- |
| `dependsOn` | a prerequisite the document states | 2 | solid | `--border-strong` |
| `in order` | inferred from the order the steps are written in | 1.25 | `5 4` | `--border-strong` |
| `onSuccess` | a branch taken when the criteria hold | 1.5 | `9 3 1.5 3` | `--border-strong` |
| `onFailure` | a branch taken when the step fails | 1.5 | `2 3` | `--destructive` |

Every distinction is geometric, because colour is spent on kind and a step is
not a kind
([0003-colour-is-ontology](srn://metaframework/product/portal/adr/0003-colour-is-ontology)).
The one hue is `--destructive` on failure, which is status rather than ontology
— what a red line means everywhere else in this console. Criteria ride the edge
as its label, the action's `name` beside them.

## What the canvas will not pretend

Three admissions sit under the drawing, all derived from the document so none of
them can fall behind it:

- a `goto` or a step whose reference is a `workflowId` is a jump into a
  different graph, so it becomes a **button that goes there** rather than an
  edge that cannot exist;
- a `dependsOn` or `goto` naming a step that is not in this workflow is
  **reported**, because the canvas cannot draw an edge to a node that is not
  there and dropping it silently would hide the one defect worth seeing;
- step fields present in the file and absent from the picture — `outputs`,
  `requestBody`, `parameters`, `timeout` — are **named**, which is what keeps
  the drawing from being mistaken for the document.

## Text equivalent

`arazzoSummary()` emits one sentence per step and one per edge, from the same
model the canvas draws, so the two cannot describe different workflows. The
figcaption is `sr-only` and names the workflow and its step count. Unlike the
other renderers' text forms, this one is unit-tested, because it is pure and
lives beside the model rather than inside the component.

## What is absent

No execution, no try-it, no simulation walkthrough — Respect territory, and
explicitly deferred. Nothing joins a step's `operationId` back to the operation
it names inside the sibling document: the step links to that artifact's block on
the page, and no further, because nothing in this portal parses `transport.yaml`
or `openapi.yaml` to link into. That is the same missing reader
`W_PROTO_ARAZZO_UNGROUNDED` waits on.
