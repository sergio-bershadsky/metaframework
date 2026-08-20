---
name: workflow-document
kind: datamodel
version: 1
title: Workflow document
summary: The workflows/*.yaml mini-spec — ordered message steps plus three fragment forms, designed to be as legible raw as rendered.
status: review
owner: sergio
usage: both
abstract: false
tags:
  - spec
  - format
  - protocol
---

One named, ordered exchange between a protocol's participants, in a file at
`workflows/<name>.yaml` beside the protocol's `index.md`. Specified in
`framework/spec/kinds/protocol.md` under "The workflow mini-spec"; parsed by
`framework/portal/src/lib/protocol/workflow.ts` (1,091 lines). Measured
2026-08-19 across `solutions/acme` and `solutions/brass`, before this solution
was authored: 22 files across 14 `workflows/` directories.

`usage: both`. The file on disk is the record — there is no other statement of
the exchange — and it is also the contract between an author and two derived
renderings that must agree: the sequence diagram, and the ordered prose list
underneath it.

## The design constraint that shaped the format

The spec states it outright: the format is "designed to be as legible to an AI
reading the raw YAML as to a renderer: flat message steps by default, three named
fragment forms for structure, nothing else". Every choice follows from that.

- A step node carries **exactly one** discriminator key — `message`, `alt`,
  `opt`, `loop` — so a reader never has to work out what kind of node they are
  looking at (`E_PROTO_WF_STEP_SHAPE`).
- Steps have **no ids**. The stable key is the positional path,
  `steps[4].alt[0].steps[2]`, which makes a repeated message name — a retry, a
  poll — unambiguous with no authoring overhead. That path is also literally the
  path through the YAML, which is why `framework/portal/src/lib/artifacts/anchors.ts`
  can highlight the source lines that authored a diagram element: the mapping is
  a parse, not a translation.
- `condition` annotates one arrow and creates no branch. The spec calls this out
  as "the most common authoring mistake" and says so bluntly rather than leaving
  it to be discovered.

## What is deliberately absent from the format

No parallel fragments, no gateways, no pools or swimlanes, no timers, no
compensation, no sub-workflow invocation, no data objects. Each of those is what
turns a sequence description into BPMN. Where one is genuinely needed the spec's
answer is to split the exchange into several workflows, or to move the ordering
constraint into
[state-machine-document](srn://metaframework/product/specification/datamodel/state-machine-document).

Fragment nesting is capped at depth 3 (`E_PROTO_WF_DEPTH`) — "beyond that a
sequence diagram stops being readable". That is the one rule the sibling
`schema.json` here cannot express: a recursive `$ref` has no depth counter, so
the cap lives in the parser (`workflow.ts:264`) and in prose.

## Two derived forms, and the rule that binds them

`narrateWorkflow()` (`workflow.ts:508`) emits an ordered list of sentences from
the same parsed model that `layoutWorkflow()` (`workflow.ts:791`) turns into
geometry. On an entity page the SVG is marked decorative and the list *is* the
diagram in words. `components/diagrams/sequence-diagram.tsx` is a static import
rather than a `next/dynamic` one specifically so that narration stays in the
server HTML.

The rule behind that arrangement is stated in the renderer's own header comment:
"a picture the catalog cannot state in prose is a picture the catalog cannot
review". Accessibility and AI-readability turn out to be the same requirement.

## What the loader checks, and where it never runs

`workflow.ts` implements the mini-spec's own error classes fail-soft — a
violation becomes a diagnostic, not an exception. But those diagnostics are
produced when the portal **renders a protocol page**, not when it loads the
catalog: they never reach `/diagnostics`, and the module's own test suite runs
against hermetic fixtures rather than against `solutions/`. So a malformed
workflow in this repository is discovered by opening its page, and by nothing
else.

Two rules in the spec are not implemented at all: `W_PROTO_WF_CHANNEL_UNKNOWN`,
which would cross-check a step's `channel` against the transport's surface list,
and `W_PROTO_ARTIFACT_UNKNOWN`. The first is unimplementable in practice for the
reason
[transport-document](srn://metaframework/product/specification/datamodel/transport-document)
records: nothing in the portal parses `transport.yaml`, so there is no surface
list to check against.
