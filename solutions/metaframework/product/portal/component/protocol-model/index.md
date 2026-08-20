---
name: protocol-model
kind: component
version: 2
title: Protocol model
summary: The workflow mini-spec parser, the XState-subset validator, and the pure mermaid compiler — three files answering one question, and none of their diagnostics reaches /diagnostics.
status: review
owner: sergio
component-type: library
lifecycle: released
relations:
  depends-on:
    - ../srn
  uses:
    - /product/specification/datamodel/workflow-document@1
    - /product/specification/datamodel/state-machine-document@1
tags:
  - protocol
  - diagrams
---

`src/lib/protocol/` — `workflow.ts` (1,091 lines), `states.ts` (569),
`mermaid.ts` (241), with 1,287 lines of tests across the three. One component,
because all three answer the same question: turn a protocol's sibling artifact
into something that can be drawn *and* stated in prose.

## `workflow.ts` — two halves, deliberately apart

`parseWorkflow()` turns raw YAML into a typed tree, collecting spec error
classes instead of throwing: `E_PROTO_WF_SCHEMA`, `E_PROTO_WF_NAME`,
`E_PROTO_WF_STEP_SHAPE`, `E_PROTO_WF_ALIAS`, `E_PROTO_WF_EMPTY_BRANCH`,
`E_PROTO_WF_DEPTH`, `E_PROTO_WF_FANOUT`, and the warning
`W_PROTO_WF_ORPHAN_RETURN`. A workflow with one bad step still draws, with the
diagnostic visible.

`layoutWorkflow()` turns that tree into **geometry — numbers only, no DOM, no
React**. A sequence diagram is a strict grid: lifelines are columns, steps are
ordered rows, fragments are nested boxes. That is precisely the shape a
free-positioning graph library cannot express and a solver can, and keeping the
pass pure is what makes the flagship visual unit-testable.

`narrateWorkflow()` is the third export and the one that carries a rule rather
than a feature. It emits the ordered prose the sequence diagram's SVG is the
picture of. Steps have no ids; the stable key for one is its positional path,
`steps[4].alt[0].steps[2]`, which makes a repeated message name in a retry loop
unambiguous with no authoring overhead — and which is also, letter for letter,
that step's path through the YAML, so diagram-to-source anchoring is a parse
rather than a translation.

## `states.ts` — a subset of somebody else's format

`states.json` is a real XState v5 machine configuration, and the requirement is
that `createMachine()` accept the file verbatim. So this module validates a
*subset of XState* rather than a private format: `E_PROTO_STATES_ID` (the
machine id must equal the entity name), `E_PROTO_STATES_TARGET` (a sibling key
or an absolute `#id.path`, never relative descent — the form that most often
silently resolves to the wrong node), `E_PROTO_STATES_EVENT_NAME`
(`^[A-Z][A-Z0-9_]*$`), and `E_PROTO_STATES_SUBSET` for anything carrying data or
executing.

`OUT_OF_SUBSET_KEYS` names `context`, `assign`, `always`, `after`, `invoke`,
`input`, `output` and `meta` explicitly rather than letting them fall into a
generic "unrecognized key". The reason is stated in the file: a diagnostic that
says *why* a key is rejected is the difference between a five-second and a
five-minute fix.

The nested config is flattened once, here, into a node/edge chart, so the
renderer never walks the config and the same model can be asserted on in tests
without a DOM.

## `mermaid.ts` — the executable form of an amendment

Decision-record amendment 2026-08-19-e made state charts mermaid,
`stateDiagram-v2`, always. `statesToMermaid()` is a pure function from the
flattened chart to diagram text, which means every word on the drawing is
decided in a tested function and the component only renders that text.

The compiler carries knowledge nobody wants to rediscover: chart ids are dot
paths of kebab keys and mermaid's bare-id token is `[^:\n\s\-{]+`, so a dash or
a dot splits an id mid-token — hence an injective alias encoding. Internal
transitions become description lines rather than arrows, because an arrow that
leaves and re-enters would claim exit and entry actions run, which is exactly
what `internal` denies. Parallel self-transitions collapse into one arrow
statement with one label line each, because mermaid keys a state's loop edges by
their shared endpoints and of N separate loop statements only the last is drawn
(verified against mermaid 11.17).

## Where these diagnostics go

Nowhere. **No `E_PROTO_*` code ever reaches
[diagnostics-report](srn://metaframework/product/portal/component/console/component/diagnostics-report).**
This module is invoked when a protocol page *renders*, not when the catalog
loads, so its findings live on that page and never enter `catalog.diagnostics`.
Its suites run against hermetic fixtures and are never pointed at `solutions/`.

## What is specified and absent

`transport.yaml` has a full mini-spec in the protocol kind document — a closed
`kind` enum, binding blocks, the `spec`/surface-list exclusivity rule — and
**this component has no parser for it**. Grepping `src` for `transport` outside
tests returns two hits, neither of them a parser: a sizing comment in
`artifact-block.tsx:149` and the protocol kind's blurb string in
`lib/ui/kind.ts:69`. The file renders as generic YAML like any other, and
`E_PROTO_TRANSPORT_SCHEMA`, `E_PROTO_TRANSPORT_BINDING`,
`E_PROTO_TRANSPORT_SPEC_CONFLICT` and `E_PROTO_SPEC_FILE` are implemented
nowhere. The catalog has 15 authored `transport.yaml` files — nine in acme, four
in brass, and the two in this product — and not one of them has ever been
validated by anything.

Two more gaps in the same direction: `W_PROTO_WF_CHANNEL_UNKNOWN` — which would
check a step's `channel` against the transport's surface list — cannot exist
without that parser; and `E_PROTO_PARTICIPANT_KIND`, `E_PROTO_ALIAS_DUP` and
`E_PROTO_PAYLOAD_KIND` are unimplemented, so a participant pointing at a
datamodel is caught only if the reference dangles. The one participant rule that
*is* enforced is "at least two", and it arrives as `E_FM_SCHEMA` from the zod
schema in
[catalog-loader](srn://metaframework/product/portal/component/catalog-loader),
under the wrong code.
