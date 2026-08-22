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

## `transport-checks.ts` — the mini-spec and the profile, in one module

`transport.yaml` has a full mini-spec in the protocol kind document — a closed
`kind` enum, binding blocks, the `spec`/surface-list exclusivity rule — and a
second dialect beside it, the AsyncAPI profile
[0017-transport-asyncapi](srn://metaframework/adr/0017-transport-asyncapi) added.
This module reads both, and reads them as two grammars that share no rule,
because the kind document states none in common between them.

Which branch runs comes from `artifact.dialect` — the loader's own ruling,
recorded once by [catalog-loader](srn://metaframework/product/portal/component/catalog-loader)
— and never from sniffing the document. That is what makes a file declaring
`$schema` *and* `asyncapi:` the mini-spec, which is the kind document's own
worked counter-example, and it is what makes an `asyncapi:` version outside the
recognised band fall back to the legacy grammar rather than to a reader that
would not understand it.

The module is pure: a parsed document and a handful of optional facts about the
owning entity go in, diagnostics come out. There is no filesystem in it and no
catalog. Four of the six profile rules need something only the entity knows — the
`x-srn` must be the entity's SRN, `info.title` its title, an `operations`
document's `id` one of its participant refs — so those travel in as options, and
an option the caller omits leaves its rule **unchecked** rather than assumed. A
reader with only the bytes gets every verdict the bytes can support and no
invented one.

## `participants-checks.ts`, `payload-checks.ts`, `spec-file-checks.ts`

Three modules that judge a protocol from outside its artifacts, and they are here
rather than in the artifact fold because none of them can be answered from one
file:

- **`participants-checks.ts`** owns the `participants` list. Three modules
  already *resolved* that list before it existed — `lib/structure` for the
  nearest-common-ancestor rule, `lib/actor` for the orphan rule,
  `lib/journey/artifacts` for the hop rule — and each treated a participant it
  could not use as somebody else's finding, correctly, because none of them owned
  the surface. The list was read three ways and judged by nobody.
- **`payload-checks.ts`** owns two joins: a payload reference against the kind it
  resolves to, and a workflow step's `channel` against the transport's surface,
  in whichever dialect the transport is written. It reads both surfaces
  *structurally* rather than by key scan — `message:` is an arrow label in a
  workflow step and an SRN in a transport surface entry, and a join may guess
  between those where a diagnostic may not.
- **`spec-file-checks.ts`** owns the entity **directory** and the `style`
  declaration. It is the protocol kind's JRN4/JRN9, and like them it needs a
  directory listing rather than a document, which
  [catalog-loader](srn://metaframework/product/portal/component/catalog-loader)
  now takes for protocols alongside journeys — recursive and by path, because a
  linked spec file may sit in a subdirectory and a `pricing.proto` never becomes
  an artifact at all.

## What is specified and absent

The debt register in `lib/catalog/diagnostic-coverage.test.ts` is **empty**:
every class the protocol kind document defines has an emitter, and the sixteen
that did not were the last entries in it. What is absent is narrower than it was,
and none of it is a missing class.

**The derived views.** The kind document specifies that the AsyncAPI dialect be
parsed rather than served as bytes *because* it feeds three views — a transport
card, a message × datamodel matrix, and a surface list. None of the three is
built. The file is parsed and judged and still renders as generic YAML, so the
reason given for parsing it is not yet the reason it is parsed. `transport.yaml`
now carries an artifact role and a findings footer on the entity page and nothing
more.

**One class with an unreachable branch.** `W_PROTO_STATES_EVENT_UNKNOWN` is
written in `states.ts` and needs the workflow message list, which neither call
site passes. It has an emitter and no path to it — which is why it is not a
register row, and why "every class has an emitter" is a weaker statement than
"every rule fires".

**Two half-rules on the payload surfaces.** A payload reference that resolves to
a legal-but-absent SRN is `E_SRN_DANGLING`'s, and nothing raises it on the
workflow, mini-spec or AsyncAPI surface. On the two *transport* surfaces
`E_SRN_SYNTAX`, `E_SRN_CROSS_SOLUTION` and `E_SRN_ARTIFACT` have no owner either;
`workflow.ts` files them for a workflow `payload` only. Neither can be a register
row, because a register keyed by code cannot hold half a rule — they live as
`it.todo`s beside the clause that does fire, which is the treatment JRN11 and
JRN12 already get.
