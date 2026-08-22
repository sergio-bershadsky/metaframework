---
name: protocol-model
kind: component
version: 7
title: Protocol model
summary: Workflow parser, XState-subset validator, mermaid compiler, generated meta-schema, XState normalizer, Arazzo reader and Arazzo grounding — seven modules; the one that judges is not the one that draws.
status: review
owner: sergio
component-type: library
lifecycle: released
relations:
  depends-on:
    - ../srn
  uses:
    - /product/specification/datamodel/workflow-document@4
    - /product/specification/datamodel/state-machine-document@3
  realizes:
    - /capability/derived-visualization
tags:
  - protocol
  - diagrams
---

`src/lib/protocol/` — seven source modules: `workflow.ts`, `states.ts`,
`mermaid.ts`, `state-machine-document.ts`, `xstate.ts`, `arazzo.ts` and
`arazzo-grounding.ts`, with `workflow.ts` by far the largest, against a test
suite for each of them. A `vendor/` directory beside them holds one third-party
schema, pinned and licensed. One component, because six of the seven answer the
same question: turn a protocol's sibling artifact into something that can be
drawn, stated in prose, and handed to somebody else's parser unchanged.
`arazzo-grounding.ts` is the seventh and answers the opposite one — it draws
nothing and asks only whether an `arazzo.yaml`'s references land inside its own
entity — and it lives here because that question is only answerable from the
same parsed artifacts the other six read.

`state-machine-document.ts`, `xstate.ts` and `vendor/` all arrived with
[0015-artifact-dialects](srn://metaframework/adr/0015-artifact-dialects) and are
described together below. The three older modules kept their jobs: `mermaid.ts`
is untouched, and `workflow.ts` and `states.ts` each moved by one thing only —
admitting `$schema` by name, so a caller holding raw file bytes gets the legacy
dialect read instead of an unknown-key error on a file the spec told the author
to write.

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

## `state-machine-document.ts` — the meta-schema is generated, not written

[0015-artifact-dialects](srn://metaframework/adr/0015-artifact-dialects) makes a
`states.json` name its dialect by URL, and that URL has to dereference to a
schema that accepts the document — otherwise the header a catalog was told to
add turns every file red in the first editor that follows it. So the framework
publishes its own, and `buildStateMachineDocumentSchema()` emits it from
`machineSchema`: the zod validator `parseStates` actually runs, plus an overlay
of the rules JSON Schema can express and zod cannot, reading `KEBAB` and
`EVENT_NAME` out of the validator rather than restating the patterns.

Generated rather than hand-written for one reason, stated in the module's own
header: a hand-written meta-schema beside the validator is a second statement of
one contract, and the two drift the first time the subset moves. A golden test
holds the checked-in `state-machine-document.schema.json` byte-identical to
today's emission, and a second pair of tests runs the schema over every
`states.json` in `solutions/` twice — as authored and again with the header — and
then checks that the schema and `parseStates` agree on the same corpus. One
contract, two engines.

What the schema still cannot decide is the list `states.ts` keeps: that `initial`
names a key of its own `states`, that a target resolves, that a state is
reachable, that the machine id equals the entity name. Those stay
`E_PROTO_STATES_TARGET`, `E_PROTO_STATES_ID` and `W_PROTO_STATES_UNREACHABLE`.

## `xstate.ts` and `vendor/` — proving the subset really is XState

The spec's claim about `states.json` is that `createMachine()` accepts the file
verbatim, and nothing checked it until this release. Stately publishes a JSON
Schema for XState and it cannot be pointed at an authored file as-is, for two
separate reasons. It describes only XState's **normalized** surface, so every
piece of shorthand the subset is written in — a bare string target, a single
action name where a list is allowed, one transition where an array is allowed —
is rejected. And every object in it is closed with `additionalProperties: false`,
which forbids the `$schema` key that would point an author at it; that second
fault is exactly what disqualified it as this format's discriminator.

`toXStateJson()` answers the first. It is a one-way expansion from the authored
subset to the normalized surface, built key by key from the authored keys rather
than by spreading the input, so the dialect header can never leak into an export
that XState's own schema would then reject. The same function used forward is the
export-to-XState-JSON action. It is never a way back: the shorthand an author
wrote is not recoverable from the expansion, and guard and action names stay
prose references a consumer must `.provide()` before a guarded transition will
fire.

`vendor/xstate.schema.json` is the target — the schema shipped in
`@statelyai/sdk@0.21.0`, MIT, pinned by sha256 with its provenance and licence
recorded in `vendor/README.md`. Vendored rather than fetched because the portal's
guarantee is that a catalog renders with no external network, and a conformance
test that fetched would make CI depend on a third party's CDN. It is a
downstream check and must not become the authority — that is `states.ts` and the
meta-schema published at
[state-machine-document](srn://metaframework/product/specification/datamodel/state-machine-document),
which is the only one of the two that a `states.json` can name.

## `arazzo.ts` — the one module that reads without judging

The newest module, and the only one whose contract is defined by what it
refuses to do. `arazzo.yaml` joined the role table under
[0020-arazzo-as-a-sibling-role](srn://metaframework/adr/0020-arazzo-as-a-sibling-role)
as an artifact with **no grammar**: `framework/spec/kinds/protocol.md` states no
field table for it, so nothing raises a shape complaint against one.
Grammar-free is not unread, and this module is the difference. `readArazzo()`
turns the already-parsed YAML into a typed tree; `arazzoGraph()` turns one
workflow of that tree into nodes and edges, numbers and ids only, the same
no-DOM discipline `layoutWorkflow()` keeps; `arazzoSummary()` states the same
graph in prose.

Everything about it is shaped by having no grammar to assert. It returns `null`
rather than throwing for any input at all, emits no diagnostic and is reachable
from no diagnostic path, and treats every field as optional — including the ones
the Arazzo specification marks REQUIRED, because a document this reader does not
understand is not a document it is entitled to reject. Where it declines to draw
something it records that in `omitted` rather than letting the picture imply it
was the whole file; the raw source pane beside it is the file.

This is the only module here that reads an artifact the framework does not own
the meta-schema for, and the only one for which "no parser" was never the
alternative on offer — the alternative was no drawing.

## `arazzo-grounding.ts` — the one module that judges without drawing

Its mirror, and a separate file for exactly that reason. `arazzo.ts` promises in
its own docblock to be reachable from no diagnostic path, and
[0020](srn://metaframework/adr/0020-arazzo-as-a-sibling-role) calls that promise
the executable form of its third decision — so a `W_PROTO_ARAZZO_UNGROUNDED`
literal inside it, or an import of it from here, would falsify one half of the
sentence or the other. The two share no function; this module walks the raw
document itself, which it has to anyway, because `readArazzo()` returns null for
a document with no `workflows` array and such a document can still name a source
that is not there.

What it checks is the one rule the kind document states about the file, and it
is a rule about *references between artifacts* rather than about Arazzo: a
source description must name a sibling this entity carries, and every operation,
channel or workflow a step names must resolve inside it. Resolution is per
grammar — an `operationId` is a key of `paths` in OpenAPI and a key of
`operations` in AsyncAPI, a pointer walks a document's keys — and each of the
three cases where it stays silent is a position rather than a gap: a grounding
document in a grammar this module cannot read, a sibling that did not parse, and
a source that already failed the first clause and takes one finding rather than
one per step.

It is the first module in this component whose findings reach the catalog, and
`lib/catalog/artifact-checks.ts` is the branch that carries them there.

## Where these diagnostics go

To
[diagnostics-report](srn://metaframework/product/portal/component/console/component/diagnostics-report),
and to `metaframework check`, by one route: `lib/catalog/artifact-checks.ts`.
That module dispatches on entity kind × filename — the same table the entity
page uses — and folds `states.ts`, `workflow.ts` and `arazzo-grounding.ts` into
`catalog.diagnostics` as the catalog composes. The two surfaces must derive the
same findings from the same file: a diagnostic that appears on the page and not
on /diagnostics is worse than one that appears on neither.

The modules here are still pure and still know nothing about the catalog. They
are handed a parsed artifact and return findings; the fold is what makes those
findings a gate. Their own suites run against hermetic fixtures, and the shipped
catalog is asserted separately, in `lib/catalog/fixture-check.test.ts`.

One deliberate gap survives the fold: `W_PROTO_STATES_EVENT_UNKNOWN` needs the
workflow message list, which neither call site passes, so nothing emits it and
neither surface is stricter than the other.

## What is specified and absent

`transport.yaml` has a full mini-spec in the protocol kind document — a closed
`kind` enum, binding blocks, the `spec`/surface-list exclusivity rule — and
**this component has no parser for it**, in either of the two dialects that file
now admits. Grepping `src` for `transport` outside tests turns up nothing that
reads one: comments, the protocol
kind's blurb string in `lib/ui/kind.ts`, the role-table row in
`lib/srn/artifacts.ts` that makes the file addressable, and the two
dialect-registry rows in `lib/catalog/dialects.ts` — the framework `$schema` that
[0015-artifact-dialects](srn://metaframework/adr/0015-artifact-dialects)
requires, read and stripped, and the native `asyncapi:` that
[0017-transport-asyncapi](srn://metaframework/adr/0017-transport-asyncapi) added
beside it, recognised and left in place. Identity, in other words, and no reader:
none of those lines looks at a field of the document beneath. The file still
renders as generic YAML like any other, and `E_PROTO_TRANSPORT_SCHEMA`,
`E_PROTO_TRANSPORT_BINDING`, `E_PROTO_TRANSPORT_SPEC_CONFLICT`,
`E_PROTO_TRANSPORT_ASYNCAPI` and `E_PROTO_SPEC_FILE` appear in `src` as five rows
of the debt register in `lib/catalog/diagnostic-coverage.test.ts`, and once more
as a comment in `dialects.test.ts` — nowhere else. The AsyncAPI row reads "the
AsyncAPI dialect is detected and never read", which is the whole of what a second
dialect cost this component. Every catalog under `solutions/` authors
`transport.yaml` files — `find solutions -name transport.yaml` lists them, in
both dialects — and not one of them has ever been validated by anything.

Two more gaps in the same direction: `W_PROTO_WF_CHANNEL_UNKNOWN` — which would
check a step's `channel` against the transport's surface list — cannot exist
without that parser; and `E_PROTO_PARTICIPANT_KIND`, `E_PROTO_ALIAS_DUP` and
`E_PROTO_PAYLOAD_KIND` are unimplemented, so a participant pointing at a
datamodel is caught only if the reference dangles. The one participant rule that
*is* enforced is "at least two", and it arrives as `E_FM_SCHEMA` from the zod
schema in
[catalog-loader](srn://metaframework/product/portal/component/catalog-loader),
under the wrong code.
