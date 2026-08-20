---
name: transport-document
kind: datamodel
version: 1
title: Transport document
summary: The transport.yaml mini-spec — one protocol, one wire, six binding blocks and the spec-XOR-surface-list rule; fully specified and read by no code at all.
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
`framework/spec/kinds/protocol.md` §"`transport.yaml`" (lines 263–493) — a
closed six-value `kind` enum, a binding block per kind, six surface lists, an
external-spec link and an exclusivity rule between the last two. Measured
2026-08-20 with `find solutions -name transport.yaml`: **15 instances** — 9 in
`solutions/acme`, 4 in `solutions/brass`, 2 in this solution.

It is one of the five formats this product owns, and the only one whose entry in
the catalog is justified by an absence rather than by a mechanism.

## No code reads it

Grepping all of `framework/portal/src` for `transport` returns 11 hits. Two are
outside tests, and neither parses anything:

- `components/code/artifact-block.tsx:149` — a comment about pane height, "so a
  six-line `transport.yaml` is not shown in a 460px window".
- `lib/ui/kind.ts:69` — the protocol kind's one-line blurb, "How components talk
  — transport, workflows, state machines."

The remaining nine are fixture strings in `load.test.ts`, `fingerprint.test.ts`,
`git.test.ts` and `fixture-check.test.ts`.

What actually happens to the file is generic. `readArtifacts()` in
`lib/catalog/load.ts` reads every recognised extension in an entity directory
and parses YAML for syntax only; `components/entity/entity-artifacts.tsx`
dispatches on entity kind *and* filename — `schema.json` on a datamodel,
`workflows/*` on a protocol, `states.json` on a protocol — and there is no
`TRANSPORT_FILE` constant to match against. `transport.yaml` falls through to
the default branch and renders as a YAML code block. Its own contract decides
nothing.

`grep -rn "E_PROTO_TRANSPORT\|E_PROTO_SPEC_FILE" framework/portal/src` returns
**0**. All four of the codes the mini-spec defines —
`E_PROTO_TRANSPORT_SCHEMA`, `E_PROTO_TRANSPORT_BINDING`,
`E_PROTO_TRANSPORT_SPEC_CONFLICT`, `E_PROTO_SPEC_FILE` — are implemented
nowhere, and `lib/protocol/` contains modules for workflows and state machines
and none for transports.

This is the format's whole reason for having an entity. A documented format with
15 authored instances and no reader is a real state of affairs, and a catalog
that listed four of the five spec formats and quietly dropped the one nothing
implements would be describing a tidier repository than this one. The gap is
also load-bearing elsewhere: `W_PROTO_WF_CHANNEL_UNKNOWN` — a workflow step's
`channel` cross-checked against the transport's surface list — is unimplementable
in practice because there is no parsed surface list to check against, which
[workflow-document](srn://metaframework/product/specification/datamodel/workflow-document)
records from the other side.

## Why `usage: storage`

The only `storage` value in this product's five datamodels, and it is a
statement rather than a hedge.

The file is persisted in the tree and read by people and models out of the tree.
Nothing exchanges it: no portal module parses it, no third-party tool is
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
entries — the same rule frontmatter carries. It is used in 4 of the 15 files on
disk.

## What the 15 instances actually exercise

Measured 2026-08-20 across all three solutions:

| `kind`       | instances | surface list key | instances using it |
| ------------ | --------- | ---------------- | ------------------ |
| `http`       | 8         | `operations`     | 6                  |
| `kafka`      | 3         | `topics`         | 3                  |
| `in-process` | 3         | `functions`      | 3                  |
| `websocket`  | 1         | `channels`       | 1                  |
| `grpc`       | 0         | `methods`        | 0                  |
| `amqp`       | 0         | `bindings`       | 0                  |

Two of the six wire technologies, and therefore two of the six binding blocks
and two of the six surface lists, have **no instance anywhere in the
repository**. They are specified, described in the spec's field tables, and
untested by any authored file.

The exclusivity rule holds across all 15: the two files carrying `spec` (both
`http`, both in acme) carry no surface list, and the 13 carrying a surface list
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
- **stdio JSON-RPC has no value either.** One of the 15 files takes
  `in-process` as the nearest neighbour and records the truth in `x-wire`, with
  a four-line comment above `kind:` explaining the compromise. It is in a
  fixture outside this solution, so it cannot be cited by SRN here, and the
  finding it produced is recorded in
  [0013-a-second-solution-surveyed-from-real-code](srn://metaframework/adr/0013-a-second-solution-surveyed-from-real-code).

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

Checked 2026-08-20 with `ajv` 2020: all 15 `transport.yaml` files in the
repository validate, and eleven hand-written cases behave. Rejected: two binding
blocks in one document, a block that disagrees with `kind`, `spec` alongside a
surface list, an unknown non-`x-` top-level key, a `kind` outside the enum, a
`version:` key, an `http` block with no `base-path`, a `kafka` block with
neither `topics` nor `spec`, and an absolute `spec.file`. Accepted: an `x-`
top-level key, and a `kafka` block that delegates its topics to `spec`.

That check was a one-off run of a throwaway test, not something the repository
does. Nothing parses `transport.yaml`, so nothing validates it against this
schema either. It is a statement of the contract rather than an enforcement of
it — the same position the format itself is in.
