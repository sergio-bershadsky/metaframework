---
kind: spec
name: protocol
version: 8
status: review
title: Protocol kind
summary: The protocol entity contract — participants and style, transport.yaml in its two dialects, the workflow mini-spec, XState-subset states.json, the bytes-only openapi.yaml and the unvalidated arazzo.yaml, artifact addressing, payload binding, and derived diagrams.
---

# Protocol kind

A **protocol** describes how components talk: who participates, over which wire,
in what order, and through which conversation states. It is the richest kind in
the ontology and the one that feeds the most derived diagrams.

This document extends — never overrides — [structure.md](../structure.md),
[srn.md](../srn.md), [frontmatter.md](../frontmatter.md), and
[evolution.md](../evolution.md). Everything those documents require of every
entity still applies here verbatim.

Placement is already fixed by [structure.md](../structure.md): a protocol lives
at the **nearest common ancestor (NCA)** of its *component* participants. This
document supplies the input to that rule — the `participants` list below is
what the NCA is computed from (actor participants excluded).

**The NCA is a common prefix of `{kind}/{name}` pairs, never of bare segments.**
That distinction is load-bearing now that paths are bucketed: `checkout` and
`ledger` share the literal segment `product`, but `product` alone is a bucket,
and a bucket has no SRN and cannot hold an `index.md`. Take the prefix pair by
pair and the answer is always an addressable entity or the solution root:

| Component participants                                                                   | Common pair prefix                | Protocol directory                                          |
| ---------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------- |
| `/product/shop/component/checkout`, `/product/shop/component/inventory`                  | `product/shop`                    | `solutions/acme/product/shop/protocol/…`                    |
| `/product/shop/component/checkout`, `/product/shop/component/checkout/component/payment` | `product/shop/component/checkout` | `solutions/acme/product/shop/component/checkout/protocol/…` |
| `/product/shop/component/checkout`, `/product/billing/component/ledger`                  | *(empty)*                         | `solutions/acme/protocol/…`                                 |

The third row is why the rule is pairwise: stopping at the shared `product`
segment would name a bucket, so the prefix is empty and the protocol belongs at
the solution root — which is where a cross-product settlement bus sits.

## Entity directory shape

A protocol entity is a directory holding `index.md` plus optional siblings and
one optional asset subdirectory:

```text
solutions/acme/product/shop/protocol/order-placement/
├── index.md                # REQUIRED  entity document (frontmatter + prose)
├── transport.yaml          # OPTIONAL  wire binding — exactly one transport
├── openapi.yaml            # OPTIONAL  OpenAPI document — fixed name, bytes-only
├── arazzo.yaml             # OPTIONAL  Arazzo description — fixed name, unvalidated
├── states.json             # OPTIONAL  XState-subset conversation state machine
└── workflows/              # OPTIONAL  asset subdirectory — never an entity
    ├── place-order.yaml    # one workflow, name = filename stem
    └── cancel-order.yaml   # one workflow, name = filename stem
```

Rules:

- Sibling filenames are **bare and fixed**: `transport.yaml`, `openapi.yaml`,
  `arazzo.yaml`, `states.json`. A file named `order-placement.transport.yaml` or
  `protocol.yaml` is not recognised and raises `W_PROTO_ARTIFACT_UNKNOWN`. So is
  `arazzo.json`, which the Arazzo Specification recommends equally: a role's file
  may not vary its extension ([structure.md](../structure.md)), and this document
  pins the YAML spelling ([`arazzo.yaml`](#arazzoyaml--the-orchestration-surface)).
- `workflows/` is the only recognised asset subdirectory. It contains one
  `*.yaml` file per workflow, kebab-case, no nesting below it, and — per
  [structure.md](../structure.md) — no `index.md` at any depth.
- Files linked from `transport.yaml` (`spec.file`, e.g. `pricing.proto`, a
  GraphQL SDL) sit alongside `index.md` and are recognised by virtue of being
  linked. `openapi.yaml` is deliberately not on that list: it is a fixed-name
  artifact in its own right, recognised whether or not `transport.yaml` links it
  (see the `spec` section below), and `arazzo.yaml` is a fixed-name artifact for
  the same reason and is never linked by `spec` at all — it describes no wire.
  Neither is an AsyncAPI document, for the opposite reason — on the wires
  AsyncAPI covers it belongs *inside* `transport.yaml`, as that file's other
  dialect ([The AsyncAPI dialect](#the-asyncapi-dialect-of-transportyaml)).
- Additional `*.md` prose siblings are allowed and carry no machine semantics.
  Any other unrecognised file raises `W_PROTO_ARTIFACT_UNKNOWN`.
- **Artifacts carry no version of their own.** The entity's frontmatter
  `version` governs the whole directory; an entity version is a snapshot of all
  its files at one commit ([evolution.md](../evolution.md)). A `version:` key at
  the top level of `transport.yaml` or a workflow file is a shape violation.
- **The `x-` escape hatch reaches into the YAML artifacts.** In `transport.yaml`
  and in `workflows/*.yaml`, at the top level and inside entries, an unknown key
  is rejected unless it is prefixed `x-` — the same rule
  [frontmatter.md](../frontmatter.md) states for frontmatter and
  [environment.md](environment.md) states for its artifacts. `states.json` is
  exempt: it is an XState machine configuration, and unknown keys there are
  `E_PROTO_STATES_SUBSET` — `x-` ones included.
- **The dialect header is framework-owned and admitted by name, not through the
  hatch.** Read the rule above on its own and `$schema` — required at the root of
  `transport.yaml`, `states.json` and every workflow file
  ([Artifact dialects](#artifact-dialects)) — is an unknown non-`x-` key, so this
  document would forbid what the dialect contract demands. It does not. The
  header is one framework-owned key, named, at the artifact root and nowhere
  else, and the loader removes it from the parsed document before any rule here
  is applied; `x-` stays what it always was, a hatch for *authors'* keys
  ([structure.md](../structure.md#the-framework-owned-key-is-read-once-then-removed)).
  `openapi.yaml` and `arazzo.yaml` need no carve-out at all — `openapi:` and
  `arazzo:` are their own formats' keys, in documents this framework does not
  validate.

  ```yaml
  # the dialect header — named, never an unknown key
  $schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/transport-document
  kind: http
  x-gateway-route: shop-edge   # tolerated, ignored by the portal
  gateway-route: shop-edge     # E_PROTO_TRANSPORT_SCHEMA
  http:
    base-path: /api/v1/orders
  ```
- All five artifacts are optional. A protocol with only `index.md` is legal
  (an intent-level protocol under design); it simply derives no diagrams.

### Artifact addressing

Every recognised artifact above is addressable by SRN. The grammar — a dot
suffix on the **final** path segment — belongs to [srn.md](../srn.md), together
with the closed per-kind role table; this is that table's protocol row:

| Artifact suffix     | File                    | Example                                                                  |
| ------------------- | ----------------------- | ------------------------------------------------------------------------ |
| `.transport`        | `transport.yaml`        | `srn://acme/product/shop/protocol/order-placement.transport`             |
| `.states`           | `states.json`           | `srn://acme/product/shop/protocol/order-placement.states`                |
| `.openapi`          | `openapi.yaml`          | `srn://acme/product/shop/protocol/order-placement.openapi`               |
| `.workflows.<name>` | `workflows/<name>.yaml` | `srn://acme/product/shop/protocol/order-placement.workflows.place-order` |
| `.arazzo`           | `arazzo.yaml`           | `srn://acme/product/shop/protocol/order-placement.arazzo`                |

- **The table is a spec constant**, closed exactly as the reserved-kind list
  is: converting an artifact SRN to a disk path needs this document and nothing
  else — the [consolidating principle](../srn.md#the-consolidating-principle)
  holds without a catalog read. It is also the one place SRN ≡ disk path bends:
  `.transport` names a **role** that maps *through* the table to
  `transport.yaml`, never a literal path suffix — the same shape of bend the
  reserved-kind table already is. The dot form exists only in the SRN; a file
  literally named `order-placement.transport.yaml` stays unrecognised
  (`W_PROTO_ARTIFACT_UNKNOWN`).
- The split at the first dot is unambiguous because a dot can never occur in a
  name segment — [srn.md](../srn.md) reserves the character one-way, exactly
  like a reserved word.
- `transport`, `states`, `openapi` and `arazzo` take no further segment;
  `workflows` requires exactly one — the filename stem, ordinary kebab-case.
  Any other role, any other depth, or any suffix on a kind that has no roles is
  `E_SRN_ARTIFACT` ([srn.md](../srn.md)) — statically checkable, no filesystem
  involved. A **legal** role whose file is absent — every artifact here is
  optional — is `E_SRN_DANGLING` instead.
- **An artifact has no version of its own.** `…/order-placement.transport@2`
  means "the `transport.yaml` of snapshot `order-placement@2`": `@N` is a
  coordinate of the entity, resolved by the ordinary machinery of
  [evolution.md](../evolution.md) — version→commit index, then the file at that
  commit. Within one version the only permitted mutation is `status:` in
  `index.md`, which cannot touch an artifact file, so artifact bytes are
  constant within a version and the address is well-defined; `E_VER_UNBUMPED`
  and `metaframework check --since` enforce exactly this. Because the suffix
  names a file *of the snapshot*, it precedes `@version`:
  `order-placement@2.transport` is `E_SRN_SYNTAX` ("artifact suffix precedes
  @version").
- Artifact suffixes ride the absolute (`srn://…`) and solution-absolute
  (`/product/…`) forms only; a relative reference carrying one is
  `E_SRN_SYNTAX` — dot splitting stays out of `..` arithmetic
  ([srn.md](../srn.md)).

```text
srn://acme/product/shop/protocol/order-placement.transport               ✓ transport.yaml, latest snapshot
srn://acme/product/shop/protocol/order-placement.states@2                ✓ states.json as of snapshot @2
srn://acme/product/shop/protocol/order-placement.workflows.place-order   ✓ workflows/place-order.yaml
srn://acme/product/shop/protocol/order-placement.openapi                 ✓ openapi.yaml — E_SRN_DANGLING if absent
srn://acme/product/shop/protocol/order-placement.arazzo                  ✓ arazzo.yaml — E_SRN_DANGLING if absent
srn://acme/product/shop/protocol/order-placement@2.transport             ✗ E_SRN_SYNTAX — suffix precedes @version
srn://acme/product/shop/protocol/order-placement.workflows               ✗ E_SRN_ARTIFACT — workflows needs a name
srn://acme/product/shop/protocol/order-placement.spec                    ✗ E_SRN_ARTIFACT — no such role
srn://acme/product/shop/protocol/order-placement.states.retry            ✗ E_SRN_ARTIFACT — states takes no second segment
```

**Every entity surface rejects an artifact SRN.** Entity surfaces mean
entities: edges are typed over kinds, and an artifact has no kind. On this kind
the fence runs through `relations` (`E_FM_EDGE_TARGET`,
[frontmatter.md](../frontmatter.md)), every participant's `ref`
(`E_PROTO_PARTICIPANT_KIND`), and every `payload` / `request` / `response` /
`message` ref (`E_PROTO_PAYLOAD_KIND`) — in each case the surface's own class,
with a message that names the artifact suffix as the problem. Where an artifact
SRN *is* legal: markdown prose in `index.md`, and consumers outside the
catalog.

```yaml
relations:
  uses:
    - /environment/production.topology         # E_FM_EDGE_TARGET — an edge names
                                               # an entity, never one of its files
participants:
  - alias: checkout
    ref: /product/shop/datamodel/order.schema  # E_PROTO_PARTICIPANT_KIND — a
                                               # legal artifact SRN, but an
                                               # artifact has no kind
```

### Artifact dialects

A role names a **file, never a format**. `transport.yaml` is the transport role
whatever grammar its bytes turn out to hold, and the table above would not move
if that grammar became AsyncAPI tomorrow. So every artifact declares, in its own
bytes, **which grammar it is written in**: a reader cannot perform a migration it
cannot detect, and inferring the format from its shape is a second grammar nobody
wrote down.

The contract is cross-kind and is stated once, in
[structure.md](../structure.md#the-dialect-behind-the-role) — the key each role
carries, the value as an identity that is compared and never fetched, what an
absent or unrecognised one means (`W_ARTIFACT_DIALECT`: read as the legacy
dialect, warned, never broken), the deletion of a framework-owned key before any
kind validator is handed the document, and the `version` bump the header costs.
None of that is restated here. This document supplies the rows that are *this*
kind's, and says where each one meets a rule stated in this document.

Five roles, six dialects — because `transport.yaml` has two. Writing `{meta}`
for
`https://schemas.metaframework.dev/metaframework/product/specification/datamodel`:

| Artifact                | Dialect        | Key        | Value                           | Owned by                  |
| ----------------------- | -------------- | ---------- | ------------------------------- | ------------------------- |
| `transport.yaml`        | the mini-spec  | `$schema`  | `{meta}/transport-document`     | the framework             |
| `transport.yaml`        | AsyncAPI       | `asyncapi` | `3.x`                           | AsyncAPI itself, natively |
| `states.json`           | XState subset  | `$schema`  | `{meta}/state-machine-document` | the framework             |
| `workflows/<name>.yaml` | the mini-spec  | `$schema`  | `{meta}/workflow-document`      | the framework             |
| `openapi.yaml`          | OpenAPI        | `openapi`  | `3.1.x`                         | OpenAPI itself, natively  |
| `arazzo.yaml`           | Arazzo         | `arazzo`   | `1.1.x`                         | Arazzo itself, natively   |

The transport role is the one place two dialects are live at once, and they are
not a migration window with an end: `in-process` and `grpc` transports have no
AsyncAPI expression at all, so the mini-spec is permanent
([Two dialects of the transport role](#two-dialects-of-the-transport-role)).
The mini-spec row is listed **first**, and the order is load-bearing: it is the
dialect a headerless `transport.yaml` is told to declare, which is right for
every wire AsyncAPI does not cover.

Spelled out, at the root of each file:

```yaml
# transport.yaml — the mini-spec dialect
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/transport-document
kind: http
```

```yaml
# transport.yaml — the AsyncAPI dialect; the format already names itself
asyncapi: 3.1.0
```

```yaml
# workflows/place-order.yaml
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/workflow-document
name: place-order
```

```json
/* states.json */
{ "$schema": "https://schemas.metaframework.dev/metaframework/product/specification/datamodel/state-machine-document" }
```

```yaml
# openapi.yaml — the format already names itself, so the framework adds nothing
openapi: 3.1.0
```

```yaml
# arazzo.yaml — likewise; `arazzo:` is REQUIRED at the root by Arazzo itself
arazzo: 1.1.0
```

Three of the six carry the framework's own `$schema`, holding the canonical
schema URL of the meta-schema that defines the dialect — an ordinary datamodel
entity, addressed by the rule [kinds/datamodel.md](datamodel.md) states for every
schema, because a meta-schema is a datamodel like any other. The other three
carry the key their own format already defines. Of those, only the one key is
read out of `openapi.yaml`: nothing else in it is interpreted, so it stays a
bytes-only artifact. `arazzo.yaml` is read further than its key — a portal may
draw a step graph from it, and this one does — but it is read the way any
reader reads a foreign document it does not own, which is why that changes
nothing here: no rule of this document reaches its contents, so nothing in it
can be found wrong ([`arazzo.yaml` — the orchestration
surface](#arazzoyaml--the-orchestration-surface)).

The AsyncAPI dialect of `transport.yaml` is the exception, and deliberately —
it is the one role **specified** to be parsed rather than served
as bytes, because this role feeds the transport card, the message × datamodel
matrix and workflow rule W9, and serving it as bytes would darken all three
([What the AsyncAPI dialect must carry](#what-the-asyncapi-dialect-must-carry)).
That is a requirement on a reader that does not exist yet — nothing in
`framework/portal/src` opens `transport.yaml` in either dialect today.

Each of the three framework rows lands on a rule this document states, and lands
outside it:

- **`transport.yaml`** — the top-level field table below ends "any other
  top-level key that is not `x-` prefixed … is `E_PROTO_TRANSPORT_SCHEMA`".
  `$schema` is not one of those: it is named, it carries no row in that table
  because it is not a transport field, and it is gone from the parsed document
  before the rule is applied.
- **`workflows/<name>.yaml`** — same shape against `E_PROTO_WF_SCHEMA`, with one
  restriction of its own: the header is admitted at the **file root only**. A
  step is not an artifact root, so a `$schema` there names the grammar of nothing
  and is an ordinary unknown key.
- **`states.json`** — the sharpest case, because this artifact has no `x-` hatch
  at all: every unknown key is `E_PROTO_STATES_SUBSET`, and the subset is a
  foreign standard's rather than this framework's to widen. The header is
  therefore not *tolerated* by the subset; it never meets it
  ([The dialect header](#the-dialect-header)).

`openapi.yaml` and `arazzo.yaml` meet no rule of this document, because this
document states none about the contents of either. That a portal reads an
`arazzo.yaml` to draw it does not put one here: reading is not validating, and a
renderer is not a rule.

Two fields that are not discriminators, and are easy to mistake for one.
`transport.kind` names the wire technology — content, and the AsyncAPI dialect
carries the same fact as `servers.<id>.protocol` without either being a header.
`spec.version` is a display label on the transport card: never read as anybody's
dialect, and free to disagree with the document it links without a diagnostic.

A file declaring **both** transport keys needs no rule of its own. The loader
takes the first match, so `$schema` wins and the file is read as the mini-spec;
`asyncapi:` is a foreign format's key, so it is not stripped, and the mini-spec's
own field table then rejects it as an unknown non-`x-` top-level key:

```yaml
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/transport-document
asyncapi: 3.1.0                # E_PROTO_TRANSPORT_SCHEMA — pick one dialect
kind: kafka
```

## Frontmatter additions

On top of the common contract in [frontmatter.md](../frontmatter.md), a
protocol's `index.md` adds three fields.

| Field          | Type                                        | Required | Rule                                                                               |
| -------------- | ------------------------------------------- | -------- | ---------------------------------------------------------------------------------- |
| `participants` | list of participant objects                 | yes      | At least 2 entries (`E_PROTO_PARTICIPANTS`); aliases unique (`E_PROTO_ALIAS_DUP`). |
| `style`        | `point-to-point \| bus \| request-response` | yes      | Closed set; see the decision rule below.                                           |
| `conforms-to`  | list of standard objects                    | no       | External standards this protocol follows; display-only, never resolved.            |

Participant object:

| Field   | Type                          | Required | Rule                                                                               |
| ------- | ----------------------------- | -------- | ---------------------------------------------------------------------------------- |
| `alias` | kebab-case string, ≤ 32 chars | yes      | Local name used by `workflows/*.yaml`; unique within the protocol.                 |
| `ref`   | SRN reference                 | yes      | MUST resolve to a `component`, `product`, or `actor` (`E_PROTO_PARTICIPANT_KIND`). |
| `role`  | kebab-case string, ≤ 32 chars | no       | Free-form display label (`initiator`, `publisher`, `broker`). No semantics.        |

Standard object (`conforms-to` entries):

| Field      | Type   | Required | Rule                                                       |
| ---------- | ------ | -------- | ---------------------------------------------------------- |
| `standard` | string | yes      | Human name, e.g. `RFC 9457 Problem Details for HTTP APIs`. |
| `version`  | string | no       | e.g. `1.0`, `proto3`.                                      |
| `url`      | string | no       | http(s) URL; rendered as a link, never fetched.            |

```yaml
style: request-response
participants:
  - alias: customer
    ref: /actor/customer
    role: initiator
  - alias: checkout
    ref: /product/shop/component/checkout
    role: responder
conforms-to:
  - standard: RFC 9457 Problem Details for HTTP APIs
    url: https://www.rfc-editor.org/rfc/rfc9457
```

Notes:

- A participant carries **no title of its own**. The portal labels the lifeline
  with the target entity's `title` and shows the alias as a subscript. Copying
  the title here would drift.
- A participant's `ref` names an **entity**. An artifact SRN — even a legal
  one, `/product/shop/datamodel/order.schema` — is `E_PROTO_PARTICIPANT_KIND`:
  participation is typed over kinds, and an artifact has no kind
  ([Artifact addressing](#artifact-addressing)).
- `conforms-to` is for *standards*, not for files. An OpenAPI or AsyncAPI
  document that lives in the entity directory is bound in `transport.yaml`
  under `spec` — one place only.
- A protocol SHOULD NOT list its payload datamodels under `relations.uses`.
  The message/datamodel matrix is derived from the artifacts (see
  [Payload binding](#payload-binding-to-datamodels)); authoring the same edges
  by hand is double bookkeeping and drifts. Reserve `uses` on a protocol for
  non-payload dependencies (e.g. an environment).

Counter-examples:

```yaml
style: pub-sub                  # E_FM_SCHEMA — not in the closed set
transport: http                 # E_FM_UNKNOWN_FIELD — transport lives in transport.yaml
participants:
  - alias: Checkout                     # E_FM_SCHEMA — alias is not kebab-case
    ref: /product/shop/component/checkout
  - alias: checkout                     # (lowercase the above) E_PROTO_ALIAS_DUP
    ref: /product/shop/datamodel/order  # E_PROTO_PARTICIPANT_KIND — a datamodel
                                        # cannot participate
  - alias: solo
    ref: /product/shop/component/inventory   # E_PROTO_PARTICIPANTS if this were
                                             # the only entry
```

### Why `style` is these three values

The three values are one axis, not two, and the axis is: **how does the sender
address the receiver, and does the protocol contract a reply?** Applied in
order, the decision rule is total and non-overlapping:

| Question                                             | Answer | `style`             |
| ---------------------------------------------------- | ------ | ------------------- |
| Does the sender name the receiver?                   | no     | `bus`               |
| …and does the protocol contract a correlated reply?  | yes    | `request-response`  |
| …otherwise                                           | —      | `point-to-point`    |

- `bus` — the sender publishes to a topic/exchange/subject; receivers are
  discovered by subscription. Kafka topics, AMQP exchanges, webhook fan-out.
- `request-response` — a named caller invokes a named callee and the protocol
  says a reply comes back. HTTP APIs, gRPC unary, in-process function calls.
- `point-to-point` — directed, named receiver, no reply contract. One-way
  commands, streams, log shipping, gRPC server-streaming notifications.

The value is deliberately **coarse**: it drives navigation, filtering, and the
default diagram layout, and nothing else. The precise information lives one
level down, in `transport.kind` (the wire technology) and in each workflow
step's `kind` (`call`/`return`/`event`/`error`). Two cross-checks turn the
coarse value into a lint rather than dead metadata — both warnings, because the
protocol may legitimately be mid-migration:

```yaml
# index.md declares  style: bus  — but workflows/quote.yaml contains:
steps:
  - message: get-price
    from: checkout
    to: pricing            # W_PROTO_STYLE_MISMATCH — a bus sender does not name a callee
    kind: call
```

```yaml
# index.md declares  style: request-response  — but no workflow ever answers:
steps:
  - message: order-placed
    from: checkout
    to: inventory
    kind: event            # W_PROTO_STYLE_MISMATCH — no call/return pair anywhere
```

## Participants vs. `exposes`/`uses` — which side is authoritative

[frontmatter.md](../frontmatter.md) has components point at protocols
(`exposes` for the provider side, `uses` for the consumer side); this document
has the protocol name its participants. Both exist because they carry
**different information**, and each is authoritative for a different thing:

| Concern                                                                                           | Authoritative source                               |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Which entities are in the protocol's graph, and the direction of each edge (provides vs consumes) | `exposes` / `uses` on the component or product     |
| The alias namespace used inside `workflows/*.yaml` and by the portal's lifeline labels            | `participants` in the protocol's `index.md`        |
| NCA placement of the protocol directory ([structure.md](../structure.md))                         | `participants`, filtered to component/product refs |

Stated as one rule: **the component side owns the edge, the protocol side owns
the alias.** The portal's participant graph is built from `exposes`/`uses`; a
participant entry with no matching back-edge appears in the graph as an
undirected, dimmed node rather than being invented as an edge.

The two directions are cross-checked, both ways, as warnings — mirroring
`W_STRUCT_PROTOCOL_NCA`, and for the same reason: during a swap, one side
legitimately moves before the other.

```yaml
# solutions/acme/product/shop/component/checkout/index.md
relations:
  exposes:
    - /product/shop/protocol/order-placement   # ✓ the provider side of the edge

# solutions/acme/product/shop/protocol/order-placement/index.md
participants:
  - alias: checkout
    ref: /product/shop/component/checkout      # ✓ matched — provider in the graph
  - alias: inventory
    ref: /product/shop/component/inventory     # W_PROTO_PARTICIPANT_UNLINKED if
                                               # inventory's index.md carries
                                               # neither exposes nor uses for this
                                               # protocol
```

- `W_PROTO_PARTICIPANT_UNLINKED` — a `component`/`product` participant whose
  own `index.md` carries no `exposes` or `uses` edge back to this protocol.
- `W_PROTO_PARTICIPANT_MISSING` — a component or product that `exposes`/`uses`
  this protocol but is absent from `participants`.
- **Actors are exempt from both.** An actor is a persona or an external system
  in the solution's universe, not a catalogued implementation; requiring every
  actor to declare `uses` for every protocol it touches is bookkeeping with no
  reader. Actor participants therefore need no back-edge and never trigger a
  warning.

External systems outside the catalog (a payment service provider, a message
broker that is not a component) participate **as actors**:
`ref: /actor/psp-acquirer`. The v1 ontology has no separate external-system
kind, and actors already occupy the solution-level "things outside our code"
slot.

## `transport.yaml`

`transport.yaml` describes **how the conversation reaches the wire** — one
protocol, one transport. In its original dialect it deliberately does not
re-express what OpenAPI, AsyncAPI, or a `.proto` file already expresses; in its
AsyncAPI dialect it *is* that expression, for the wires AsyncAPI covers.

### Two dialects of the transport role

The role carries two grammars, and which one a file may use is decided by its
**wire**, not by its author's preference:

| `kind`       | Dialect                   | Because                                                                                |
| ------------ | ------------------------- | -------------------------------------------------------------------------------------- |
| `kafka`      | mini-spec **or** AsyncAPI | AsyncAPI is the industry description of a broker surface; the framework has none else. |
| `websocket`  | mini-spec **or** AsyncAPI | Same, via the `ws` bindings.                                                           |
| `amqp`       | mini-spec **or** AsyncAPI | Same, via the `amqp` bindings.                                                         |
| `http`       | mini-spec only            | OpenAPI owns this wire and already has a role and a filename — `openapi.yaml`.         |
| `grpc`       | mini-spec only            | AsyncAPI publishes no gRPC binding and no protocol spelling for one.                   |
| `in-process` | mini-spec only            | A Server Object REQUIRES a `host`; an in-process call has none.                        |

An AsyncAPI document whose single server declares a `protocol` outside the first
three rows is `E_PROTO_TRANSPORT_ASYNCAPI`. This is a rule about wires, so it has
no migration deadline: the mini-spec is the permanent dialect of three of the six
kinds, and `W_ARTIFACT_DIALECT` never fires on a file that correctly declares it.

**Neither dialect may be mixed with the other.** There is no `spec:` in the
AsyncAPI dialect, no surface list, and no `kind` — those fields belong to the
mini-spec's field tables below, and the AsyncAPI dialect is governed instead by
[What the AsyncAPI dialect must carry](#what-the-asyncapi-dialect-must-carry).
Diagnostics split the same way: `E_PROTO_TRANSPORT_SCHEMA`,
`E_PROTO_TRANSPORT_BINDING` and `E_PROTO_TRANSPORT_SPEC_CONFLICT` are
mini-spec-only, and `E_PROTO_TRANSPORT_ASYNCAPI` is the other dialect's single
class. `E_PROTO_PAYLOAD_KIND` and `E_PROTO_SPEC_FILE` are dialect-independent.

The rest of this section states the mini-spec dialect. The AsyncAPI dialect
follows it.

### Top-level fields

| Field      | Type                                                           | Required | Rule                                                                                    |
| ---------- | -------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| `kind`     | `http \| grpc \| amqp \| kafka \| websocket \| in-process`     | yes      | Closed set; selects the binding block.                                                  |
| `<kind>`   | mapping                                                        | yes      | The binding block, keyed by **exactly** the `kind` value (`E_PROTO_TRANSPORT_BINDING`). |
| `summary`  | string, one line, ≤ 200 chars                                  | no       | Rendered above the transport card.                                                      |
| `encoding` | `json \| avro \| protobuf \| msgpack \| xml \| text \| binary` | no       | Wire encoding of payloads.                                                              |
| `auth`     | list of kebab-case strings                                     | no       | Display-only labels (`oauth2-bearer`, `mtls`, `sasl-scram`).                            |
| `spec`     | mapping, see below                                             | no       | Link to an external spec file in the entity directory.                                  |

Any other top-level key that is not `x-` prefixed, or a type violation of the
above, is `E_PROTO_TRANSPORT_SCHEMA`. `$schema` is not "any other key" — it is
the dialect header ([Artifact dialects](#artifact-dialects)) — but a key that
merely resembles it is:

```yaml
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/transport-document
kind: kafka
schema: transport-document     # E_PROTO_TRANSPORT_SCHEMA — an unknown key that
                               # merely resembles the header
kafka:
  cluster: shop-events
```

**One transport per protocol.** A protocol offered over two wire technologies
is two protocol entities, both listed by the participating components. A
`transports:` list is a plausible additive extension later; v1 does not have
it, and modelling it as `kind: http` plus a second, undocumented block is
`E_PROTO_TRANSPORT_BINDING`:

```yaml
kind: http
http:  { base-path: /api/v1 }
grpc:  { package: acme.v1, service: Orders }   # E_PROTO_TRANSPORT_BINDING
```

### `spec` — the external-spec link

| Field     | Type                                                        | Required | Rule                                                                       |
| --------- | ----------------------------------------------------------- | -------- | -------------------------------------------------------------------------- |
| `format`  | `openapi \| asyncapi \| protobuf \| graphql \| json-schema` | yes      | Closed set.                                                                |
| `file`    | string, path relative to the entity directory               | yes      | MUST exist; MUST NOT start with `/` or contain `..` (`E_PROTO_SPEC_FILE`). |
| `version` | string                                                      | no       | e.g. `3.1.0`, `proto3`.                                                    |

```yaml
spec:
  format: openapi
  version: 3.1.0
  file: openapi.yaml           # → solutions/.../order-placement/openapi.yaml
```

```yaml
spec:
  format: openapi
  file: ../shared/openapi.yaml # E_PROTO_SPEC_FILE — escapes the entity directory
```

In v1 the portal treats the linked file as an **opaque attachment**: it renders
a card with format, version, and a raw/download link. Parsing OpenAPI or
AsyncAPI to derive operation tables is deferred.

**`openapi.yaml` is a fixed-name artifact, not merely an attachment.** Like
`transport.yaml` and `states.json` it is recognised by its bare fixed name —
link or no link — and is addressable as `.openapi`
([Artifact addressing](#artifact-addressing)). Its contract in v1 is
**bytes-only**: unparsed, snapshotted with the entity, served as-is. `spec`
still does what it always did — declare format and version and put the
attachment card on the transport page — so an OpenAPI document SHOULD use the
fixed name *and* be linked: the fixed name makes it addressable, the link binds
it to the transport.

The free-named attachment mechanism remains for the **other** formats
(`pricing.proto`, a GraphQL SDL): those files are recognised by virtue of being
linked and are **not addressable** — the role table maps fixed roles to fixed
filenames, and a free name has no place in it. A free-named OpenAPI file
(`spec.file: orders-api.yaml`) is likewise legal and likewise unaddressable:
nothing breaks, but nothing can point at it either.

**`format: asyncapi` is now a warning wherever the AsyncAPI dialect would have
taken the document.** An AsyncAPI description of a `kafka`, `websocket` or
`amqp` transport belongs *in* `transport.yaml`, not beside it: a linked copy is
a second description of the same wire, unaddressable, with nothing forcing the
two to agree — which is the divergence
[`spec` XOR the surface list](#surface-lists-and-the-anti-duplication-rule)
exists to prevent, in the one shape that rule cannot see.

```yaml
kind: kafka
spec:
  format: asyncapi             # W_PROTO_SPEC_ASYNCAPI — write the AsyncAPI
  file: asyncapi.yaml          # dialect of this file instead
```

On `kind: http`, `grpc` or `in-process` the same link raises nothing: those
wires have no AsyncAPI dialect to move the document into, so an attachment is
the only home it has.

### Surface lists and the anti-duplication rule

Every binding block may carry one optional **surface list** — the block's
enumeration of what the transport offers:

| `kind`       | surface list key |
| ------------ | ---------------- |
| `http`       | `operations`     |
| `grpc`       | `methods`        |
| `amqp`       | `bindings`       |
| `kafka`      | `topics`         |
| `websocket`  | `channels`       |
| `in-process` | `functions`      |

**Rule:** `spec` and the surface list are mutually exclusive
(`E_PROTO_TRANSPORT_SPEC_CONFLICT`). Either you point at the real spec file and
it is the single source of operation truth, or — when no such file exists — you
write the lightweight list here. Maintaining both guarantees divergence.

```yaml
kind: http
spec:
  format: openapi
  file: openapi.yaml
http:
  base-path: /api/v1/orders
  operations:                  # E_PROTO_TRANSPORT_SPEC_CONFLICT
    - { name: create-order, method: POST, path: / }
```

Promoting `openapi.yaml` to a fixed-name artifact does not move this rule: the
conflict keys on the `spec` mapping, not on the file's presence. An
`openapi.yaml` sitting in the directory unlinked derives nothing in v1 — it is
addressable bytes — so it conflicts with nothing; but an operation-bearing spec
left unlinked beside a surface list is exactly the divergence this rule exists
to prevent. Link it.

### Binding blocks

`http`:

| Field        | Type                      | Required | Rule                                 |
| ------------ | ------------------------- | -------- | ------------------------------------ |
| `base-path`  | string starting with `/`  | yes      | Path prefix all operations hang off. |
| `tls`        | boolean                   | no       | Default `true`.                      |
| `operations` | list of operation objects | no       | Surface list.                        |

Operation object: `name` (kebab-case, required), `method`
(`GET \| POST \| PUT \| PATCH \| DELETE \| HEAD \| OPTIONS`, required), `path`
(string starting with `/`, may contain `{param}` placeholders, required),
`request` (SRN → datamodel), `response` (SRN → datamodel), `summary` (string).

`grpc`:

| Field     | Type                   | Required | Rule                                                       |
| --------- | ---------------------- | -------- | ---------------------------------------------------------- |
| `package` | string, dot-separated  | yes      | Proto package; external identifier, not kebab-constrained. |
| `service` | string                 | yes      | Service name as declared in the proto.                     |
| `tls`     | boolean                | no       | Default `true`.                                            |
| `methods` | list of method objects | no       | Surface list.                                              |

Method object: `name` (string, required), `request` / `response` (SRN →
datamodel), `streaming` (`none \| client \| server \| bidi`, default `none`),
`summary` (string).

`amqp`:

| Field           | Type                                           | Required | Rule                |
| --------------- | ---------------------------------------------- | -------- | ------------------- |
| `exchange`      | string (may be empty for the default exchange) | yes      | Exchange name.      |
| `exchange-type` | `direct \| topic \| fanout \| headers`         | yes      | AMQP exchange type. |
| `durable`       | boolean                                        | no       | Default `true`.     |
| `bindings`      | list of binding objects                        | no       | Surface list.       |

Binding object: `routing-key` (string, may contain `*` / `#`, required),
`queue` (string, required), `message` (SRN → datamodel), `summary` (string).

`kafka`:

| Field     | Type                  | Required                      | Rule                                |
| --------- | --------------------- | ----------------------------- | ----------------------------------- |
| `cluster` | string                | no                            | Free label for the logical cluster. |
| `topics`  | list of topic objects | yes, unless `spec` is present | Surface list.                       |

Topic object: `name` (string, required — Kafka naming, not kebab-constrained),
`key` (string, the partition key), `message` (SRN → datamodel), `partitions`
(integer ≥ 1), `retention` (string, e.g. `7d`), `summary` (string).

`websocket`:

| Field         | Type                     | Required | Rule                      |
| ------------- | ------------------------ | -------- | ------------------------- |
| `path`        | string starting with `/` | yes      | Upgrade path.             |
| `subprotocol` | string                   | no       | `Sec-WebSocket-Protocol`. |
| `tls`         | boolean                  | no       | Default `true`.           |
| `channels`    | list of channel objects  | no       | Surface list.             |

Channel object: `name` (kebab-case, required), `direction`
(`client-to-server \| server-to-client \| bidi`, required), `message` (SRN →
datamodel), `summary` (string).

`in-process`:

| Field       | Type                     | Required | Rule                                      |
| ----------- | ------------------------ | -------- | ----------------------------------------- |
| `language`  | string                   | yes      | e.g. `typescript`, `python`, `go`.        |
| `module`    | string                   | yes      | Import path / package path.               |
| `interface` | string                   | no       | Exported symbol implementing the surface. |
| `functions` | list of function objects | no       | Surface list.                             |

Function object: `name` (string, required), `request` / `response` (SRN →
datamodel), `summary` (string).

### Worked transport examples

**1 — Kafka, a bus protocol with a surface list and no external spec**
(`solutions/acme/product/shop/protocol/order-events/transport.yaml`):

```yaml
kind: kafka
summary: Order lifecycle facts published by checkout for downstream consumers.
encoding: avro
auth:
  - sasl-scram
kafka:
  cluster: shop-events
  topics:
    - name: acme.shop.order.placed.v1
      key: order-id
      message: /product/shop/datamodel/order-placed@2
      partitions: 12
      retention: 7d
      summary: Emitted once an order reaches the confirmed state.
    - name: acme.shop.order.cancelled.v1
      key: order-id
      message: /product/shop/datamodel/order-cancelled@1
      partitions: 12
      retention: 7d
```

**2 — gRPC, delegating the surface to a linked `.proto`**
(`solutions/acme/product/shop/component/checkout/protocol/pricing/transport.yaml`):

```yaml
kind: grpc
summary: Internal price quotation service consumed by the payment sub-component.
encoding: protobuf
auth:
  - mtls
spec:
  format: protobuf
  version: proto3
  file: pricing.proto          # sibling of index.md
grpc:
  package: acme.shop.checkout.pricing.v1
  service: PricingService
  tls: true
# no `methods:` — the proto is authoritative (E_PROTO_TRANSPORT_SPEC_CONFLICT otherwise)
```

**3 — in-process, the smallest useful transport**
(`solutions/acme/product/shop/component/checkout/protocol/tax-quoting/transport.yaml`):

```yaml
kind: in-process
summary: Direct function calls inside the checkout process — no network hop.
encoding: json
in-process:
  language: typescript
  module: "@acme/checkout-core/tax"
  interface: TaxCalculator
  functions:
    - name: quote
      request: /product/shop/datamodel/tax-quote-request@1
      response: /product/shop/datamodel/tax-quote@1
      summary: Returns tax for a cart in a jurisdiction.
```

A fourth example — `http` with an OpenAPI link — appears in the
[complete worked example](#complete-worked-example) below.

## The AsyncAPI dialect of `transport.yaml`

A `kafka`, `websocket` or `amqp` transport MAY be written as an **AsyncAPI
3.1.0 document under the same filename**, declared by the format's own key. The
filename does not move, the role does not fork, and
`srn://acme/protocol/settlement.transport` keeps resolving — that is the whole
point of a role naming a file rather than a format
([Artifact addressing](#artifact-addressing)).

```yaml
asyncapi: 3.1.0                # the discriminator; native, never stripped
```

Recognition is the whole `3.x` line, not `3.1` alone. AsyncAPI's own version
string section states that a minor increment "should not interfere with
operations of tooling developed to a lower minor version" and that "the patch
version will not be considered by tooling", so warning on a correct `3.2.0`
document would report the reader's narrowness as the file's fault. The framework
reads 3.1 semantics either way; a construct from a later minor is carried in the
raw bytes and derives nothing, which is invisible rather than wrong. A headerless
file is still told to declare the mini-spec, because that is the dialect every
wire can use.

### What the AsyncAPI dialect must carry

AsyncAPI is permissive where this framework is not, and requires three fields
this framework deliberately withholds. Six rules close the gap. Any violation is
`E_PROTO_TRANSPORT_ASYNCAPI` — one class for the whole profile, exactly as
`E_PROTO_TRANSPORT_SCHEMA` covers the whole mini-spec field table.

| #   | Rule                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------- |
| 1   | `x-srn` at the document root equals the owning protocol entity's absolute SRN.                                 |
| 2   | `info.title` equals the entity's frontmatter `title`.                                                          |
| 3   | `info.version` is exactly the string `unversioned`.                                                            |
| 4   | `servers` holds **exactly one** entry, and its `protocol` is admitted for this wire.                           |
| 5   | `channels` is present and non-empty.                                                                           |
| 6   | `operations` is OPTIONAL; when present, `id` is present and equals one of the protocol's `participants[].ref`. |

Each of the six exists for a reason this document already states elsewhere.

**1 — `x-srn`.** Not a new key: it is the identity extension every `schema.json`
already carries ([kinds/datamodel.md](datamodel.md)), doing the same job for a
second document that travels. An artifact served by `/artifacts`, pasted into an
editor or vendored by a consumer arrives without its directory, and this is the
line that still says where it came from.

**2 — `info.title`.** AsyncAPI requires a title and this kind keeps titles in
`index.md`. The mirror is checked rather than trusted, which is what makes it
safe: a title changes rarely, and when it does the entity bumps anyway and the
check catches the drift in the same commit. That is *not* true of a version,
which is rule 3.

**3 — `info.version: unversioned`.** [evolution.md](../evolution.md) makes the
frontmatter the only place a version lives, and an artifact has no clock of its
own ([Artifact addressing](#artifact-addressing)). AsyncAPI requires the field
regardless, so the framework fills it with the one honest value — a statement
that this document does not version itself. Mirroring the entity's `version`
here was rejected: every unrelated bump, a prose fix in `index.md` included,
would then have to edit this file too, forever.

**4 — one server, and its protocol.** "One transport per protocol" restated in
the new grammar: a second server is a second wire, which is a second protocol
entity. The admitted `protocol` values are AsyncAPI's own spellings, and note
that TLS changes the protocol string but **not** the bindings key — a `wss`
server still binds under `ws`:

| `kind`      | `protocol` (plain / TLS) | `bindings` key |
| ----------- | ------------------------ | -------------- |
| `kafka`     | `kafka` / `kafka-secure` | `kafka`        |
| `websocket` | `ws` / `wss`             | `ws`           |
| `amqp`      | `amqp` / `amqps`         | `amqp`         |

`servers.<id>.host` is REQUIRED by AsyncAPI and is a **deployment fact**, which
this file does not hold — placement is a claim made in
[environment.md](environment.md)'s `topology.yaml`. It is therefore written as a
bare server variable with a description and **no `default`**, a default being
the same fact by another name:

```yaml
servers:
  acme-settlement:                       # the id carries kafka's `cluster` label
    host: "{host}"
    protocol: kafka
    variables:
      host:
        description: Supplied by the environment; this protocol names no deployment.
```

```yaml
servers:
  acme-settlement:
    host: kafka-01.acme.internal:9092    # W_PROTO_TRANSPORT_HOST — a literal host
    protocol: kafka                      # names a deployment; see environment/*
```

Both blocks write `kafka` and not `kafka-secure` because that is what the file
they are drawn from writes, and the reason is stated in the file: the mini-spec's
`kafka` binding block carries **no `tls` field**, so the document being replaced
asserted nothing about the wire, and a migration that picks the TLS spelling
invents a security fact. `http`, `grpc` and `websocket` do carry `tls`, so on
those the spelling follows the boolean; `kafka` and `amqp` do not, so on those it
follows the plain form until an author writes otherwise.

The literal is a **warning**, not an error: a fixed third-party endpoint is a
legitimate constant, and this document never breaks a catalog that loads.

**5 — `channels`.** It is what the surface list became, so a document without it
describes no surface at all.

**6 — `operations`, and whose side `action` is on.** `action` is `send` or
`receive` *relative to one application*, and a protocol is a conversation
between several — so a document that carries operations MUST name which
participant it is written from, and `id` is AsyncAPI's own field for exactly
that ("Identifier of the application the AsyncAPI document is defining"). The
value is the participant's `ref` in absolute form, and it must be one of the
protocol's own.

Operations are **optional** because the mini-spec's kafka surface list records
no direction at all, and a migration must not invent one. A `websocket` surface
list does record it, and converts mechanically:

| `direction`        | `action`                                   |
| ------------------ | ------------------------------------------ |
| `client-to-server` | `receive`                                  |
| `server-to-client` | `send`                                     |
| `bidi`             | two operations on one channel, one of each |

```yaml
asyncapi: 3.1.0
id: srn://brass/product/play/component/server   # the authority's side
operations:
  move-submit:
    action: receive                             # was direction: client-to-server
    channel: { $ref: "#/channels/move-submit" }
```

### Field for field, from the mini-spec

| Mini-spec field                       | AsyncAPI home                                                        |
| ------------------------------------- | -------------------------------------------------------------------- |
| `kind`                                | `servers.<id>.protocol` (per the table above)                        |
| `summary`                             | `info.description` — the Info Object has no `summary`                |
| `encoding`                            | `defaultContentType` (per the table below)                           |
| `auth`                                | `x-srn-auth` on the Server Object — see below                        |
| `spec`                                | **dissolves** — the document *is* the spec                           |
| `x-*` author keys                     | `x-*` on any object, verbatim                                        |
| `kafka.cluster`                       | the **server id** (`^[A-Za-z0-9_\-]+$` admits our labels)            |
| `kafka.topics[].name`                 | `channels.<id>.address`                                              |
| `kafka.topics[].partitions`           | kafka channel binding `partitions`                                   |
| `kafka.topics[].retention`            | kafka channel binding `topicConfiguration.retention.ms`              |
| `kafka.topics[].key`                  | `x-srn-partition-key` — see below                                    |
| `kafka.topics[].message`              | a Message Object, its SRN in `x-srn-payload`                         |
| `kafka.topics[].summary`              | `channels.<id>.summary`                                              |
| `websocket.path`                      | `servers.<id>.pathname`                                              |
| `websocket.tls`                       | the `protocol` string (`wss` / `ws`)                                 |
| `websocket.subprotocol`               | ws channel binding `headers`, as a `Sec-WebSocket-Protocol` property |
| `websocket.channels[]`                | **N** channels, one per entry — see below                            |
| `websocket.channels[].name`           | `channels.<id>` — the channelId, kept verbatim                       |
| `websocket.channels[].direction`      | `operations.<id>.action`                                             |
| `websocket.channels[].message`        | a Message Object, its SRN in `x-srn-payload`                         |
| *(no mini-spec field)*                | `channels.<id>.address` — the wire name; see below                   |
| `amqp.exchange` / `-type` / `durable` | amqp channel binding `exchange.{name,type,durable}`                  |
| `amqp.bindings[].routing-key`         | `channels.<id>.address`, `is: routingKey`                            |
| `amqp.bindings[].queue`               | a second channel, `is: queue`                                        |

Two rows change shape rather than merely moving, and an author who skims will
get them wrong. `retention: 30d` becomes `retention.ms: 2592000000` — exact, and
the human unit does not survive the trip.

And **N `websocket.channels[]` entries become N AsyncAPI channels, not N messages
on one.** Each keeps its mini-spec `name` as its channelId, and each MUST carry
an `address`. The mini-spec has no field holding that value — the entry `name` is
a catalog label, not a wire name — so a migration takes it from what the protocol
already documents about the wire (the socket.io event, the frame type, the
subprotocol message name), and where the wire names nothing, the entry name
serves. What it may not be is absent: an absent `address` reads as "unknown" in
AsyncAPI, which is the one thing these are not. Two entries may share one
`address` when the mini-spec split them by `direction`; they stay two channels,
because `direction` became `action` and an operation names exactly one channel.

The reason is [W9](#workflow-validation-rules), and it is mechanical rather than
aesthetic. A workflow step's `channel:` matches a channel `address` or channelId,
and every step that names a websocket channel names one of the mini-spec entry
names. Collapse N entries into one channel and N−1 of those references resolve to
nothing — `W_PROTO_WF_CHANNEL_UNKNOWN` on a rewrite that lost no information,
which is a check reporting the grammar's discomfort as the catalog's error.

AsyncAPI's WebSockets binding does say the channel "represents the connection"
and that WebSockets has no virtual channels, and this rule departs from that note
knowingly. The note describes raw WebSockets; it is not a cardinality constraint
in the specification, which places no limit on how many Channel Objects a
document declares, and it does not describe what runs on this wire — socket.io
multiplexes named events over one connection, which is the virtual channel the
note says the raw protocol lacks. The connection itself is still stated once, in
`servers.<id>.pathname`. The price is real and small: a stock ws code generator
reading a migrated file sees N channels where its binding note led it to expect
one, and generates N handlers over a single socket — which is the shape the
application actually has.

`solutions/brass/protocol/game-transport/transport.yaml` is the catalog's only
websocket transport and is written this way: five mini-spec entries, five
channels, three distinct `address` values, and every `channel:` in its two
workflows resolving.

`encoding` maps through a fixed table, the last two rows on AsyncAPI's own
authority rather than IANA's — which is the authority that matters for a
document AsyncAPI tooling reads:

| `encoding` | `defaultContentType`              |
| ---------- | --------------------------------- |
| `json`     | `application/json`                |
| `xml`      | `application/xml`                 |
| `text`     | `text/plain`                      |
| `binary`   | `application/octet-stream`        |
| `msgpack`  | `application/vnd.msgpack`         |
| `avro`     | `application/vnd.apache.avro`     |
| `protobuf` | `application/vnd.google.protobuf` |

### The `x-srn-` extensions, and why there are only four

Three catalog facts have no AsyncAPI home, so they ride extensions. The prefix
is **`x-srn-`**: AsyncAPI reserves nothing, but the OpenAPI Initiative reserves
`x-oai-` and `x-oas-` (and `x-arazzo` in Arazzo), and this kind's directory can
hold all three formats at once. `x-srn-` collides with none of them, matches
AsyncAPI's extension pattern `^x-[\w\d\.\x2d_]+$`, and continues the family the
catalog already speaks — `x-srn` names an address, `x-srn-<thing>` names a
catalog fact.

| Key                   | Object                                        | Carries                                                  |
| --------------------- | --------------------------------------------- | -------------------------------------------------------- |
| `x-srn`               | root                                          | the owning entity's SRN — profile rule 1, not a new key  |
| `x-srn-payload`       | Message                                       | the **pinned** SRN of the datamodel this message carries |
| `x-srn-auth`          | Server                                        | the `auth` labels, verbatim, display-only                |
| `x-srn-partition-key` | Message — or Channel, if it has no `messages` | the payload field the topic partitions by                |

`x-srn-payload` is the one that must exist, and the reason is version pinning. A
Message Object's `payload` takes a Schema Object or a `$ref` to a URI, and a
catalog schema URL addresses the *current* schema by construction
([kinds/datamodel.md](datamodel.md)) — so `$ref`-ing one silently turns
`order@3` into "whatever `order` is now", which is the exact drift
[Payload binding](#payload-binding-to-datamodels) tells you to pin against. The
extension is a payload reference like any other: it MUST resolve to a
`datamodel` (`E_PROTO_PAYLOAD_KIND`), it MUST NOT be an artifact SRN, and it
SHOULD pin `@version`. A `payload.$ref` at the served schema URL is permitted
beside it and means something weaker.

`x-srn-auth` exists **so that the framework never fabricates a security fact.**
`mtls` maps exactly onto `type: X509`, but `sasl-scram` does not say whether it
is `scramSha256` or `scramSha512`, and a label like `seat-credentials` or
`origin-allowlist` is not an authentication scheme at all. `auth` has always
been display-only labels; deriving a typed scheme from one invents the digest.
The labels therefore carry over unchanged and render the transport card as they
always did, while a real `components.securitySchemes` plus `security` is
permitted, encouraged, and **never derived by the framework**.

`x-srn-partition-key` exists because AsyncAPI's kafka message binding `key` is a
Schema Object describing the key's *shape*, whereas `key: order-id` names a
*field*. Both may appear; they say different things.

It rides the **Message Object**, mirroring where AsyncAPI's own `key` sits — and
it rides the **Channel Object** when, and only when, that channel declares no
`messages` map at all. There is no third option, and both alternatives to this
one lie: dropping the key loses a fact the mini-spec stated, and minting an empty
Message Object to hang it on invents a payload the source withheld. A channel
that *does* declare `messages` MUST put the key on a message, so the two forms
never both apply to one channel.

Counted on disk 2026-08-21: **9** `x-srn-partition-key` keys across the catalog,
**8** on a Message and **1** on a Channel. The one is
`reconciliation-report` in `solutions/acme/protocol/settlement/transport.yaml`,
whose payload model is still under design, so it carries a partition key and no
message:

```yaml
  reconciliation-report:
    address: acme.settlement.reconciliation-report.v1
    summary: Nightly reconciliation outcome; its payload model is still under design.
    x-srn-partition-key: batch-id
    bindings:
      kafka:
        partitions: 1
        topicConfiguration:
          retention.ms: 7776000000    # was `retention: 90d`
        bindingVersion: "0.5.0"
```

Nothing else is minted. A future AsyncAPI-dialect transport needing a foreign
payload language uses `components.schemas` with a `schemaFormat` from AsyncAPI's
own table (`application/vnd.apache.avro;version=1.9.0`,
`application/vnd.google.protobuf;version=3`) — no extension is created for a
user that does not exist.

### What the portal derives from it

The AsyncAPI dialect MUST be **parsed, not served as bytes**, and the difference
from `openapi.yaml` is that nothing was ever derived from that file. This role
feeds the transport card, the message × datamodel matrix, and the `channel` half
of workflow rule W9, so serving it as bytes would darken three views on precisely
the protocols that adopted a standard.

**This section specifies a reader that does not exist yet.** Measured in
`framework/portal/src` on 2026-08-21: `lib/catalog/dialects.ts` carries the
`asyncapi:` row, so the dialect is *detected* — the document loads, records
`dialect.key: 'asyncapi'` and keeps its native key unstripped — and
`lib/protocol/` holds modules for workflows and state machines and none for
transports, in either dialect. The four rows below are therefore requirements,
and `E_PROTO_TRANSPORT_ASYNCAPI`, `W_PROTO_TRANSPORT_HOST` and
`W_PROTO_WF_CHANNEL_UNKNOWN` sit in the portal's debt register
(`lib/catalog/diagnostic-coverage.test.ts`) with no emitter. A spec may specify
ahead of its implementation; it must not describe one that is absent.

| Derived view                | To be read from                                                         |
| --------------------------- | ----------------------------------------------------------------------- |
| Transport card              | `servers.<id>.protocol`, `pathname`, `defaultContentType`, `x-srn-auth` |
| Surface list                | `channels` × `operations`, with each channel's `bindings`               |
| Message × datamodel matrix  | every `x-srn-payload`                                                   |
| Workflow `channel` matching | a channel's `address`, or its channelId                                 |

The last row is the AsyncAPI half of [W9](#workflow-validation-rules), which is
one rule over two dialects and is stated once, there. W9 will stop being skipped
for a transport in this dialect, because rule 5 makes `channels` non-empty and
there is always something to check against.

Everything outside that profile is carried in the artifact's raw bytes, served
on the source pane, and derives nothing — the same standing every `x-` key
already has. Validating the document against the full AsyncAPI specification is
**deferred**: it is a warn-only lint over an external tool, not a parser this
framework owns.

### Worked: `settlement` in the AsyncAPI dialect

`solutions/acme/protocol/settlement/transport.yaml`, whose mini-spec form was
three Kafka topics on cluster `acme-settlement`. Reproduced **verbatim from the
file on disk**, comments included — an example that paraphrases the file it names
is a second source of truth, and this one has been wrong before. No direction is
recorded in the mini-spec form, so this document carries **no `operations`
block** and invents none:

```yaml
asyncapi: 3.1.0
x-srn: srn://acme/protocol/settlement
info:
  title: Settlement
  version: unversioned
  description: Settlement facts published by shop and consumed by billing.
defaultContentType: application/vnd.apache.avro
servers:
  acme-settlement:
    host: "{host}"
    # The plain spelling, not `kafka-secure`. `protocol` is required, so one of
    # the two must be written; the mini-spec's `kafka` binding carries no `tls`
    # field at all — unlike `http`, `grpc` and `websocket`, which do — so the
    # file this replaces made no claim about the wire. The `auth` labels below
    # are the only security fact it ever stated, and they carry over verbatim.
    protocol: kafka
    variables:
      host:
        description: Supplied by the environment; this protocol names no deployment.
    x-srn-auth:
      - sasl-scram
      - mtls
channels:
  order-paid:
    address: acme.settlement.order-paid.v1
    summary: Emitted once an order reaches the paid state and funds are captured.
    bindings:
      kafka:
        partitions: 12
        topicConfiguration:
          retention.ms: 2592000000    # was `retention: 30d`
        bindingVersion: "0.5.0"
    messages:
      order-paid:
        x-srn-payload: /product/shop/component/checkout/component/payment/datamodel/order@3
        x-srn-partition-key: order-id

  ledger-entry-posted:
    address: acme.settlement.ledger-entry-posted.v1
    summary: One event per posted double-entry leg, published by the ledger.
    bindings:
      kafka:
        partitions: 12
        topicConfiguration:
          retention.ms: 2592000000    # was `retention: 30d`
        bindingVersion: "0.5.0"
    messages:
      ledger-entry-posted:
        x-srn-payload: /product/billing/datamodel/ledger-entry@1
        x-srn-partition-key: order-id

  reconciliation-report:
    address: acme.settlement.reconciliation-report.v1
    summary: Nightly reconciliation outcome; its payload model is still under design.
    # No `messages` map: the mini-spec named no payload here either, and
    # `messages` is optional.
    #
    # `x-srn-partition-key` normally sits on a Message Object, mirroring where
    # AsyncAPI's own kafka `key` sits. This is the one channel in the catalog
    # with a `key` and no `message` — 9 keyed topics, 8 with a message — and both
    # alternatives lie: dropping `batch-id` loses a fact the source stated, and
    # minting an empty Message Object to hang it on invents a payload the source
    # withheld. So the key rides the Channel, and only where a channel declares
    # no `messages`.
    x-srn-partition-key: batch-id
    bindings:
      kafka:
        partitions: 1
        topicConfiguration:
          retention.ms: 7776000000    # was `retention: 90d`
        bindingVersion: "0.5.0"

# No `operations` block. The mini-spec's kafka surface list records no direction,
# and `action` is send/receive relative to one application — inventing a side
# here would say more than the file it replaces. Who publishes and who consumes
# is in `participants` in index.md, where it always was.
```

Profile audit: `x-srn` names the entity; `info.title` matches the frontmatter;
`info.version` is the fixed string; one server, `kafka`, admitted for
`kind: kafka`; `channels` is non-empty; no `operations`, so no `id` is required.
Protocol audit: the plain spelling and not `kafka-secure`, because the mini-spec
`kafka` block has no `tls` field and the file being replaced therefore asserted
nothing about TLS — the `auth` labels are its only security fact, and they carry
over verbatim in `x-srn-auth`. Host audit: templated, no default, so no
`W_PROTO_TRANSPORT_HOST`. Payload audit: two `x-srn-payload` keys, pinned at `@3`
and `@1`, each resolving to a datamodel. Partition-key audit: three keys, two on
Message Objects and one on the `reconciliation-report` Channel — which carries
**no** `messages` map, legal because `messages` is optional and truthful because
the mini-spec form named no payload there either, and which is therefore the one
channel in the catalog where the key rides the Channel. Dialect
audit: `asyncapi: 3.1.0` is recognised, native, and never stripped, so no
`W_ARTIFACT_DIALECT`; the file carries no `$schema`, and adding one would flip it
to the mini-spec dialect, where `asyncapi:` is then an unknown top-level key and
`E_PROTO_TRANSPORT_SCHEMA` ([Artifact dialects](#artifact-dialects)).

## The workflow mini-spec

A workflow is one named, ordered exchange between participants. It is the input
to the portal's sequence diagrams, and it is designed to be as legible to an AI
reading the raw YAML as to a renderer: flat message steps by default, three
named fragment forms for structure, nothing else.

File: `workflows/<name>.yaml`, `<name>` kebab-case.

### Top-level fields

| Field          | Type                          | Required | Rule                                                                             |
| -------------- | ----------------------------- | -------- | -------------------------------------------------------------------------------- |
| `name`         | kebab-case string             | yes      | MUST equal the filename stem (`E_PROTO_WF_NAME`).                                |
| `title`        | string, ≤ 80 chars            | yes      | Diagram heading.                                                                 |
| `summary`      | string, one line, ≤ 200 chars | no       | Shown in the protocol page's workflow list.                                      |
| `participants` | list of aliases               | no       | Lifeline order; MUST be a subset of the protocol's aliases (`E_PROTO_WF_ALIAS`). |
| `steps`        | list of step nodes            | yes      | At least one (`E_PROTO_WF_EMPTY_BRANCH`).                                        |

When `participants` is omitted, lifelines are ordered by first appearance in
`steps`. When present it MAY be a strict subset — aliases not listed but used
in a step are appended after the listed ones, so the field is a layout hint,
never a restriction.

```yaml
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/workflow-document
name: place-order              # file is workflows/place-order.yaml
title: Place an order
summary: Customer submits a cart; checkout reserves stock, authorizes payment, confirms.
participants: [customer, checkout, inventory, payment]
steps:
  - message: submit-order
    from: customer
    to: checkout
```

`$schema` carries no row in the table above and violates none of it: it is the
dialect header ([Artifact dialects](#artifact-dialects)), and it binds to the
**file root only**. A step is not an artifact root, so a `$schema` there names
the grammar of nothing and is an ordinary unknown key:

```yaml
steps:
  - message: submit-order
    from: customer
    to: checkout
    $schema: https://schemas.metaframework.dev/…/datamodel/workflow-document
                             # E_PROTO_WF_SCHEMA — the header binds to the file,
                             # never to a step
```

### Step nodes

A step node is a mapping carrying **exactly one discriminator key** from
`message`, `alt`, `opt`, `loop` (`E_PROTO_WF_STEP_SHAPE`). `otherwise` is the
one permitted companion key, and only alongside `alt`.

```yaml
- message: submit-order        # ✓ message step
  from: customer
  to: checkout

- message: submit-order        # E_PROTO_WF_STEP_SHAPE — two discriminators
  loop:
    while: retrying
    steps: [...]

- from: customer               # E_PROTO_WF_STEP_SHAPE — no discriminator
  to: checkout
```

**Message step:**

| Field       | Type                                         | Required | Rule                                                                           |
| ----------- | -------------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| `message`   | kebab-case string, ≤ 64 chars                | yes      | Logical message name; the arrow label.                                         |
| `from`      | participant alias                            | yes      | MUST be declared in the protocol's `participants` (`E_PROTO_WF_ALIAS`).        |
| `to`        | alias, or list of aliases when `kind: event` | yes      | A list on a non-`event` step is `E_PROTO_WF_FANOUT`.                           |
| `kind`      | `call \| return \| event \| error`           | no       | Default `call`.                                                                |
| `payload`   | SRN reference                                | no       | MUST resolve to a `datamodel` (`E_PROTO_PAYLOAD_KIND`); SHOULD pin `@version`. |
| `channel`   | string                                       | no       | Topic / queue / routing-key / path this message travels on.                    |
| `condition` | string, ≤ 120 chars                          | no       | Display-only guard label on the arrow. Creates **no** branch.                  |
| `note`      | string, ≤ 200 chars                          | no       | Rendered as a UML note anchored to the step.                                   |

`from` and `to` MAY be the same alias — a self-call, rendered as the usual
looping arrow on one lifeline.

`condition` versus `alt`/`opt` is the most common authoring mistake, so it is
stated bluntly: `condition` annotates *one* arrow with a guard for the reader;
it never changes the step sequence. If two futures diverge, use `alt`. If a
step may be skipped, use `opt`.

```yaml
- message: charge-card
  from: checkout
  to: payment
  condition: cart total > 0        # renders as "[cart total > 0] charge-card"
                                   # the next step still follows unconditionally
```

**`alt` block** — mutually exclusive branches:

| Field       | Type                   | Required | Rule                                         |
| ----------- | ---------------------- | -------- | -------------------------------------------- |
| `alt`       | list of branch objects | yes      | At least one branch.                         |
| `otherwise` | list of step nodes     | no       | The `[else]` compartment; at least one step. |

Branch object: `when` (string, ≤ 120 chars, required — the compartment label),
`steps` (list of step nodes, at least one, required).

An `alt` fragment MUST have at least **two compartments**, counting `otherwise`
as one (`E_PROTO_WF_SCHEMA`). So `alt` with two branches is legal, `alt` with
one branch plus `otherwise` is legal (the ordinary if/else), and `alt` with a
single branch and no `otherwise` is not — that is an `opt`, and the two mean
different things: `opt` says the steps may be skipped, `alt` says exactly one
compartment runs.

**`opt` block** — a single conditional branch:

| Field | Type                                     | Required |
| ----- | ---------------------------------------- | -------- |
| `opt` | mapping `{ when, steps }`                | yes      |

**`loop` block** — repetition:

| Field  | Type                                       | Required |
| ------ | ------------------------------------------ | -------- |
| `loop` | mapping `{ while, max?, steps }`           | yes      |

`while` (string, ≤ 120 chars, required) is the loop condition label; `max`
(integer ≥ 1, optional) renders as `loop [≤ max]`; `steps` is a non-empty list
of step nodes.

```yaml
- alt:
    - when: stock reserved
      steps:
        - message: authorize-payment
          from: checkout
          to: payment
    - when: partially reserved
      steps:
        - message: propose-split-shipment
          from: checkout
          to: customer
  otherwise:
    - message: out-of-stock
      from: checkout
      to: customer
      kind: error

- opt:
    when: customer opted into email notifications
    steps:
      - message: order-receipt
        from: checkout
        to: customer
        kind: event

- loop:
    while: inventory answers RETRY
    max: 3
    steps:
      - message: reserve-stock
        from: checkout
        to: inventory
```

### Nesting rules

- Fragment blocks (`alt`, `opt`, `loop`) MAY nest. A fragment directly under
  `steps` at the root has **depth 1**; a fragment inside its branch has depth 2;
  and so on. **Maximum depth is 3** (`E_PROTO_WF_DEPTH`) — beyond that a
  sequence diagram stops being readable, and the exchange should be split into
  a second workflow or expressed as a state machine.
- Every `steps` list — the workflow's own, each `alt` branch's, `otherwise`'s,
  `opt`'s, `loop`'s — MUST contain at least one step
  (`E_PROTO_WF_EMPTY_BRANCH`).
- Steps have no ids. The portal's stable key for a step is its positional path,
  e.g. `steps[4].alt[0].steps[2]`, which makes repeated message names (retries,
  polling) unambiguous without authoring overhead.

```yaml
steps:
  - alt:                    # depth 1
      - when: a
        steps:
          - loop:           # depth 2
              while: b
              steps:
                - opt:      # depth 3 — legal, and the limit
                    when: c
                    steps:
                      - alt: [...]      # depth 4 — E_PROTO_WF_DEPTH
      - when: d
        steps: []           # E_PROTO_WF_EMPTY_BRANCH
```

### Deliberately not supported

No parallel fragments (`par`), no gateways, no pools or swimlanes, no timers or
delays, no compensation, no sub-workflow invocation, no data objects. Each of
these is what turns a sequence description into BPMN. Where one is genuinely
needed: split into several workflows, or model the ordering constraint in
`states.json`. Adding `par` or a workflow-reference fragment later is an
additive spec change.

### Rendering mapping

Mechanically derivable, one row per step `kind`:

| `kind`   | Arrow                                      | UML meaning         |
| -------- | ------------------------------------------ | ------------------- |
| `call`   | solid line, filled arrowhead               | synchronous message |
| `return` | dashed line, open arrowhead                | reply message       |
| `event`  | solid line, open arrowhead                 | asynchronous signal |
| `error`  | dashed line, open arrowhead, error styling | failure reply       |

`alt` renders as an `alt` fragment with one compartment per branch labelled by
`when`, plus an `[else]` compartment for `otherwise`; `opt` and `loop` render
as the fragments of the same names. `condition` prefixes the arrow label in
brackets; `note` becomes an anchored note; `channel` is appended to the arrow
label in the transport's styling.

### Workflow validation rules

| #   | Rule                                                                                                                    | Error class                               |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| W1  | File parses and matches the field tables above (the `$schema` header aside).                                            | `E_PROTO_WF_SCHEMA`                       |
| W2  | `name` equals the filename stem.                                                                                        | `E_PROTO_WF_NAME`                         |
| W3  | Exactly one discriminator key per step node.                                                                            | `E_PROTO_WF_STEP_SHAPE`                   |
| W4  | Every `from` / `to` / `participants` alias is declared in the protocol.                                                 | `E_PROTO_WF_ALIAS`                        |
| W5  | Every `steps` list is non-empty.                                                                                        | `E_PROTO_WF_EMPTY_BRANCH`                 |
| W6  | Fragment nesting depth ≤ 3.                                                                                             | `E_PROTO_WF_DEPTH`                        |
| W7  | List-valued `to` only on `kind: event`.                                                                                 | `E_PROTO_WF_FANOUT`                       |
| W8  | `payload` resolves (per [srn.md](../srn.md)) to a `datamodel`.                                                          | `E_SRN_DANGLING` / `E_PROTO_PAYLOAD_KIND` |
| W9  | `channel` matches something the transport declares, in whichever dialect it is written — see below.                     | `W_PROTO_WF_CHANNEL_UNKNOWN`              |
| W10 | A `return` / `error` step is preceded, in the same fragment or an enclosing one, by a `call` in the opposite direction. | `W_PROTO_WF_ORPHAN_RETURN`                |

**W9 in full.** It is one rule over two dialects, and what `channel` may name
depends on which dialect `transport.yaml` is written in:

| `transport.yaml` dialect                           | `channel` matches                                          |
| -------------------------------------------------- | ---------------------------------------------------------- |
| [mini-spec](#transportyaml)                        | a surface entry's `name`, `queue`, `routing-key` or `path` |
| [AsyncAPI](#the-asyncapi-dialect-of-transportyaml) | a channel's `address` **or** its channelId                 |

W9 is skipped entirely only when there is nothing to check against: no
`transport.yaml`, or a mini-spec one that links a `spec` instead of declaring a
surface list (a linked OpenAPI/AsyncAPI file is not parsed in v1 — the absence of
a check is not a warning). An AsyncAPI-dialect transport is never in that
position, because profile rule 5 requires `channels` to be non-empty.

```yaml
- message: stock-reserved
  from: warehouse            # E_PROTO_WF_ALIAS — no such alias in participants
  to: checkout
  kind: return
  payload: /actor/customer           # E_PROTO_PAYLOAD_KIND — not a datamodel
  channel: acme.shop.order.shipped   # W_PROTO_WF_CHANNEL_UNKNOWN — no such topic
```

(`/product/shop/actor/customer` would not even get that far: actors are
solution-level, so the path is `E_SRN_PLACEMENT` before its kind is looked up —
[srn.md](../srn.md).)

## `arazzo.yaml` — the orchestration surface

`arazzo.yaml` is an **Arazzo Description** — the OpenAPI Initiative's format for
a deterministic sequence of API calls — sitting beside `index.md` under that
fixed bare name, OPTIONAL, addressable as `.arazzo`, and **unvalidated**:
snapshotted with the entity, served as authored, and judged by nothing here.
This document states no field table for it, so no rule can be broken in one and
no diagnostic is raised from its contents. Its dialect key is Arazzo's own
(`arazzo: 1.1.0`, [Artifact dialects](#artifact-dialects)).

Unvalidated is not unread. A portal MAY draw an Arazzo Description — this one
draws a step graph of each workflow — and doing so asserts nothing: a renderer
that meets a field it does not know draws less, where a validator would have to
call the document wrong. The distinction is not stylistic. There is no published
JSON Schema for Arazzo 1.1 to check a document against, so this framework has no
grammar to enforce and does not pretend to one. What it can do is show the
reader what the file says.

### It is a sibling of `workflows/`, not a dialect of it

The mini-spec above stays the **authoritative choreography source**. Sequence
diagrams derive from `workflows/*.yaml` and from nothing else; a protocol that
gains an `arazzo.yaml` deprecates no workflow file, loses no diagram, and raises
no warning on either artifact. It gains a second picture rather than trading the
first: the step graph an Arazzo Description draws is one executor's path, beside
the sequence diagram that stays the choreography. The two describe different
things:

| The mini-spec describes                              | Arazzo describes                                     |
| ---------------------------------------------------- | ---------------------------------------------------- |
| N participants; every step carries `from` and `to`   | one executor, calling operations in order            |
| actors and `in-process` participants, and self-calls | API operations reachable from a source description   |
| paired `call` / `return` arrows, and event fan-out   | a step's outputs feeding a later step's inputs       |
| `alt` / `opt` / `loop` fragments, and prose guards   | success/failure criteria and `onSuccess`/`onFailure` |

Nothing in the left column has an Arazzo carrier outside `x-` extensions, so
rewriting a workflow as an Arazzo workflow would rebuild the mini-spec inside a
goto-graph — worse to author, and a worse picture at the end of it. That is why
this is a row of the role table rather than a second dialect of
`workflows/<name>.yaml`:
had it been a dialect, one filename would have had to hold both meanings, and
choosing either would have deleted the other.

### It MUST be grounded in this entity's own artifacts

An Arazzo step references an operation, and the reference is only meaningful
against a document that defines that operation. This framework requires that
document to be one this protocol already carries:

- `sourceDescriptions[].url` MUST be a **relative URI-reference to a sibling
  artifact of this entity** — in practice `./openapi.yaml` or
  `./transport.yaml`. Arazzo permits an absolute URL; this document does not,
  for the reason no other artifact names a host either: a catalog is described
  offline and privately, and a URL pointing outside the entity is a claim
  nothing in the repository can check.
- Every operation, channel or workflow a step names MUST resolve — into a
  document `sourceDescriptions` names, or into a workflow of this same file.

Both clauses are `W_PROTO_ARAZZO_UNGROUNDED`: a warning, because an Arazzo
document that has drifted is a document that is wrong rather than a catalog that
is broken. Grounding is therefore what decides whether a protocol may carry this
artifact at all — an `http` protocol with no `openapi.yaml`, and every `grpc` and
`in-process` protocol, has nothing to ground against, and `sourceDescriptions` is
closed to `openapi`, `asyncapi` and `arazzo` so no `.proto` will ever serve.
Those protocols do not write this file.

```yaml
# arazzo.yaml — the two lines this framework reads, and the rule it adds
arazzo: 1.1.0
sourceDescriptions:
  - name: orders
    type: openapi
    url: ./openapi.yaml               # a sibling artifact — always relative
```

```yaml
arazzo: 1.1.0
sourceDescriptions:
  - name: orders
    type: openapi
    url: https://api.example.com/openapi.yaml   # W_PROTO_ARAZZO_UNGROUNDED —
                                                #   names a document this entity
                                                #   does not carry
```

Everything else in the file is Arazzo's own. This document adds no key to it and
validates none of it — including Arazzo's REQUIRED `info.version`, which is a
field of a foreign format in a document the framework does not read, and
therefore not the second clock that a top-level `version:` in `transport.yaml` or
a workflow file would be ([evolution.md](../evolution.md)).

### Scope, spelling, and the version band

- **Initiator-facing surface only.** One `arazzo.yaml` describes the sequence as
  the caller drives it. It is not a second description of the wire — that is
  `transport.yaml`'s — and it is not a second description of the choreography.
  Where the two descriptions of one exchange disagree, `transport.yaml` and the
  workflow files are what the portal renders.
- **`arazzo.json` is not recognised**, and raises `W_PROTO_ARTIFACT_UNKNOWN`.
  The Arazzo Specification recommends the two spellings equally; the role table
  cannot take both, because a role whose file varies its extension makes
  file → role need a directory listing ([structure.md](../structure.md)). YAML is
  pinned to match every other artifact of this kind.
- **One document.** Arazzo permits a Description split across connected
  documents, with the root object in an *entry* document. `arazzo.yaml` is that
  entry document and this kind recognises no asset subdirectory for the others —
  a non-entry part would be a free-named file, unaddressable, and
  `W_PROTO_ARTIFACT_UNKNOWN`. Write one self-contained document.
- **The band is `1.1.x`.** Arazzo's Versions section is OpenAPI's, verbatim: the
  `major`.`minor` portion designates the feature set and the patch version
  SHOULD NOT be considered by tooling, so `1.1.1` is the same dialect and the
  band is one minor line ([structure.md](../structure.md)). The line is `1.1`
  rather than `1.0` because 1.0's `sourceDescriptions[].type` admits only
  `openapi` and `arazzo`: it cannot name an AsyncAPI document, and it has no
  channel-level step reference — which is most of the grounding this kind has to
  offer. A correct 1.0 file is read, warned `W_ARTIFACT_DIALECT`, and never
  broken, exactly as an OpenAPI 3.0 document is under the `openapi` role.
- **The framework defines no `x-` key here.** Should it ever need one it will be
  spelled `x-srn` or `x-srn-*`, as in `transport.yaml`'s AsyncAPI dialect and in
  `schema.json` — never `x-arazzo`, `x-oai-*` or `x-oas-*`, which the OpenAPI
  Initiative reserves.

## `states.json` — the conversation state machine

`states.json` is an **XState v5 machine configuration** describing the state of
**one conversation** as the protocol sees it — not the internal state of any
single participant. A participant's own state machine belongs to that component.
Exactly one machine per protocol; a `states/` subdirectory for several is a
plausible additive extension, not v1.

**The contract is a strict, setup-free subset of XState v5 `createMachine`
config: the file MUST load unchanged.** `createMachine(JSON.parse(bytes))` —
that call and nothing else — constructs every `states.json` in a catalog.
*Unchanged* is meant literally: no pre-processing pass, no normalization step,
no `setup({ … })` wrapper, no implementations object. That is the point of
pinning a subset rather than inventing a format, and it is a claim CI settles
rather than one this document asserts: the proof-of-contract test constructs
every `states.json` under `solutions/`, and a construction failure is a build
failure.

Both qualifiers carry weight.

- **Strict** — a *proper* subset, so the implication runs one way only. Every
  `states.json` is a valid XState v5 config; the converse is false, and the
  constructs the subset leaves out are left out deliberately
  ([Explicitly outside the subset](#explicitly-outside-the-subset)). A file
  XState would happily accept is still `E_PROTO_STATES_SUBSET` here.
- **Setup-free** — `setup({ guards, actions }).createMachine(…)` is XState's
  form for binding typed implementations, and it is exactly the form this
  contract forbids, because it makes the configuration meaningless without the
  TypeScript object standing beside it. A catalog artifact travels alone —
  served by `/artifacts`, pasted into an editor, vendored by a consumer — so it
  has to be complete in its own bytes.

### The dialect header

`states.json` declares its dialect the way every artifact of this kind does
([Artifact dialects](#artifact-dialects)) — `$schema` at the root, holding the
canonical schema URL of the `state-machine-document` meta-schema:

```json
{
  "$schema": "https://schemas.metaframework.dev/metaframework/product/specification/datamodel/state-machine-document",
  "id": "order-placement",
  "initial": "submitted"
}
```

What is specific to this artifact is what the key would collide with if it
stayed. `states.json` has no `x-` hatch at all — every unknown key is
`E_PROTO_STATES_SUBSET`, and the subset is a foreign standard's, not this
framework's to widen. So the header is not *tolerated* by the subset; it never
meets it: the loader deletes it before the subset is checked
([structure.md](../structure.md#the-framework-owned-key-is-read-once-then-removed)).
Two things follow, and together they are the reason for doing it in that order:

- The tables below carry no `$schema` row and need none. The key is not part of
  an XState configuration, and it is not an unknown key either — by the time the
  subset is checked it is gone, so nothing is carved out of
  `E_PROTO_STATES_SUBSET` and the validator stays strict.
- The `createMachine()` contract above stays **literally** true. What CI
  constructs is the residue, and the residue is the file minus exactly one
  framework key. Stripping is not a workaround for XState's strictness; it is
  what keeps "a `states.json` *is* an XState config" a statement about the whole
  document rather than about most of it.

The parser names the key out loud anyway, because stripping is the *loader's*
step and the loader is not the only caller. The function that reads a machine
configuration is exported over an already-parsed document, so a fixture, a test,
or a consumer holding one file's bytes reaches it without passing through
`adoptDialect` — with the header still in hand, on a file this document told the
author to write. Rejecting it there would make the framework's own instruction
illegal in the framework's own parser, so the configuration schema admits
`$schema` as an optional bare string at the root and drops it itself. The
published `state-machine-document` meta-schema is generated from that same
schema, which forces the identical answer independently: a meta-schema whose
`additionalProperties: false` forbids the very key that points at it cannot
validate the file it describes.

### Supported subset

Root object:

| Key           | Type   | Required | Notes                                                        |
| ------------- | ------ | -------- | ------------------------------------------------------------ |
| `id`          | string | yes      | MUST equal the protocol entity `name` (`E_PROTO_STATES_ID`). |
| `initial`     | string | yes      | A key of `states`.                                           |
| `states`      | object | yes      | Keys are kebab-case state names.                             |
| `description` | string | no       | Rendered above the chart.                                    |

State node:

| Key           | Type                       | Required                    | Notes                                             |
| ------------- | -------------------------- | --------------------------- | ------------------------------------------------- |
| `states`      | object                     | no                          | Makes the node compound; nesting allowed.         |
| `initial`     | string                     | yes iff `states` is present | A key of this node's `states`.                    |
| `type`        | `"final"`                  | no                          | Only this value; a final state MUST have no `on`. |
| `on`          | object, event → transition | no                          | See below.                                        |
| `entry`       | string or list of strings  | no                          | Action names, plain strings.                      |
| `exit`        | string or list of strings  | no                          | Action names, plain strings.                      |
| `tags`        | list of kebab-case strings | no                          | Free facets; the portal may colour by tag.        |
| `description` | string                     | no                          | Rendered inside the state box.                    |

Transition value — a target string, a transition object, or an **array** of
transition objects evaluated top to bottom (first matching guard wins; an
unguarded entry is the fallback):

| Key           | Type                      | Required | Notes                                                       |
| ------------- | ------------------------- | -------- | ----------------------------------------------------------- |
| `target`      | string                    | no       | Omitted ⇒ internal self-transition (actions only, no move). |
| `guard`       | string                    | no       | Plain string, rendered as `[guard]` on the edge.            |
| `actions`     | string or list of strings | no       | Plain strings, rendered as `/ action`.                      |
| `description` | string                    | no       | Edge tooltip.                                               |

Target resolution supports exactly two forms (`E_PROTO_STATES_TARGET`
otherwise): a **sibling state key** (`"reserved"`), and an **absolute id path**
(`"#order-placement.rejected"`). Relative descent (`"reserved.settled"`) is not
supported — it is the form that most often silently resolves to the wrong node.

**Event names** MUST match `^[A-Z][A-Z0-9_]*$` (`E_PROTO_STATES_EVENT_NAME`).

### Explicitly outside the subset

`context`, `assign`, `always`, `after`, `invoke`, `input`, `output`, `meta`,
`type: "parallel"`, `type: "history"`, wildcard events (`"*"`), and object-form
actions or guards. Any of them is `E_PROTO_STATES_SUBSET`. Rationale: the
catalog documents contracts, not runtime behaviour — anything carrying data or
executing is out. Data shapes belong to datamodels; timers and invocations
belong to the implementing component.

```json
{ "context": { "attempts": 0 } }                        /* E_PROTO_STATES_SUBSET */
{ "states": { "paid": { "after": { "5000": "expired" } } } }  /* E_PROTO_STATES_SUBSET */
{ "states": { "root": { "type": "parallel" } } }        /* E_PROTO_STATES_SUBSET */
{ "on": { "payment_ok": "confirmed" } }                 /* E_PROTO_STATES_EVENT_NAME */
```

That rationale covers most of the list, and the exceptions are worth naming
because a reader cannot tell from the list which reason applies where.
`context`, `input` and `output` hold data. `assign` and the object forms of
actions and guards are functions, which JSON cannot carry at all. `invoke` names
an actor only the implementing component can supply. `always` moves the machine
with no event naming the move, so no workflow message can correspond to the
edge, and `"*"` names no event for the same reason. `type: "parallel"` and
`type: "history"` describe a conversation in several states at once, or one that
remembers where it was — bookkeeping an implementation does, not a shape two
parties agree on.

**`after` and `meta` are excluded by policy, not by serializability**, and the
distinction is load-bearing. Both are plain JSON — `{ "5000": "expired" }` is a
delay keyed by milliseconds, `meta` is an arbitrary object — neither hides a
function, and `createMachine()` would construct either without complaint.
`after` is out because a timeout is an implementation commitment rather than a
contract: the file can already say a conversation expires — as an ordinary
event (`EXPIRED`) with a target — while how long a given deployment waits before
sending that event belongs to the implementing component.
`meta` is out because it is an unschema'd side channel standing next to
schema'd fields: `description` and `tags` already carry what a reader needs, and
a free-form bag beside them absorbs the fields the portal renders and then
drifts from them. Because both are legal XState, admitting either later widens
the subset without breaking a single existing file — an ordinary additive spec
change, with nothing to migrate.

### Guards and actions are references, not implementations

A `guard` and an `action` are plain strings, and the subset admits no other
form. The string is a **reference**: a name the implementing component resolves,
and prose for every reader of the catalog. `states.json` never says what a guard
tests or what an action does — it says which decision and which effect the
conversation contract names, the same discipline `condition` follows on a
workflow arrow.

For a consumer that only *renders* the machine, that is the end of it. For one
that *runs* it, the two halves behave differently, and the asymmetry is XState's
rather than this document's:

| Reference | Left unimplemented      | Consequence for the consumer                 |
| --------- | ----------------------- | -------------------------------------------- |
| `guard`   | **errors at send time** | every guard name in the file needs a stub    |
| `actions` | **silent no-op**        | nothing to supply; the transition still runs |

The guard half is fatal rather than merely blocking. XState raises *"unable to
evaluate guard … not implemented"* while resolving the transition: the machine
does not move, and the actor ends in `status: "error"` — dead, recoverable only
by building another. Whether that surfaces as a throw at the caller or on the
actor's error channel is a detail of the consumer (an error subscriber is
attached or it is not), never of the file.

So anything that sends events into a catalog machine — a simulator, a test
harness, a walkthrough generator — MUST supply a stub for every guard name the
file mentions (`createMachine(config).provide({ guards: … })`), or the first
guarded transition it exercises ends the run. Actions need nothing supplied: an
unimplemented one is skipped and the transition proceeds regardless.
Construction is unaffected either way — the failure lands on the event, never on
`createMachine()` — which is why the proof-of-contract test constructs every
machine while providing nothing at all.

A stub is a **hypothesis, not evidence.** The guard string is prose, so whatever
a consumer makes it return is that consumer's choice about a branch this file
deliberately leaves undecided; a UI offering those toggles has to say so, and
must not present the path it took as what the protocol does.

### Correspondence with workflow messages

An event name maps to a workflow message name by lowercasing and turning `_`
into `-`:

```text
STOCK_RESERVATION_RESULT   ⇔   stock-reservation-result
PAYMENT_DECLINED           ⇔   payment-declined
```

An event with no corresponding message in any of the protocol's workflows
raises `W_PROTO_STATES_EVENT_UNKNOWN`. The reverse is not checked — plenty of
messages carry no state change. A state that no transition can reach raises
`W_PROTO_STATES_UNREACHABLE`.

The portal renders `states.json` as a state chart: final states double-bordered,
compound states as nested boxes, guards as `[guard]` and actions as `/ action`
on the edges.

## Payload binding to datamodels

Every payload reference — a workflow step's `payload`, a mini-spec surface list
entry's `request`, `response`, or `message`, and an AsyncAPI Message Object's
`x-srn-payload` — is an ordinary SRN reference per [srn.md](../srn.md).

> **The key `message` means two different things, in two different files.** In
> `workflows/*.yaml` a step's `message` is a kebab-case *logical message name*
> (the arrow label), and its SRN payload is the separate `payload` key. In
> `transport.yaml` a surface list entry's `message` is the SRN of the datamodel
> the topic/queue carries — the same role `request`/`response` play for the
> call-shaped transports. A step whose `message` looks like an SRN is
> `E_PROTO_WF_SCHEMA`; a topic whose `message` is a bare name is
> `E_PROTO_TRANSPORT_SCHEMA`.
>
> ```yaml
> # workflows/place-order.yaml
> - message: order-placed                              # a name
>   payload: /product/shop/datamodel/order-placed@2    # the SRN
>
> # transport.yaml
> topics:
>   - name: acme.shop.order.placed.v1
>     message: /product/shop/datamodel/order-placed@2  # the SRN
> ``` It MUST resolve to an entity whose `kind` is `datamodel`
(`E_PROTO_PAYLOAD_KIND`), and it SHOULD pin a version: an unpinned reference
silently follows the datamodel's latest version, so a contract that was reviewed
against `order@2` starts describing `order@3` with no diff on this file. It also
names the entity, never one of the entity's files: an artifact SRN
(`/product/shop/datamodel/order.schema@2`) is rejected with the same class —
an artifact has no kind ([Artifact addressing](#artifact-addressing)).

A payload reference is an SRN even though the datamodel's own `schema.json` uses
served HTTP URLs in its `$ref`s ([kinds/datamodel.md](datamodel.md)). The two
are not in conflict and neither is a fallback for the other: `schema.json` is
governed by an interoperability standard and must stay *dereferenceable* by
stock JSON Schema tooling, while a workflow step's `payload` is a catalog
reference in a framework-private YAML format that no external tool reads. That
is also why pinning still works here and no longer works in a `$ref` — an SRN
carries `@version`, and a schema URL addresses the current schema only.

Relative references resolve against **the referring file's own URI**, which is
the artifact path inside the entity — so the depth differs between a sibling
artifact and a file under `workflows/`. Taking the protocol
`srn://acme/product/shop/protocol/order-placement` and the same reference text
in each of its files:

| Referring file               | Base URI                                                                      | `../../datamodel/order@1` resolves to                  |
| ---------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| `index.md`                   | `srn://acme/product/shop/protocol/order-placement/index.md`                   | `srn://acme/product/shop/datamodel/order@1`            |
| `transport.yaml`             | `srn://acme/product/shop/protocol/order-placement/transport.yaml`             | `srn://acme/product/shop/datamodel/order@1`            |
| `workflows/place-order.yaml` | `srn://acme/product/shop/protocol/order-placement/workflows/place-order.yaml` | `srn://acme/product/shop/protocol/datamodel/order@1` ✗ |

The first two rows work because a bucket plus a name is **two** segments in and
two segments out: `../..` pops `order-placement` and its `protocol/` bucket, and
`datamodel/order` puts a fresh pair back. The third row is the trap — from
inside `workflows/` the same text climbs one level less far, and the result has
five segments after the authority. That is an odd count, i.e. a bucket with no
name, so the parser rejects it outright (`E_SRN_SYNTAX`,
[srn.md](../srn.md)). The correct form there is `../../../datamodel/order@1`.

Bucketing changed the failure profile of a miscount, and it is worth knowing
which half you are in:

- **Off by one** (or any odd number) is always caught. The segment count goes
  odd, and no odd path parses — whatever the segments happen to say.
- **Off by two** stays grammatical and fails later, or not at all. From
  `workflows/`, `../../../../../datamodel/order@1` resolves to
  `srn://acme/datamodel/order@1` — a perfectly legal solution-level SRN that is
  simply the wrong entity. It surfaces as `E_SRN_DANGLING` if nothing is there,
  and as a silently wrong edge if something is.

**Therefore: payload references in `workflows/*.yaml` SHOULD be path-absolute**
(`/product/shop/datamodel/order@1`, resolved from the solution root — see
[srn.md](../srn.md)). They read identically wherever the file sits, they survive
a protocol being re-placed by an NCA change, and they remove the only case the
grammar cannot catch for you.

```yaml
payload: /product/shop/datamodel/order-request@1        # recommended
payload: ../../../datamodel/order-request@1             # legal, correct here,
                                                        # easy to miscount
payload: srn://acme/product/shop/datamodel/order-request@1   # legal, verbose
payload: /product/shop/datamodel/order-request.schema@1 # E_PROTO_PAYLOAD_KIND —
                                                        # a file of the entity,
                                                        # not the entity
```

`states.json` carries no SRN references at all — it names events and states
only, and its one URL is the dialect header, which addresses a meta-schema
rather than a catalog entity ([The dialect header](#the-dialect-header)).
Payload shapes are attached to the messages that carry those events, in the
workflows.

## What the portal derives

```text
+---------------------------+       +-----------------------------------+
| index.md                  | ----> | participant graph, protocol card  |
| transport.yaml            | ----> | transport card, linked spec file  |
| workflows/*.yaml          | ----> | one sequence diagram per workflow |
| states.json               | ----> | state chart                       |
| (payload refs, all files) | ----> | message x datamodel matrix        |
+---------------------------+       +-----------------------------------+
```

| Derived view               | Inputs                                                                                                                                              | Notes                                                                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Participant graph          | `exposes` / `uses` on components and products (edges + direction); `participants` (aliases, roles)                                                  | Nodes with no back-edge render dimmed and undirected.                                                                                             |
| Sequence diagram           | one per `workflows/*.yaml`, plus `participants` for lifeline labels                                                                                 | Fragments from `alt`/`opt`/`loop`; arrow styling from step `kind`.                                                                                |
| State chart                | `states.json`                                                                                                                                       | Final states double-bordered; guards and actions as edge labels.                                                                                  |
| Message × datamodel matrix | every `payload` in the workflows, plus every `request`/`response`/`message` in a mini-spec surface list or every `x-srn-payload` in an AsyncAPI one | Rows = message names, columns = datamodel SRNs, cell = pinned version.                                                                            |
| Transport card             | `transport.yaml`, in either dialect                                                                                                                 | mini-spec: `kind`, `encoding`, `auth`, binding fields, link to `spec.file`. AsyncAPI: `protocol`, `pathname`, `defaultContentType`, `x-srn-auth`. |

The matrix is bidirectional in presentation only: the datamodel entity page
shows "carried by these protocols" as a **derived inverse**, exactly like the
inverse relation edges in [frontmatter.md](../frontmatter.md) — it is never
authored on the datamodel.

## Evolution of a protocol

[evolution.md](../evolution.md) already fixes the additive-only rule and names
the protocol's contract surface as "the operations, messages, and states". This
document only says which files hold each part:

| Element                                                                                                                      | Contract surface? | Consequence                                                    |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------- |
| A `participants` entry                                                                                                       | yes               | Removing one requires a swap.                                  |
| A surface list entry in `transport.yaml`, and its `request`/`response`/`message`                                             | yes               | Removing or repointing requires a swap.                        |
| A `channels` entry in the AsyncAPI dialect, its `address`, and its `x-srn-payload`                                           | yes               | The same rule in the other grammar.                            |
| `transport.kind` and the binding block's addressing fields                                                                   | yes               | Changing the wire requires a swap.                             |
| `servers.<id>.protocol` and `pathname` in the AsyncAPI dialect                                                               | yes               | The same rule in the other grammar.                            |
| A message `name` and its `payload` ref, anywhere in `workflows/`                                                             | yes               | Removing or repointing requires a swap.                        |
| A state, its `type: final`, and a transition's event + target                                                                | yes               | Removing requires a swap.                                      |
| `title`, `summary`, `note`, `condition`, `when`, `while`, `role`, `tags`, `description`, prose, step order within a workflow | no                | Metadata: bump `version`, no swap.                             |
| The dialect header on any artifact ([Artifact dialects](#artifact-dialects))                                                 | no                | Bump `version` once for the whole commit, whatever it touched. |

Every change in either row bumps the entity's `version`, per
[evolution.md](../evolution.md). Adding a participant, a workflow file, a step,
a surface list entry, a channel, a state, or a transition is additive and always
legal.

**Rewriting `transport.yaml` from one dialect into the other is not a swap** —
provided the surface survives it. The wire, the addresses and the payload
bindings are the contract surface; which grammar states them is not, exactly as
[Artifact dialects](#artifact-dialects) says of the header itself. So a
mini-spec `topics[]` becoming AsyncAPI `channels` with the same addresses and
the same pinned payloads is one ordinary `version` bump, and a topic quietly
disappearing in the rewrite is a removal that needs a swap like any other.

## Complete worked example

Protocol `srn://acme/product/shop/protocol/order-placement`. The component
participants are `/product/shop/component/checkout`,
`/product/shop/component/checkout/component/payment`, and
`/product/shop/component/inventory`. Their pair prefixes are
`product/shop` + `component/checkout`, `product/shop` + `component/checkout` +
`component/payment`, and `product/shop` + `component/inventory`; the longest
prefix all three share is the single pair `product/shop`, so the NCA is
`srn://acme/product/shop` and the directory sits in that product's `protocol/`
bucket — consistent with [structure.md](../structure.md).

### `index.md`

`solutions/acme/product/shop/protocol/order-placement/index.md`:

```yaml
---
name: order-placement
kind: protocol
version: 2
title: Order placement
summary: Synchronous order placement between the customer, checkout, inventory, and payment.
status: approved
owner: team-checkout
style: request-response
participants:
  - alias: customer
    ref: /actor/customer
    role: initiator
  - alias: checkout
    ref: /product/shop/component/checkout
    role: responder
  - alias: inventory
    ref: /product/shop/component/inventory
    role: responder
  - alias: payment
    ref: /product/shop/component/checkout/component/payment
    role: responder
conforms-to:
  - standard: RFC 9457 Problem Details for HTTP APIs
    url: https://www.rfc-editor.org/rfc/rfc9457
tags:
  - commerce
  - synchronous
---

Checkout is the only responder the customer talks to; inventory and payment are
reached behind it. Failure is always reported as a Problem Details document, so
every `error` step carries `/datamodel/problem@1` — the solution-level shape,
because every product reports failure the same way.

The message/datamodel matrix on this page is derived from `workflows/` — the
payload datamodels are deliberately absent from `relations`.
```

The counterpart edges, on the participants' own documents:

```yaml
# solutions/acme/product/shop/component/checkout/index.md
relations:
  exposes:
    - /product/shop/protocol/order-placement

# solutions/acme/product/shop/component/inventory/index.md
relations:
  exposes:
    - /product/shop/protocol/order-placement

# solutions/acme/product/shop/component/checkout/component/payment/index.md
relations:
  exposes:
    - /product/shop/protocol/order-placement
```

All three are written solution-absolute, and the point of the example is that
they are **identical strings** even though the three components sit at three
different depths. The relative equivalents are not: `../../protocol/order-placement`
from `checkout` and `inventory` (pop the name, pop the `component/` bucket), and
`../../../../protocol/order-placement` from `payment` (pop four to leave the
nested component). Three different counts for one edge is exactly the
bookkeeping the absolute form removes.

`/actor/customer` needs no back-edge — actors are exempt.

### `transport.yaml`

```yaml
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/transport-document
kind: http
summary: JSON over HTTPS, served by checkout at the storefront edge.
encoding: json
auth:
  - oauth2-bearer
spec:
  format: openapi
  version: 3.1.0
  file: openapi.yaml
http:
  base-path: /api/v1/orders
  tls: true
# no `operations:` — openapi.yaml is the single source of operation truth
```

### `workflows/place-order.yaml`

```yaml
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/workflow-document
name: place-order
title: Place an order
summary: Customer submits a cart; checkout reserves stock, authorizes payment, confirms.
participants: [customer, checkout, inventory, payment]
steps:
  - message: submit-order
    from: customer
    to: checkout
    kind: call
    payload: /product/shop/datamodel/order-request@1
    note: Requires an Idempotency-Key header, per requirement/idem-cap.

  - loop:
      while: inventory answers RETRY
      max: 3
      steps:
        - message: reserve-stock
          from: checkout
          to: inventory
          kind: call
          payload: /product/shop/datamodel/stock-reservation@1
        - message: stock-reservation-result
          from: inventory
          to: checkout
          kind: return
          payload: /product/shop/datamodel/stock-reservation-result@1

  - alt:
      - when: stock fully reserved
        steps:
          - message: authorize-payment
            from: checkout
            to: payment
            kind: call
            payload: /product/shop/datamodel/payment-authorization@1
          - alt:
              - when: authorization approved
                steps:
                  - message: payment-authorized
                    from: payment
                    to: checkout
                    kind: return
                    payload: /product/shop/datamodel/payment-result@1
                  - message: order-confirmed
                    from: checkout
                    to: customer
                    kind: return
                    payload: /product/shop/datamodel/order-confirmation@1
                  - opt:
                      when: customer opted into email notifications
                      steps:
                        - message: order-receipt
                          from: checkout
                          to: customer
                          kind: event
              - when: authorization declined
                steps:
                  - message: payment-declined
                    from: payment
                    to: checkout
                    kind: error
                    payload: /datamodel/problem@1
                  - message: release-stock
                    from: checkout
                    to: inventory
                    kind: event
                  - message: order-rejected
                    from: checkout
                    to: customer
                    kind: error
                    payload: /datamodel/problem@1
    otherwise:
      - message: out-of-stock
        from: checkout
        to: customer
        kind: error
        payload: /datamodel/problem@1
```

Depth audit of this workflow: `loop` = 1; outer `alt` = 1; inner `alt` = 2;
`opt` = 3 — at the limit set by `E_PROTO_WF_DEPTH`, and deliberately so, to show
where the ceiling sits. Style audit: `style: request-response` and the workflow
does contain matched `call`/`return` pairs, so no `W_PROTO_STYLE_MISMATCH`.
Channel audit: no step declares `channel`, and the transport declares no surface
list, so W9 does not apply. Dialect audit: the header names the
`workflow-document` meta-schema and sits at the file root, so no
`W_ARTIFACT_DIALECT`; it is removed before the field tables are applied, so it is
not an `E_PROTO_WF_SCHEMA` unknown key either. `transport.yaml` above carries the
`transport-document` header on the same terms, and both — with the one on
`states.json` below — arrived in the single commit that took this entity to
`version: 2`: three files, one bump. The linked `openapi.yaml` needed no edit at
all, because `openapi: 3.1.0` is required by OpenAPI and has stood at the top of
that file since it was written.

### `states.json`

```json
{
  "$schema": "https://schemas.metaframework.dev/metaframework/product/specification/datamodel/state-machine-document",
  "id": "order-placement",
  "initial": "submitted",
  "description": "State of one order-placement conversation, as seen by checkout.",
  "states": {
    "submitted": {
      "description": "Request accepted; stock reservation in flight.",
      "entry": ["assign-order-id"],
      "on": {
        "STOCK_RESERVATION_RESULT": [
          { "target": "reserved", "guard": "reservation granted in full" },
          { "target": "rejected", "actions": ["emit-problem"] }
        ],
        "OUT_OF_STOCK": {
          "target": "rejected",
          "actions": ["emit-problem"],
          "description": "Inventory exhausted after the retry budget."
        }
      }
    },
    "reserved": {
      "description": "Stock is held; payment authorization in flight.",
      "on": {
        "PAYMENT_AUTHORIZED": { "target": "confirmed", "actions": ["capture-funds"] },
        "PAYMENT_DECLINED": { "target": "rejected", "actions": ["release-stock"] }
      }
    },
    "confirmed": { "type": "final", "tags": ["success"] },
    "rejected": { "type": "final", "tags": ["failure"] }
  }
}
```

Consistency audit: `id` equals the entity `name`; every event name matches
`^[A-Z][A-Z0-9_]*$`; each of `STOCK_RESERVATION_RESULT`, `OUT_OF_STOCK`,
`PAYMENT_AUTHORIZED`, `PAYMENT_DECLINED` maps to a message present in
`place-order.yaml` (`stock-reservation-result`, `out-of-stock`,
`payment-authorized`, `payment-declined`), so no
`W_PROTO_STATES_EVENT_UNKNOWN`; `reserved`, `confirmed`, and `rejected` are all
reachable, so no `W_PROTO_STATES_UNREACHABLE`; both final states carry no `on`.
Dialect audit: the header names the `state-machine-document` meta-schema, so no
`W_ARTIFACT_DIALECT`, and stripping it leaves exactly the argument
`createMachine()` takes. Reference audit: one guard name
(`reservation granted in full`) and four action names (`assign-order-id`,
`emit-problem`, `capture-funds`, `release-stock`). A consumer that sends events
into this machine must stub the guard; the four actions it may ignore.

### Datamodels this protocol expects

Six sit in the product's own bucket, `srn://acme/product/shop/datamodel/…`:
`order-request@1`, `stock-reservation@1`, `stock-reservation-result@1`,
`payment-authorization@1`, `payment-result@1`, `order-confirmation@1`. The
seventh, `problem@1`, is solution-level (`srn://acme/datamodel/problem@1`),
because every product in the solution reports failure with the same shape.

All seven are referenced path-absolute from the workflow file, which is why the
`problem` refs read `/datamodel/problem@1` while the rest read
`/product/shop/datamodel/…` — the difference in the reference is the difference
in ownership, visible without opening anything. Each must exist as an entity
directory with an `index.md`, or the reference is `E_SRN_DANGLING`
([srn.md](../srn.md)).

## Protocol error classes

New codes introduced by this document. Codes from
[srn.md](../srn.md), [structure.md](../structure.md),
[frontmatter.md](../frontmatter.md), and [evolution.md](../evolution.md) apply
unchanged — in particular `E_FM_SCHEMA` covers every type or enum violation of
the frontmatter fields added here, `E_SRN_ARTIFACT` covers every violation of
the role vocabulary in [Artifact addressing](#artifact-addressing), and
`E_SRN_DANGLING` covers every unresolvable reference — a legal artifact suffix
whose file is absent included.

| Code                              | Meaning                                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `E_PROTO_PARTICIPANTS`            | `participants` missing or with fewer than 2 entries.                                                             |
| `E_PROTO_ALIAS_DUP`               | Two participants share an `alias`.                                                                               |
| `E_PROTO_PARTICIPANT_KIND`        | A participant `ref` resolves to a kind other than component/product/actor.                                       |
| `E_PROTO_TRANSPORT_SCHEMA`        | Mini-spec `transport.yaml` violates the top-level field table (unknown non-`x-` key, bad type).                  |
| `E_PROTO_TRANSPORT_BINDING`       | Mini-spec binding block key ≠ `kind`, block missing, or a required binding field absent.                         |
| `E_PROTO_TRANSPORT_SPEC_CONFLICT` | Mini-spec `spec` and a surface list both present.                                                                |
| `E_PROTO_TRANSPORT_ASYNCAPI`      | The AsyncAPI dialect violates the six profile rules, or its server's `protocol` is not admitted for this wire.   |
| `E_PROTO_SPEC_FILE`               | `spec.file` does not exist, is absolute, or escapes the entity directory.                                        |
| `E_PROTO_WF_SCHEMA`               | Workflow file violates the field tables (unknown non-`x-` key, bad type).                                        |
| `E_PROTO_WF_NAME`                 | Workflow `name` ≠ filename stem.                                                                                 |
| `E_PROTO_WF_STEP_SHAPE`           | Step node does not carry exactly one of `message`/`alt`/`opt`/`loop`.                                            |
| `E_PROTO_WF_ALIAS`                | `from`/`to`/`participants` names an alias the protocol does not declare.                                         |
| `E_PROTO_WF_EMPTY_BRANCH`         | A `steps` list (workflow, branch, `otherwise`, `opt`, `loop`) is empty.                                          |
| `E_PROTO_WF_DEPTH`                | Fragment nesting deeper than 3.                                                                                  |
| `E_PROTO_WF_FANOUT`               | List-valued `to` on a step whose `kind` is not `event`.                                                          |
| `E_PROTO_PAYLOAD_KIND`            | A `payload`/`request`/`response`/`message` ref resolves to a non-datamodel.                                      |
| `E_PROTO_STATES_ID`               | `states.json` `id` ≠ the protocol entity `name`.                                                                 |
| `E_PROTO_STATES_SUBSET`           | An XState construct outside the supported subset.                                                                |
| `E_PROTO_STATES_TARGET`           | Transition `target` is neither a sibling key nor a valid `#id.path`.                                             |
| `E_PROTO_STATES_EVENT_NAME`       | Event key does not match `^[A-Z][A-Z0-9_]*$`.                                                                    |
| `W_PROTO_TRANSPORT_HOST`          | An AsyncAPI server declares a literal `host` — a deployment fact this file does not hold.                        |
| `W_PROTO_SPEC_ASYNCAPI`           | A mini-spec transport on an AsyncAPI-capable wire links `spec.format: asyncapi` instead of adopting the dialect. |
| `W_PROTO_PARTICIPANT_UNLINKED`    | Component/product participant with no `exposes`/`uses` back-edge.                                                |
| `W_PROTO_PARTICIPANT_MISSING`     | Component/product `exposes`/`uses` this protocol but is not a participant.                                       |
| `W_PROTO_STYLE_MISMATCH`          | Step kinds contradict the declared `style`.                                                                      |
| `W_PROTO_WF_CHANNEL_UNKNOWN`      | `channel` matches no surface-list entry (mini-spec) and no channel address or channelId (AsyncAPI).              |
| `W_PROTO_WF_ORPHAN_RETURN`        | `return`/`error` with no preceding counterpart `call`.                                                           |
| `W_PROTO_STATES_EVENT_UNKNOWN`    | State event has no corresponding workflow message name.                                                          |
| `W_PROTO_STATES_UNREACHABLE`      | A state no transition can reach.                                                                                 |
| `W_PROTO_ARAZZO_UNGROUNDED`       | An `arazzo.yaml` names a source document, operation or channel this protocol's own artifacts do not carry.       |
| `W_PROTO_ARTIFACT_UNKNOWN`        | Unrecognised file in the protocol entity directory.                                                              |

Enforcement is partial, and the gap is registered rather than hidden. Fourteen
of the thirty-one classes above have an emitter — chiefly the workflow and
states parsers, which the portal runs while rendering a protocol page. The other
seventeen, including every `transport.yaml` rule in either dialect, every
participant rule, and the `arazzo.yaml` grounding rule, are specified ahead of
any reader and sit in the portal's debt register with no emitter
(`framework/portal/src/lib/catalog/diagnostic-coverage.test.ts`, whose ratchet
forces an entry out the moment a rule gains one). Write a protocol as though all
thirty-one were enforced: `metaframework check` will not tell you when one of
the seventeen is broken.
