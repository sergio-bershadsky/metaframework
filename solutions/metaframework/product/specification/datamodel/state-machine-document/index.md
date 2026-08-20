---
name: state-machine-document
kind: datamodel
version: 1
title: State machine document
summary: states.json — an XState v5 machine config, pinned to a subset that createMachine() must accept verbatim; the strongest exchange case in the set.
status: review
owner: sergio
usage: exchange
abstract: false
relations:
  uses:
    - ../workflow-document
tags:
  - spec
  - format
  - protocol
---

# State machine document

`states.json` beside a protocol's `index.md`: the state of **one conversation**
as the protocol sees it, never the internal state of any single participant.
Specified in `framework/spec/kinds/protocol.md`; validated by
`framework/portal/src/lib/protocol/states.ts` (569 lines). Measured 2026-08-19
across `solutions/acme` and `solutions/brass`, before this solution was authored:
8 instances — the smallest of the five formats, and still above the eight-instance
threshold this catalog applied.

## Why `usage: exchange`

This is the clearest case in the set, and the reason is not that the file crosses
a network. The spec's requirement is that `createMachine()` accept the file
verbatim — "that is the point of pinning a subset rather than inventing a
format". The contract is therefore held with a third-party library, XState v5, and
not merely with this portal. A format whose correctness is decided by somebody
else's parser is an exchange format whatever it is stored in.

## The subset is a boundary, not a simplification

Outside it: `context`, `assign`, `always`, `after`, `invoke`, `input`, `output`,
`meta`, `type: "parallel"`, `type: "history"`, wildcard events, and object-form
actions or guards. Any of them is `E_PROTO_STATES_SUBSET`.

The rationale is one sentence in the spec and it is the sharpest statement of
what this catalog is for: "the catalog documents contracts, not runtime behaviour
— anything carrying data or executing is out. Data shapes belong to datamodels;
timers and invocations belong to the implementing component."

Two smaller rules earn their place the same way. Target resolution supports a
sibling key and an absolute id path and nothing else, because relative descent
"is the form that most often silently resolves to the wrong node". Event names
must match `^[A-Z][A-Z0-9_]*$`, which excludes the wildcard `"*"` by construction
rather than by a separate prohibition.

## The join with workflows

An event name maps to a workflow message name by lowercasing and turning `_` into
`-`: `STOCK_RESERVATION_RESULT` ⇔ `stock-reservation-result`. That is the
`uses` edge on this entity — the state machine's vocabulary is checked against
[workflow-document](srn://metaframework/product/specification/datamodel/workflow-document)'s,
one way only. An event with no corresponding message anywhere in the protocol's
workflows is `W_PROTO_STATES_EVENT_UNKNOWN`; the reverse is deliberately not
checked, because plenty of messages carry no state change.

## The one format whose renderer was replaced by decision

Decision-record amendment 2026-08-19-e (commit 5b8a3e8, 2026-08-19 21:18) rebuilt
the state chart on mermaid `stateDiagram-v2`, always. The artifact and its
validator were untouched: `parseStates` stays validator and model, and
`framework/portal/src/lib/protocol/mermaid.ts` (241 lines) is a pure, tested
function that decides every word on the drawing. The component only renders that
text and post-processes the SVG.

The join between the two is worth recording because it is defensive in a way
diagrams usually are not: states join by mermaid's stable node ids, but
transitions join **by rank** against the generator's `edgeOrder`, and the join is
verified by count before it is trusted. If the SVG disagrees, edge interactivity
is dropped rather than mis-wired.

What the amendment knowingly gave up is listed in the record itself: pan and
zoom, the density toggle, hover detail panels, and — stated as a contract term —
"fine-grained interactivity is best-effort, not contractual".

## Absent

Exactly one machine per protocol. A `states/` subdirectory for several is named
in the spec as "a plausible additive extension, not v1".

`E_PROTO_STATES_*` diagnostics reach a reader only when a protocol page renders.
Like every other `E_PROTO_*` class they are tested against hermetic fixtures and
never run over `solutions/`, so they do not appear on `/diagnostics` and no count
of them exists.
