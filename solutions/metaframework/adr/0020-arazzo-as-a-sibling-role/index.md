---
name: 0020-arazzo-as-a-sibling-role
kind: adr
version: 2
title: Arazzo is a sibling of the workflow mini-spec, not a dialect of it
summary: arazzo.yaml joins the role table as an additive protocol artifact — no field table, read to draw a step graph, grounded in the entity's own openapi.yaml or transport.yaml; the mini-spec leads.
status: review
owner: sergio-bershadsky
decision-status: proposed
date: "2026-08-22"
relations:
  uses:
    - /product/specification/component/core-contracts
    - /product/specification/component/kind-contracts
    - /product/portal/component/protocol-model
tags:
  - artifacts
  - dialects
  - protocols
---

## Context

[0015-artifact-dialects](srn://metaframework/adr/0015-artifact-dialects) drew
one fence and then named this file as the thing on the far side of it: "a lane
that wants a new filename must come back for a role-table amendment.
`arazzo.yaml` beside `workflows/` is a new role and needs one; `transport.yaml`
becoming AsyncAPI does not." `framework/spec/structure.md` copied the sentence
into a code block as its worked hypothetical. This record is that hypothetical
coming back.

The direction going in was a migration: replace the workflow mini-spec with
Arazzo, the OpenAPI Initiative's standard for a deterministic sequence of API
calls, and stop maintaining a proprietary grammar. The field-by-field mapping
killed it, and the reason is not a gap that a later Arazzo version closes.

### The two formats model different things

Arazzo models **one executor chaining API operations**. A step references an
operation — by `operationId`, by `operationPath`, or a nested workflow by
`workflowId`, with 1.1 adding a channel-level reference for AsyncAPI sources —
and the outputs of one step feed the inputs of the next, with success and
failure criteria deciding where control goes.

The mini-spec models **multi-party choreography**. Every step carries `from` and
`to` over declared participant aliases; participants may be actors or
`in-process` modules; a step may be a self-call; `event` steps fan out to a list
of recipients; `call` and `return` are paired arrows that a rule
(`W_PROTO_WF_ORPHAN_RETURN`) checks for pairing; `alt` / `opt` / `loop` are
structured fragments that render as UML fragments; `condition` and `note` are
display-only prose.

None of the second column has an Arazzo carrier outside `x-` extensions.
Expressing it there would rebuild the mini-spec inside a goto-graph, with
fabricated operation grounding underneath it — strictly worse to author, and it
buys no rendering, because the portal would still be reading extension keys it
wrote itself. The sequence diagram is the mini-spec's whole reason to exist and
Arazzo has no equivalent output.

There is also a hard fence in Arazzo's own grammar: `sourceDescriptions[].type`
is closed to `openapi`, `asyncapi` and `arazzo`. A gRPC protocol, a GraphQL
protocol and an `in-process` protocol have no description format in that set and
never will — so a migration would not have been a migration. It would have been
a partition of the catalog into protocols the framework can still describe and
protocols it cannot.

### The census, walked over `solutions/` on 2026-08-22

Measured by walking every `protocol/<name>/` entity directory and reading the
declared dialect and `kind` of each `transport.yaml`:

| Population                                       | Count | Groundable? |
| ------------------------------------------------ | ----- | ----------- |
| protocol entities                                | 35    | —           |
| carry an `openapi.yaml`                          | 2     | yes         |
| `transport.yaml` declaring `asyncapi: 3.1.0`     | 11    | yes (1.1)   |
| mini-spec `kind: http`, no `openapi.yaml`        | 12    | not yet     |
| mini-spec `kind: grpc`                           | 3     | never       |
| mini-spec `kind: in-process`                     | 3     | never       |
| no `transport.yaml` at all                       | 4     | not yet     |

So the artifact is sensible on thirteen of the thirty-five protocols today. Six
can never carry it. The remaining sixteen become eligible only by first
acquiring a grounding document — an `openapi.yaml`, or the AsyncAPI dialect of
their `transport.yaml` — which is a decision about *that* protocol, not about
this role.

The shape of the eligible set matters for the drift guard below, and it is
lopsided: only two of the thirteen are OpenAPI-grounded. Of the eleven AsyncAPI
transports, exactly one declares a top-level `operations:` map; the other ten
declare `channels:` only, so a step can reference them at channel level and by
nothing else. A guard written against `operationId` → `openapi.yaml` would check
two files and wave through eleven.

### What could not be verified, and is therefore not written as fact

Arazzo 1.1.0 is dated 17 May 2026 on `spec.openapis.org`, and the `arazzo` key
is REQUIRED at the root of every Arazzo Description by the specification's own
fixed-field table. Beyond that:

- **No published JSON Schema for 1.1 was located.** The OAI repository's
  `schemas/` directory is archived at v1.0, and the versioned schema URL under
  `spec.openapis.org` returns 404. Machine validation of a 1.1 document is
  therefore not available to this framework today, which is the reason the
  artifact is **grammar-free** rather than schema-checked. It is not a reason
  against reading one — a renderer needs no schema to draw what it recognises —
  and it is not a reason against the one rule that does reach the file, which
  asks where its references land and needs no grammar at all.
- **"Exactly one step reference is REQUIRED" is a 1.0 claim, not a 1.1 one.**
  The official 1.0 schema states it (`required: [stepId]` plus a `oneOf` over
  the three reference fields). The 1.1 prose marks only `stepId` REQUIRED and
  says the reference fields are mutually exclusive without an explicit
  "exactly one MUST be present" sentence. Nothing in `framework/spec` asserts the
  stronger form.
- **Tooling support for 1.1 specifically was not verified.** Redocly CLI,
  Spectral and Respect are the intended consumers of this artifact and the
  research pass that named them was run against a different feature set on a
  different date. Nothing in this decision depends on them: the framework serves
  bytes and derives nothing.

## Decision

**`arazzo.yaml` becomes a protocol role of its own — an additive sibling, never
a dialect of `workflows/<name>.yaml`.**

1. **The role table grows one row**, appended after the protocol rows it joins:
   kind `protocol`, role `arazzo`, file `arazzo.yaml`, depth 1. The address is
   `srn://…/{protocol}.arazzo`. The artifact is OPTIONAL; a legal `.arazzo`
   suffix whose file is absent is `E_SRN_DANGLING`, as for every other optional
   role. Both directions of the table stay functions: `arazzo` collides with no
   existing role, `arazzo.yaml` with no existing filename.

2. **The dialect table grows one row**: the discriminator is Arazzo's own
   `arazzo:` key, native, never stripped, recognised over the band `1.1.x`. The
   value a headerless file is advised to paste is `arazzo: 1.1.0`.

   The band is one minor line because Arazzo's Versions section repeats
   OpenAPI's verbatim — `major`.`minor` designates the feature set, the patch
   version SHOULD NOT be considered by tooling — which is the same text the
   `openapi` row's `3.1.x` band was reasoned from. The line is `1.1` rather than
   `1.0` because 1.0's `sourceDescriptions[].type` admits only `openapi` and
   `arazzo` and has no channel-level step reference; against this catalog that
   would leave the majority of the eligible set ungroundable. A correct 1.0
   document is read, warned `W_ARTIFACT_DIALECT`, and never broken.

3. **The artifact has no grammar here — which is not the same as unread.**
   Snapshotted with the entity, served as authored, and judged by no field
   table: `kinds/protocol.md` states none for an Arazzo Description, so no rule
   of this framework reaches its *shape* and no diagnostic is raised from an
   unrecognised key, a missing REQUIRED field or a value of the wrong type.

   Read decisions 3 and 5 together, because the first sentence of this one used
   to say "judged by nothing" flatly and the two then contradicted each other in
   one document. What decision 5 adds is not a grammar: grounding asks where the
   file's references *land*, which is a question about two files in one
   directory and is answerable without knowing Arazzo at all. Shape is not
   checked; siblings are.

   What a *reader* does with those bytes is a separate question, and the portal
   answers it by drawing: an `arazzo.yaml` renders as a step graph of each
   workflow, beside the source. Drawing asserts nothing — a renderer that meets
   a field it does not know draws less, where a validator would have to call the
   document wrong — which is exactly why the absence of a published 1.1 schema
   blocks the second and not the first. `openapi.yaml` stays bytes-only in the
   stronger sense: nothing opens it at all.

4. **The mini-spec stays the authoritative choreography source.** Sequence
   diagrams derive from `workflows/*.yaml` and from nothing else. A protocol
   carrying both artifacts deprecates neither and warns on neither. Nothing here
   starts a migration window, because the two files do not describe the same
   thing.

5. **Grounding is a rule, not a convention.** `sourceDescriptions[].url` MUST be
   a relative URI-reference naming a sibling artifact of the same entity —
   `./openapi.yaml` or `./transport.yaml`. Every operation, channel or workflow
   a step names MUST resolve into a document `sourceDescriptions` names or into
   a workflow of the same file. Both clauses are one new warning class,
   `W_PROTO_ARAZZO_UNGROUNDED`.

   The absolute-URL form Arazzo permits is refused here for the reason no other
   artifact names a host: a catalog is described offline and privately, and a
   URL pointing outside the entity is a claim nothing in the repository can
   check.

   The `./` is the convention and not the rule. A bare `openapi.yaml` is a
   relative URI-reference naming the same sibling and is equally grounded; what
   is refused is anything naming a document the entity does not carry. Stating
   it matters because the first draft of this rule was restated elsewhere as
   "`./`-relative", which is a different and narrower rule, and would have
   warned on a file the portal links correctly.

   **What "resolve" means, per grounding grammar.** The rule is silent on this
   as first written, and a checker cannot be:

   | A step's field  | Against an OpenAPI source                | Against an AsyncAPI source               |
   | --------------- | ---------------------------------------- | ---------------------------------------- |
   | `operationId`   | an `operationId` declared under `paths`  | a key of the top-level `operations` map  |
   | `operationPath` | a pointer at `paths.<route>.<method>`    | a pointer at a member of `operations`    |
   | `channelPath`   | nothing — OpenAPI declares no channels   | a pointer at a member of `channels`      |
   | `workflowId`    | a `workflowId` of **this** `arazzo.yaml` | a `workflowId` of **this** `arazzo.yaml` |

   Only the AsyncAPI cell of the first row had to be minted. Arazzo says an
   `operationId` names an operation of the source description; AsyncAPI 3 names
   its operations by the **keys** of a top-level `operations` map, with no id
   field inside them, so that map is where the name is looked for. A checker
   resolving `operationId` only against OpenAPI's `paths` would have warned on
   every step of the one catalog file that spells its references that way, and
   the file is correct.

   The two pointer rows say *a member of a named collection* and not "a node of
   the document", which is a distinction the first cut of this rule got wrong.
   A pointer that merely walks proves only that something is there:
   `#/info/title` walks, and so does `#/channels/<id>/messages`, one segment
   inside a real channel. Neither is a channel, and a check that accepted them
   would print "resolves to no channel" having never looked for one. The
   `{$sourceDescriptions.<name>.url}` prefix is what names a source; a bare
   `#/…` names none and is searched across all of them, the same symmetry a bare
   `operationId` has.

   Four silences belong to the rule rather than to any implementation of it. A
   source whose document is in a grammar this framework does not read grounds
   and puts no step reference in question — a mini-spec `transport.yaml`, whose
   `channels` is a surface list and not AsyncAPI's map, and a sibling that
   failed to parse; the absence of a check is not a warning, and a finding
   raised on `arazzo.yaml` for a defect in the transport names the wrong file. A
   `sourceDescriptions` entry with no `url` names no document and is not judged.
   A source that already failed clause 1 takes one finding rather than one per
   step naming it, and a document that grounds nothing at all is reported once
   against `sourceDescriptions` — once, not instead: every later reference is
   still judged, including a `workflowId`, which resolves inside the same file.
   And `dependsOn`, along with the `stepId` or `workflowId` of an
   `onSuccess`/`onFailure` action, is intra-workflow control flow rather than a
   reference between artifacts: the step graph reports an unresolved one under
   the picture, and that is a note on a drawing rather than a finding on the
   catalog.

6. **Scope: the initiator-facing surface only.** One `arazzo.yaml` describes the
   sequence as the caller drives it. It is not a second description of the wire
   and not a second description of the choreography, and where the descriptions
   of one exchange disagree, `transport.yaml` and the workflow files are what
   the portal renders.

7. **`arazzo.json` is refused**, though the Arazzo Specification recommends the
   two spellings equally. A role whose file varies its extension makes
   file → role need a directory listing, which is the one thing the role table
   exists to avoid. `W_PROTO_ARTIFACT_UNKNOWN`.

8. **One document.** `arazzo.yaml` is the entry document of a self-contained
   Arazzo Description. This kind recognises no asset subdirectory for the
   non-entry parts of a split Description; such a file would be free-named,
   unaddressable, and `W_PROTO_ARTIFACT_UNKNOWN`.

9. **The framework defines no key inside the file.** Should it ever need one it
   is spelled `x-srn` or `x-srn-*`, matching `schema.json` and the AsyncAPI
   dialect of `transport.yaml` — never `x-arazzo`, `x-oai-*` or `x-oas-*`, which
   the OpenAPI Initiative reserves.

## Consequences

- **The role table is now ten roles and the dialect table eleven rows.** Every
  mirror of the constant moves with it: `framework/spec/structure.md` (the
  normative statement), `framework/spec/srn.md` (restated in full),
  `framework/spec/kinds/protocol.md` (the owning kind), the bundled reference
  copies under `marketplace/`, and the code copy in
  `framework/portal/src/lib/srn/artifacts.ts`.

- **The code copy and the dialect registry must land in one commit.**
  `framework/portal/src/lib/catalog/dialects.ts` derives its rows from
  `ARTIFACT_ROLES` and throws at module import when a role has no ruling. Adding
  the role row alone does not fail a test — it fails to boot the portal.

- **`W_ARTIFACT_DIALECT` reaches `arazzo.yaml` for free** once the dialect row
  exists; no new emitter is needed for it, and an Arazzo document declaring
  `arazzo: 1.0.1` gets the warning and keeps loading.

- **The portal draws it, and drawing it is not checking it.** `arazzo.yaml`
  renders as a React Flow step graph — steps as nodes, `dependsOn` and the
  inferred sequence as two visually distinct edges, `onSuccess`/`onFailure`
  branches with their criteria as labels and the destructive token on failure,
  ELK layered layout, and navigation into a referenced workflow or into the
  sibling artifact a source description names. It reuses the two libraries the
  portal already ships and adds no dependency. The reader behind it
  (`framework/portal/src/lib/protocol/arazzo.ts`) is tolerant by construction:
  it returns null rather than throwing, treats every field as optional including
  the ones Arazzo marks REQUIRED, and reports what it did not draw instead of
  reporting the document. It is reachable from no diagnostic path, which is the
  executable form of decision 3.

- **`W_PROTO_ARAZZO_UNGROUNDED` shipped with no emitter, and gained one.** It
  entered the portal's debt register
  (`framework/portal/src/lib/catalog/diagnostic-coverage.test.ts`) beside the
  other protocol rules specified ahead of their reader, and the register's
  ratchet forced the entry out the moment `lib/protocol/arazzo-grounding.ts`
  emitted the code — which is the register working as designed and the reason it
  is a debt list rather than an exemption list.

  Two things about that entry are worth recording, because both were wrong in a
  way that cost time. It called the step-reference clause "genuinely blocked:
  it needs the sibling `openapi.yaml` / `transport.yaml` *interpreted*". Nothing
  was blocked: both documents were already parsed objects on
  `entity.artifacts[].data`, and every resolution the rule asks for is a key
  lookup or a JSON-pointer walk over an object already in hand — no AsyncAPI or
  OpenAPI validator, no schema, no new dependency. And the corpus turned out to
  be no help in proving the check works: every `arazzo.yaml` under `solutions/`
  grounds, so landing the emitter moved no count and every fixture that shows
  the code firing had to be written from scratch. Measured 2026-08-22 at
  `07633c5`, over the twelve files the catalog carried then.

- **The emitter is a module of its own, and that placement is load-bearing.**
  `lib/protocol/arazzo.ts` states in its own docblock that it "emits no
  diagnostic, ever, and is reachable from no diagnostic path", which the
  consequence above calls the executable form of decision 3. A code literal
  inside it would falsify the first half of that sentence and an import of it
  from a checking module would falsify the second, so
  `lib/protocol/arazzo-grounding.ts` shares no function with the reader and
  walks the raw document itself. It needs to anyway: `readArazzo()` returns null
  for a document carrying no `workflows` array, and such a document can still
  name a source that is not there.

- **The framework shipped this role before any file used it, and the catalog
  caught up the same day.** Nothing under `solutions/` carried an `arazzo.yaml`
  when the role landed; authoring the first ones was a separate decision about
  specific protocols, taken immediately afterwards, and it did not move the
  dated artifact populations `product/specification/index.md` states — those
  count files that name a framework meta-schema from inside, and this one names
  Arazzo's own key instead. The census above stays a measurement of what is
  *groundable*; it is not a plan for what gets authored, and a groundable
  protocol with no `workflows/` file has no documented choreography to
  re-describe and so gets no `arazzo.yaml`.

- **Spec versions move**: `structure.md` to 9, `srn.md` to 9,
  `kinds/protocol.md` to 8, `evolution.md` to 10 — and the distilled-from markers
  in the plugin bundle move with them, or `repo-hygiene` fails. Landing the
  emitter moved three of them again — `kinds/protocol.md` to 9, and
  `structure.md` and `srn.md` to 10 — because all three carried a sentence saying
  no rule of this framework reaches an `arazzo.yaml`'s contents, which decision 5
  had already made false on the day it was written.

- **The `derive` idea stays open.** A `metaframework derive arazzo` generating an
  initiator-perspective skeleton from a workflow's `call` / `return` pairs is
  now expressible — one artifact producing a draft of another, with the
  mini-spec still the source — and is deliberately not decided here.

## Alternatives considered

- **Arazzo as a second dialect of `workflows/<name>.yaml`.** The direction given,
  and rejected on the mismatch above rather than on taste. It would also have
  been the first dialect ruling on a depth-2 family, forcing every workflow file
  to declare which of two incompatible meanings its filename carries, while
  `channel`, `payload`, `style` and rules W1–W10 all key off the mini-spec's
  shape. One filename cannot hold both meanings; choosing either deletes the
  other.

- **Arazzo replacing the mini-spec outright.** Rejected on the closed
  `sourceDescriptions` type set. It would partition the catalog into protocols
  that keep a workflow description and protocols — every gRPC, GraphQL and
  `in-process` one — that lose theirs, in exchange for a format that cannot draw
  the diagram the lost one draws.

- **The tether as the research pass worded it** — "every `operationId` in
  `arazzo.yaml` resolves into `openapi.yaml`". Rejected on the census: two of the
  thirteen eligible protocols are OpenAPI-grounded, and ten of the remaining
  eleven declare channels rather than operations. The rule as written would have
  been true, cheap, and almost entirely vacuous. The adopted form covers
  operation, channel and nested-workflow references against whatever the entity
  actually carries.

- **Making grounding an error class.** Rejected. Every artifact rule this
  framework has added arrives as a warning first (`W_ARTIFACT_DIALECT` is the
  precedent, and `E_DM_DIALECT` is what a terminal state looks like once every
  file complies). An error class would also over-promise: nothing read the
  document when this was written, so the only honest thing an unimplemented
  error could have done is stay silent while claiming to be fatal. The second
  half of that reason expired when the emitter landed; the first did not, and it
  is the one the decision rests on.

- **Recognising the whole `1.x` line.** Rejected. It reads as "1.0 or 1.1, either
  is fine", and for this catalog 1.0 is not fine — it cannot name an AsyncAPI
  source at all, which is where eleven of the thirteen groundable protocols live.
  The narrow band plus a warning says the true thing: a 1.0 file works, and it is
  not what to write.

- **Recognising exactly `1.1.0`.** Rejected on Arazzo's own text, which puts
  errata in the patch position and tells tooling to ignore it. A reader that
  complained about `1.1.1` would be reporting its own narrowness as the file's
  fault — the reasoning `openapi`'s `3.1.x` band already rests on.

- **Admitting `arazzo.json` beside `arazzo.yaml`.** Rejected on the
  extension-erasing rule: two files differing only in extension collapse into one
  role, and the reverse map would need a directory listing to tell which exists.
  The Specification recommends both names; the role table can take one.

- **An `arazzo/` asset subdirectory, mirroring `workflows/`.** Rejected. Arazzo
  already carries N workflows inside one Description, so a directory would mint N
  addresses for what the format models as one document — and a split Description
  has an *entry* document that a flat directory of peers cannot mark.

- **Absolute `sourceDescriptions[].url`.** Legal Arazzo, rejected here. It bakes
  a host into a catalog file, and it is the one form of the grounding rule that
  nothing offline can check — which makes the rule advice rather than a rule.

- **Specifying `arazzo.yaml` to be parsed, as the AsyncAPI dialect of
  `transport.yaml` is.** Rejected. That dialect is *specified* to be parsed
  because three existing views go dark otherwise — the spec places a requirement
  on a reader, and its absence is a gap the record tracks. Arazzo needs no such
  requirement: nothing else in the catalog derives from an Arazzo Description, so
  a portal that draws one is offering a view rather than discharging an
  obligation, and a portal that draws none is not in violation. And a *parse*
  contract in the specification sense would carry a grammar this framework cannot
  state: no published 1.1 schema was found to validate a document against. So the
  document is read where reading helps and specified nowhere — which is the
  distinction decision 3 draws, and the reason `W_PROTO_ARAZZO_UNGROUNDED` stays
  a rule about *references between artifacts* rather than about Arazzo's own
  shape.
