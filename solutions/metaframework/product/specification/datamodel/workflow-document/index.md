---
name: workflow-document
kind: datamodel
version: 3
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
`framework/portal/src/lib/protocol/workflow.ts`. Most protocols in the catalog
own a `workflows/` directory and several own more than one file in it; the
protocol page renders what is there, and `find solutions -name "*.yaml" -path
"*/workflows/*"` is the census.

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

## The header the schema had to be reopened for

[0015-artifact-dialects](srn://metaframework/adr/0015-artifact-dialects) makes a
`workflows/<name>.yaml` name its dialect in its own bytes, and the URL it names
is this entity's canonical schema URL — the `$id` at the top of the sibling
`schema.json`:

```yaml
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/workflow-document
name: place-order
title: Place an order
steps:
  - message: submit-order
    from: shopper
    to: checkout
```

Admitting that key was not a courtesy. Measured 2026-08-21 with `ajv` 2020
against every `workflows/*.yaml` in the repository, all **24** of them: before
`$schema` was admitted, all 24 validated bare and **not one** validated with the
header prepended. The root `additionalProperties: false` rejected the very key
that points at this document — the fault 0015 disqualified Stately's
`xstate.json` on, applied here to a schema of our own. A schema a document cannot
name is not a discriminator.

That is not a hypothetical any more. All 24 files now open with the header as
their first key, and the same run over the tree as it stands is 24 of 24 headed
and 24 of 24 with the header stripped — the second number matters because the
stripped document is what the parser is handed, and the two runs passing together
is what "optional, and not `required`" means when it is measured rather than
asserted. `W_ARTIFACT_DIALECT` is implemented and reports nothing on this role.

The key never reaches `parseWorkflow` in the catalog. `adoptDialect`
(`framework/portal/src/lib/catalog/dialects.ts:166`) records the dialect and
deletes the key at `catalog/load.ts:249`, the single point where every artifact
has been read and nothing downstream has been handed one — so the parse product,
the sequence diagram and `narrateWorkflow()`'s sentences are all bit-identical to
what they were before the header existed, and `Artifact.raw` keeps the file as
authored for `/artifacts` and the source pane.

The parser was widened anyway, and the carve-out is one line.
`workflowFileSchema` (`workflow.ts:139`) is still a `z.strictObject`; it now
carries `$schema: z.string().min(1).optional()` at the root and nowhere else. A
step node gains nothing — it is not an artifact root — and `E_PROTO_WF_SCHEMA`
still fires on every key it fired on before. The admission buys nothing for the
catalog, which is the point: it is for the caller who holds raw file bytes and no
loader. A fixture, an editor following the URL, a consumer validating against the
schema this entity publishes — refuse them and the discriminator fails at the one
job it has, which is to be writable in the file it discriminates.

**Admitting one key by name is not the same move as opening an `x-` hatch**, and
the difference is who owns the namespace. `x-` is an open extension point: it
admits keys the format has never seen, chosen by authors the format will never
meet, and its standing cost is that a typo hides inside it forever — under a
hatch, `stpes:` is a tolerated author key rather than a caught mistake. `$schema`
is a single literal, owned by the framework, defined by this entity, with a
canonical value `dialects.ts` *computes* from the meta-schema URL rather than
accepts from the file. The set of legal root keys is still enumerable and grew by
exactly one; this format still has no `x-` hatch, and `stpes:` is still
`E_PROTO_WF_SCHEMA`.

The direction is what settles it. A hatch lets the **author** extend the format;
a named key lets the **format** extend itself — at a version, in the spec, with
an entity behind the URL and a version bump when it changes. 0015 could have
spent an `x-metaframework-schema:` under a hatch instead, and in a format that
already had one that would have been the cheaper edit. It is the wrong purchase
regardless: a discriminator living in the author-owned namespace is a
discriminator any author may collide with, and one nothing may pin.

The value is typed as a non-empty string and **not** pinned with `const` to the
`$id`, and that is a ruling rather than an omission. A file naming some other
dialect is `W_ARTIFACT_DIALECT` — a warning, read as the legacy dialect, never
broken — so a `const` would state one fact at two severities, and JSON Schema has
no dial for turning the harder one down. It would also not fire where it is
imagined to: an editor follows the URL the *file* names, so a workflow carrying
the `journey-document` URL is judged by that schema and never reaches this one.
The join that would reach it — pick the schema from the role, then compare — is
the portal's, and the portal already warns. All six framework meta-schemas encode
the key the same way for the same reason.
