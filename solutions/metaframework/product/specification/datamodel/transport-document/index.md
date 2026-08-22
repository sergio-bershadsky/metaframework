---
name: transport-document
kind: datamodel
version: 4
title: Transport document
summary: The transport.yaml mini-spec — one protocol, one wire, six binding blocks and the spec-XOR-surface-list rule; one of two dialects of the transport role, fully specified and read by no code at all.
status: review
owner: sergio
usage: storage
abstract: false
tags:
  - spec
  - format
  - protocol
---

`transport.yaml` beside a protocol's `index.md`: **how the conversation reaches
the wire**, one protocol, one transport. Specified in
`framework/spec/kinds/protocol.md` §"`transport.yaml`" — a
closed six-value `kind` enum, a binding block per kind, six surface lists, an
external-spec link and an exclusivity rule between the last two. It is the most
numerous protocol artifact in the catalog; `find solutions -name transport.yaml`
is the census.

**This entity is one of the transport role's two dialects, and no longer the
only one.** [0017-transport-asyncapi](srn://metaframework/adr/0017-transport-asyncapi)
made AsyncAPI 3.x a recognised second grammar under the same filename, and
`protocol.md` gained §"The AsyncAPI dialect of `transport.yaml`"
beside the section this entity describes. Of the 16 files, **12 are
this dialect and 4 are AsyncAPI** — measured by whether the document carries a
top-level `asyncapi:` key. Every count in this entity is a count of the 12
unless it says otherwise, and the four that left are not a loss of coverage:
they left because AsyncAPI describes their wires better, which is the finding
0017 records.

It is one of the eight formats this product owns, and the only one whose entry in
the catalog is justified by an absence rather than by a mechanism.

## No code reads it

Re-measured 2026-08-21: grepping all of `framework/portal/src` for `transport`
returns 129 hits, 20 of them outside tests, spread over 11 files — 5 in
`lib/catalog/dialects.ts`, 3 each in `lib/srn/artifacts.ts` and
`lib/history/git.ts`, 2 in the `/artifacts` route, and one apiece in
`lib/ui/kind.ts`, `lib/srn/srn.ts`, `lib/schema/url.ts`,
`lib/catalog/types.ts`, `lib/catalog/mentions.ts`,
`components/diagrams/state-simulator.tsx` and
`components/code/artifact-block.tsx`. The count is up sharply on the 11 this
entity recorded at v2 and none of the growth is a reader: every one of the 20 is
a role-table row, a dialect-table row, the `.transport` SRN suffix, or a comment
— including the pane-height note at `artifact-block.tsx:149`, "so a six-line
`transport.yaml` is not shown in a 460px window". **Not one of them opens the
document.**
What [0017](srn://metaframework/adr/0017-transport-asyncapi) added is the
sharpest illustration: `'protocol:transport'` is now the only role in
`dialects.ts` carrying two dialects, so an AsyncAPI `transport.yaml` is
recognised, records `dialect.key: 'asyncapi'` on the artifact and keeps its
native key unstripped — and recognising a grammar is not reading a document.

What happens to the file is no longer generic, and the change is recent enough
that it is worth saying precisely what moved. `readArtifacts()` in
`lib/catalog/load.ts` still reads every recognised extension in an entity
directory and parses YAML for syntax only; what changed is the layer above it.
`lib/protocol/transport-checks.ts` reads a `transport.yaml` in both dialects,
`lib/catalog/artifact-checks.ts` dispatches to it by entity kind *and* filename
alongside `workflows/*`, `states.json` and `arazzo.yaml`, and
`components/entity/entity-artifacts.tsx` carries the matching branch so the page
and the check derive the same findings from the same bytes. The file has an
artifact role and a findings footer; it no longer falls through to the default
branch.

Every code this format's contract defines now has an emitter —
`E_PROTO_TRANSPORT_SCHEMA`, `E_PROTO_TRANSPORT_BINDING`,
`E_PROTO_TRANSPORT_SPEC_CONFLICT` and `E_PROTO_SPEC_FILE` from the mini-spec,
plus 0017's `E_PROTO_TRANSPORT_ASYNCAPI`, `W_PROTO_TRANSPORT_HOST` and
`W_PROTO_SPEC_ASYNCAPI`. The debt register in `diagnostic-coverage.test.ts` holds
none of them, and holds nothing at all.

That register is the reason this section can be trusted rather than merely
asserted, and it worked in both directions: it is a ratchet, and the inventory
suite went red the moment those seven codes gained emitters, which is what forced
this page to be rewritten rather than left. The sibling
[topology-document](srn://metaframework/product/specification/datamodel/topology-document)
made the same crossing one release earlier.

The entity was worth having while nothing read the format, and it is worth having
now for the opposite reason. What it recorded then was that a documented format
with authored instances and no reader is a real state of affairs, and that a
catalog listing seven of the eight spec formats while quietly dropping the one
nothing implemented would describe a tidier repository than this one. What it
records now is the crossing itself.

One claim this page used to make was wrong in the way worth keeping on the page.
`W_PROTO_WF_CHANNEL_UNKNOWN` was called "unimplementable in practice because
there is no parsed surface list to check against" — but the document *was*
parsed, onto `artifact.data`, and collecting the surface entries' names is a walk
over an object already in hand. It needed the file **read**, not validated, and
those are different costs. `lib/protocol/payload-checks.ts` emits it, and
[workflow-document](srn://metaframework/product/specification/datamodel/workflow-document)
records the same correction from the other side.

## Why `usage: storage`

The first of the three `storage` values among this product's eight datamodels —
[topology-document](srn://metaframework/product/specification/datamodel/topology-document)
and
[config-document](srn://metaframework/product/specification/datamodel/config-document)
are the other two, and both cite this entry for the reasoning — and it is a
statement rather than a hedge.

The file is persisted in the tree and read by people and models out of the tree.
Nothing exchanges it — `transport-checks.ts` parses it to judge it, which is a
reader and not a counterparty; no third-party tool is
contracted to accept it (which is what makes
[state-machine-document](srn://metaframework/product/specification/datamodel/state-machine-document)
an exchange format — XState's `createMachine()` must take that file verbatim),
and it derives no rendering that would make it a contract between an author and
a renderer (which is what makes
[workflow-document](srn://metaframework/product/specification/datamodel/workflow-document)
`both`). Declaring `exchange` here would name a consumer that does not exist.

The nearest thing to an exchange in the format is `spec.file`, and it points
*away*: an OpenAPI, AsyncAPI or `.proto` document that the spec explicitly says
the portal treats as an opaque attachment in v1.

## What the format decides

Four rules do the work, and each one is a modelling judgement rather than a
schema detail:

- **One transport per protocol.** The binding block is keyed by *exactly* the
  `kind` value. A protocol offered over two wire technologies is two protocol
  entities, both listed by the participating components; a second block is
  `E_PROTO_TRANSPORT_BINDING`, and a `transports:` list is named as a plausible
  additive extension that v1 does not have.
- **`spec` and the surface list are mutually exclusive**
  (`E_PROTO_TRANSPORT_SPEC_CONFLICT`). Either the real spec file is the single
  source of operation truth, or — when there is none — the lightweight list is
  written here. The spec's reason is one sentence and it is the sharpest in the
  mini-spec: "Maintaining both guarantees divergence."
- **The surface list key is fixed per kind**: `operations` (http), `methods`
  (grpc), `bindings` (amqp), `topics` (kafka), `channels` (websocket),
  `functions` (in-process). One name per wire, so the shape of a transport is
  readable without knowing which kind it is first.
- **No `version:` key.** The entity's frontmatter governs the whole directory;
  an entity version is a snapshot of all its files at one commit.

The `x-` escape hatch reaches into the artifact, at the top level and inside
entries — the same rule frontmatter carries. It is used in 4 of the 12 files in
this dialect.

## What the 12 instances actually exercise

Measured 2026-08-21 across all three solutions, over the 12 mini-spec files:

| `kind`       | instances | surface list key | instances using it | before 0017 |
| ------------ | --------- | ---------------- | ------------------ | ----------- |
| `http`       | 9         | `operations`     | 7                  | 9           |
| `in-process` | 3         | `functions`      | 3                  | 3           |
| `kafka`      | 0         | `topics`         | 0                  | 3           |
| `websocket`  | 0         | `channels`       | 0                  | 1           |
| `grpc`       | 0         | `methods`        | 0                  | 0           |
| `amqp`       | 0         | `bindings`       | 0                  | 0           |

**Four of the six wire technologies now have no instance in this dialect**, up
from two at v2, and the last column says why: the `kafka` and `websocket` rows
did not empty through attrition. They are exactly the four files 0017 moved, and
they moved because those are the wires AsyncAPI describes. What is left is the
complement — `http` and `in-process`, plus a `grpc` row that never had an
instance — which is 0017's claim about permanence stated as a corpus rather than
as an argument: the mini-spec keeps the transports AsyncAPI has no expression
for, and after the migration that is all it has.

The uncomfortable reading is the honest one. This dialect now describes 12 files
across two `kind` values, and it still specifies six binding blocks and six
surface lists. Four of them are dead weight in a format nothing validates, and
the one that is *most* dead — `amqp` — is the one 0017 admits AsyncAPI for
without a single file to move.

The exclusivity rule holds across all 12: the two files carrying `spec` (both
`http`, both in acme) carry no surface list, and the 10 carrying a surface list
carry no `spec`. Nothing checked that — it is author discipline, which is the
general condition of this format.

## Where the enum strained, twice

- **A local subprocess exec has no value.** The enum is
  `http | grpc | amqp | kafka | websocket | in-process`, and none of those is
  "this library shells out to a program on the same machine". That is why no
  protocol in this solution describes [git](srn://metaframework/actor/git):
  forcing `in-process` plus an `x-` nuance field would manufacture a
  conversation out of a library calling a binary, and
  [0003-closed-ontology-of-nine-kinds](srn://metaframework/adr/0003-closed-ontology-of-nine-kinds)
  records the mismatch instead.
- **stdio JSON-RPC has no value either.** One of the 12 files takes
  `in-process` as the nearest neighbour and records the truth in `x-wire`, with
  a four-line comment above `kind:` explaining the compromise. It is in a
  fixture outside this solution, so it cannot be cited by SRN here, and the
  finding it produced is recorded in
  [0013-a-second-solution-surveyed-from-real-code](srn://metaframework/adr/0013-a-second-solution-surveyed-from-real-code).
  0017 does not relieve it: AsyncAPI is admitted for `kafka`, `websocket` and
  `amqp`, and a JSON-RPC conversation over a subprocess's stdin is none of
  those. The strain stays in this dialect because this dialect is where the
  awkward wires live now.

## The sibling schema, and the one rule it cannot hold

`schema.json` here states the mini-spec in stock 2020-12: the closed `kind`
enum, the six binding blocks with their required fields, the six surface lists,
the `spec` object, and `x-` tolerance at every level.

Two rules that read like prose turn out to be expressible, and both cost a
restatement per kind:

- **The binding block is keyed by exactly the `kind` value, and no other block
  may be present** — six `if`/`then` branches, each requiring its own block and
  negating the other five.
- **`spec` XOR the surface list** — one `dependentSchemas` clause on `spec`
  forbidding all six surface-list keys, because the key's name depends on the
  binding kind and there is no way to say "the surface list" generically.

One rule is genuinely outside it. `spec.file` MUST exist on disk, MUST NOT be
absolute and MUST NOT contain `..` (`E_PROTO_SPEC_FILE`). The schema catches the
absolute form with a pattern and nothing else: no schema resolves a filesystem,
and path containment is a decision about a tree, not about a string.

Re-run 2026-08-21 with `ajv` 2020 against every `transport.yaml` in the
repository: **12 of 16 validate**, and the 4 that do not are exactly the 4
AsyncAPI files. That is the correct result and not a regression, so it is worth
stating what the failure looks like rather than only its count. Each of the four
fails on `must have required property 'kind'` plus one `additionalProperties`
violation per native AsyncAPI key: `asyncapi`, `info`, `defaultContentType`,
`servers` and `channels` in all four, plus `id` and `operations` in
`brass/protocol/game-transport`. `x-srn` is the one top-level key that survives,
because the `^x-` hatch is in both grammars. This meta-schema *defines the
mini-spec
dialect*, its `$id` is the mini-spec's discriminator, and an AsyncAPI document
declares a different dialect in its own bytes. A document that named this URL
and then failed it would be a finding; a document that never named it and fails
it is the schema doing its job. **The number to watch is 12 of 12 in-dialect,
not 16 of 16 in the directory** — and a reader who wants one number for the
whole role wants two schemas, because there are two grammars.

The same run stripped and re-added the `$schema` line on all 12: 12 pass either
way. Twelve hand-written cases behave. Rejected: two binding blocks in one
document, a block that disagrees with `kind`, `spec` alongside a surface list,
an unknown non-`x-` top-level key, a `kind` outside the enum, a `version:` key,
an `http` block with no `base-path`, a `kafka` block with neither `topics` nor
`spec`, an absolute `spec.file`, and — the case this release added — a minimal
AsyncAPI 3.1.0 document. Accepted: an `x-` top-level key, and a `kafka` block
that delegates its topics to `spec`.

That check was a one-off run of a throwaway test, not something the repository
does. Nothing parses `transport.yaml` in either dialect, so nothing validates it
against this schema either. It is a statement of the contract rather than an
enforcement of it — the same position the format itself is in.

## The header the schema had to be reopened for

[0015-artifact-dialects](srn://metaframework/adr/0015-artifact-dialects) makes a
`transport.yaml` name its dialect in its own bytes, and the URL it names is this
entity's canonical schema URL — the `$id` at the top of the sibling file:

```yaml
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/transport-document
kind: http
http:
  base-path: /v1
```

Admitting that key was not a courtesy. Re-measured 2026-08-21 with `ajv` 2020
against the 12 mini-spec `transport.yaml` files, each run twice — once with the
`$schema` line and once with it stripped. Against the schema as it stood before
that change: **12 of 12** validated stripped and **0 of 12** validated headed.
The root `additionalProperties: false` rejected the very key that points at this
document — which is the fault 0015 disqualified Stately's `xstate.json` on, and
it applied to this schema identically. A schema a document cannot name is not a
discriminator. With `$schema` admitted, both runs pass 12 of 12, and it is now
the *stripped* run that is hypothetical: every mini-spec `transport.yaml` on
disk carries the header.

The 4 AsyncAPI files carry no `$schema` and never will, and that is the same
ruling seen from the other end. 0015's rule is that a format which already names
itself keeps doing so, so the AsyncAPI dialect is discriminated by its own
`asyncapi: 3.1.0` key and the framework adds nothing — which is why
`adoptDialect` strips the header on the mini-spec half and leaves the native key
in place on the other. One role, two discriminators, one of them not ours.

The value is typed as a non-empty string and **not** pinned with `const` to the
`$id` above, and that is a ruling rather than an omission. A file naming some
other dialect is `W_ARTIFACT_DIALECT` — a warning, read as the legacy dialect,
never broken — so a `const` would state one fact at two severities, and JSON
Schema has no dial for turning the harder one down. It would also not fire where
it is imagined to: an editor follows the URL the *file* names, so a
`transport.yaml` carrying the `journey-document` URL is judged by that schema and
never reaches this one. The join that would reach it — pick the schema from the
role, then compare — is the portal's, and the portal already warns. All six
framework meta-schemas encode the key the same way for the same reason.
