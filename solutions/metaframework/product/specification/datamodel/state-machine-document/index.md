---
name: state-machine-document
kind: datamodel
version: 2
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

`states.json` beside a protocol's `index.md`: the state of **one conversation**
as the protocol sees it, never the internal state of any single participant.
Specified in `framework/spec/kinds/protocol.md`; validated by
`framework/portal/src/lib/protocol/states.ts` (613 lines). Measured 2026-08-21
with `find solutions -name states.json`: **8 instances** — 6 in `solutions/acme`,
2 in `solutions/brass`, none in this solution.

That is exactly the eight-instance threshold this catalog applied, and the
smallest of the six formats admitted by it. Two of this product's eight formats
sit below it —
[topology-document](srn://metaframework/product/specification/datamodel/topology-document)
at 7 and
[config-document](srn://metaframework/product/specification/datamodel/config-document)
at 6 — and neither is a counter-example, because
[specification](srn://metaframework/product/specification) admitted them under a
different rule: a dialect URL needs an entity behind it whatever the instance
count says.

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

## The header the schema had to be reopened for

[0015-artifact-dialects](srn://metaframework/adr/0015-artifact-dialects) makes a
`states.json` name its dialect in its own bytes, and the URL it names is this
entity's canonical schema URL — the `$id` at the top of the sibling
`schema.json`:

```json
{
  "$schema": "https://schemas.metaframework.dev/metaframework/product/specification/datamodel/state-machine-document",
  "id": "order-placement",
  "initial": "submitted",
  "states": { "submitted": { "type": "final" } }
}
```

Admitting that key was not a courtesy. Re-measured 2026-08-21 with `ajv` 2020
against all 8 `states.json` files, each run twice — once with the `$schema` line
and once with it stripped. Against the schema as it stood before this change:
**8 of 8** validated stripped and **0 of 8** validated headed, because the root
`additionalProperties: false` rejected the very key that points at this
document. That is precisely the fault 0015 disqualified Stately's `xstate.json`
on — "a schema a document cannot name is disqualified as a discriminator by
construction" — and it applied to this schema, in this repository, exactly as it
applied to theirs. With `$schema` admitted, both runs pass 8 of 8, and it is now
the *stripped* run that is hypothetical: every `states.json` on disk carries the
header.

On the loader's path the key never reaches the subset: the dialect is recorded
and the key deleted before `parseStates` is handed the document, so the spec's
claim that `createMachine()` accepts the file verbatim stays a statement about
the residue.

`machineSchema` admits the key all the same, as one optional non-empty string
(`framework/portal/src/lib/protocol/states.ts`). That is a carve-out, and it is
there for the callers who never pass through the loader — a fixture, a test, an
external consumer reading the bytes off disk. Without it, following the header
this document tells an author to write would earn them
`E_PROTO_STATES_SUBSET` on a file the spec had just prescribed. The admission is
doubly load-bearing here, because this same schema is what *generates* the
published meta-schema: were the two to disagree about `$schema`, the document
served from the canonical URL would contradict the validator it is derived from.

The value is typed as a non-empty string and **not** pinned with `const` to the
`$id`, and that is a ruling rather than an omission. A file naming some other
dialect is `W_ARTIFACT_DIALECT` — a warning, read as the legacy dialect, never
broken — so a `const` would state one fact at two severities, and JSON Schema has
no dial for turning the harder one down. Nor would it fire where it is imagined
to: an editor follows the URL the *file* names, so a `states.json` carrying the
`journey-document` URL is judged by that schema and never reaches this one. All
six framework meta-schemas encode the key the same way, and this format is the
one where they could not have chosen otherwise — see below.

## Generated, not written

`framework/portal/src/lib/protocol/state-machine-document.ts` emits this
entity's meta-schema from `machineSchema`, the zod validator `parseStates`
actually runs, and a golden test holds the portal's copy byte-identical to that
emission. The reason is stated in the module's own header: a hand-written
meta-schema beside the validator is a second statement of one contract, and the
two drift the first time the subset moves.

That is also what settles the `const` question for the whole set. To pin the
value here, the published schema would have to be either stricter than the
validator it is generated from — which is the drift the generator exists to
prevent — or generated from a `machineSchema` that pins it too, and *that* would
make a foreign dialect a hard `E_PROTO_STATES_SUBSET` error at load time, in a
parser the loader was careful to hand a stripped document to. The unpinned string
is the only encoding all six meta-schemas can share, and it is the one they do.

The published copy in this directory is **not yet** that emission. It is
hand-written and carries twelve `description` strings where a regeneration would
leave two — the root's and `$schema`'s — so the ten sentences that explain *why*
the subset is drawn where it is would be lost in the act of removing the drift.
Closing that gap is an open `it.todo` in
`framework/portal/src/lib/protocol/state-machine-document.test.ts` rather than a
line of this document. What was closed here is narrower and was the blocking
half: the header is admitted, in the encoding the generator emits and with the
sentence the generator now carries, so a regeneration will not silently take it
away again.

## Absent

Exactly one machine per protocol. A `states/` subdirectory for several is named
in the spec as "a plausible additive extension, not v1".

`E_PROTO_STATES_*` diagnostics reach a reader only when a protocol page renders.
Like every other `E_PROTO_*` class they are tested against hermetic fixtures and
never run over `solutions/`, so they do not appear on `/diagnostics` and no count
of them exists.
