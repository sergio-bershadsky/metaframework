# Protocols — participants, transport, workflows, states

> Distilled from `framework/spec/kinds/protocol.md` (version 8). **When
> `framework/spec/` is present in the repository, it is authoritative and wins
> over this file.** This bundled copy exists because an installed plugin cannot
> see the repo spec.
>
> Placement (the nearest-common-ancestor rule) is in `structure.md`; the
> `participants` / `style` / `conforms-to` field types are in `frontmatter.md`.
> This file carries what only `kinds/protocol.md` says: the three artifact
> mini-languages, the alias contract, and the `E_PROTO_*` codes.

A protocol says **who** talks, over **which wire**, in **what order**, and
through **which conversation states**. It is the richest kind in the ontology
and feeds the most derived views.

## Entity directory shape

```text
solutions/acme/product/shop/protocol/order-placement/
├── index.md                # REQUIRED  frontmatter + prose
├── transport.yaml          # OPTIONAL  wire binding — exactly one transport
├── openapi.yaml            # OPTIONAL  OpenAPI document — fixed name, bytes-only
├── arazzo.yaml             # OPTIONAL  Arazzo description — fixed name, unvalidated
├── states.json             # OPTIONAL  XState-subset conversation machine
└── workflows/              # OPTIONAL  asset dir — never an entity
    ├── place-order.yaml    # one workflow; name = filename stem
    └── cancel-order.yaml
```

- **All five artifacts are optional.** A protocol with only `index.md` is legal —
  an intent-level protocol under design. It simply derives no diagrams.
- Sibling filenames are **bare and fixed**: `transport.yaml`, `openapi.yaml`,
  `arazzo.yaml`, `states.json`. An `order-placement.transport.yaml` or a
  `protocol.yaml` is not recognised — `W_PROTO_ARTIFACT_UNKNOWN`. Nor is
  `arazzo.json`, which the Arazzo Specification recommends equally: a role's
  file may not vary its extension, so the YAML spelling is pinned. Extra `*.md`
  prose siblings are fine and carry no machine semantics; anything else
  unrecognised warns.
- `workflows/` is the only recognised asset subdirectory: one `*.yaml` per
  workflow, kebab-case, no nesting below it, no `index.md` at any depth.
- A file linked from `transport.yaml` `spec.file` (`pricing.proto`,
  `schema.graphql`) sits next to `index.md` and is recognised *by virtue of
  being linked*. It follows the external tool's naming convention, not the
  framework's bare-filename rule. `openapi.yaml` is deliberately not on that
  list: it is a fixed-name artifact, recognised link or no link, and
  `arazzo.yaml` is one too — it is never linked by `spec` at all, because it
  describes no wire. Nor is an AsyncAPI document — on the wires AsyncAPI covers
  it goes *inside* `transport.yaml`, as that file's second dialect (below).
- Every fixed-name artifact is **SRN-addressable** by a dot suffix on the
  entity (`srn.md` reference): `….transport`, `.states`, `.openapi`, `.arazzo`,
  and `.workflows.<name>` for `workflows/<name>.yaml`. A `spec.file` attachment
  is never addressable — only fixed names join the role table.
- **Artifacts carry no version of their own.** A top-level `version:` key in
  `transport.yaml` or a workflow file is a shape violation; the entity's
  frontmatter `version` is a snapshot of the whole directory.
- The **`x-` escape hatch** is what `kinds/protocol.md` states for
  `transport.yaml` and `workflows/*.yaml`, top level and inside entries.
  `states.json` is exempt by design: it is an XState machine configuration and
  an unknown key there is `E_PROTO_STATES_SUBSET`.

  ```yaml
  # transport.yaml
  kind: http
  x-gateway-route: shop-edge   # legal by the rule above
  gateway-route: shop-edge     # E_PROTO_TRANSPORT_SCHEMA by the rule above
  ```

  **In a workflow file, do not write `x-` at all — the rule is unimplemented
  there and the parser is strict.** `x-anything` at a workflow root, or inside a
  step or fragment, is `E_PROTO_WF_SCHEMA: Unrecognized key`
  (`framework/portal/src/lib/protocol/workflow.ts` builds every one of those
  schemas as a `z.strictObject` with no catchall). Measured 2026-08-21 against a
  scratch catalog; the spec rule stands and the implementation is what is behind
  it. Two further gaps sit in the same place: nothing validates `transport.yaml`
  at all, so **neither** line in the block above raises anything today, and
  `E_PROTO_TRANSPORT_SCHEMA` has no emitter. Where the hatch *is* implemented and
  can be relied on: entity frontmatter, and `journey.yaml` at both root and step.

- The **dialect header is framework-owned and admitted by name**, not through
  the `x-` hatch — so the bullet above never applies to it (see below).

## Artifact dialects

A role names a **file, never a format**, so each artifact says in its own bytes
which grammar it is written in. The contract is cross-kind and `structure.md`
states it once — every role's key, the warning class, the strip rule, the
`version` bump. What follows is the six rows that are this kind's — five
artifacts, and one of them with two dialects — and where each meets a rule stated
in this file. Writing `{meta}` for
`https://schemas.metaframework.dev/metaframework/product/specification/datamodel`:

| Artifact                | Dialect       | Key        | Value                           | Owned by                  |
|-------------------------|---------------|------------|---------------------------------|---------------------------|
| `transport.yaml`        | the mini-spec | `$schema`  | `{meta}/transport-document`     | the framework             |
| `transport.yaml`        | AsyncAPI      | `asyncapi` | `3.x`                           | AsyncAPI itself, natively |
| `states.json`           | XState subset | `$schema`  | `{meta}/state-machine-document` | the framework             |
| `workflows/<name>.yaml` | the mini-spec | `$schema`  | `{meta}/workflow-document`      | the framework             |
| `openapi.yaml`          | OpenAPI       | `openapi`  | `3.1.x`                         | OpenAPI itself, natively  |
| `arazzo.yaml`           | Arazzo        | `arazzo`   | `1.1.x`                         | Arazzo itself, natively   |

Five roles, six dialects — the transport role has two, and they are not a
migration window with an end: `http`, `grpc` and `in-process` transports have no
AsyncAPI form, so the mini-spec is permanent. The mini-spec row is listed first
and that order is load-bearing: it is what a headerless `transport.yaml` is told
to add.

Spelled out, at the root of each file — three framework headers and three
native keys:

```yaml
# transport.yaml — first line of the file, mini-spec dialect
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/transport-document
kind: http
```

```yaml
# transport.yaml — the other dialect; the format names itself
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

- The URL carries **no `@version`**: it names the grammar the file is written
  in, not a revision of the file. The entity's `version` is the only clock. It
  is the canonical schema URL of an ordinary meta-schema datamodel entity
  (`schemas.md`), compared as an identity and never fetched.
- The key is **framework-owned and admitted by name**, at the **artifact root
  only** — not through the `x-` hatch, which stays a hatch for *authors'* keys.
  A `$schema` on a workflow step names the grammar of nothing and is an ordinary
  unknown key (`E_PROTO_WF_SCHEMA`).
- The loader **reads it once and deletes it** from the parsed document, so every
  validator underneath stays strict and nothing is carved out of it. That applies
  only to the framework's `$schema`. A **native** discriminator — `openapi:`,
  `asyncapi:`, `arazzo:` — belongs to its own format and is never stripped: a
  document that arrived without its own version key would be the poorer
  document, and none of the three is the framework's to remove.
  That is a statement about ownership, not about what the portal reads — no
  transport document is parsed in either dialect today (below). Raw bytes are
  untouched in every case.
- No header, or a value **no row of this artifact's rows** recognises, is the
  **legacy dialect**: read as the format the spec defines today,
  `W_ARTIFACT_DIALECT` on the owning protocol, a warning that never breaks a
  catalog that loads. `asyncapi: 3.1.0` on a `transport.yaml` is recognised and
  raises nothing — a second dialect is not an unrecognised one.
- Adding a header bumps the entity's `version` by exactly 1, **per entity, not
  per file** — headers on `transport.yaml`, `states.json` and three workflow
  files in one commit is one bump. Rewriting a `transport.yaml` from one dialect
  into the other is an ordinary content change to one artifact and bumps once
  too; it buys no extra bump for being a large diff.
- Declaring **both** transport keys needs no rule of its own: the loader takes
  the first match, so `$schema` wins and the file is read as the mini-spec;
  `asyncapi:` is a foreign key so it is not stripped, and the mini-spec's field
  table then rejects it as an unknown top-level key
  (`E_PROTO_TRANSPORT_SCHEMA`).

Two fields sit near the header and are not discriminators. `transport.kind`
names the wire technology, which is *content*: the AsyncAPI dialect carries the
same fact as `servers.<id>.protocol`, and neither is a header. `spec.version` is
a display label on the transport card — never read as anybody's dialect, and free
to disagree with the document it links without a diagnostic.

## Participants and aliases

`participants` is a list of `{ alias, ref, role? }`, at least two entries
(`E_PROTO_PARTICIPANTS`):

| Field   | Type                          | Required | Rule                                                                             |
|---------|-------------------------------|----------|----------------------------------------------------------------------------------|
| `alias` | kebab-case string, ≤ 32 chars | yes      | The local name `workflows/*.yaml` uses; unique here (`E_PROTO_ALIAS_DUP`).       |
| `ref`   | SRN reference                 | yes      | MUST resolve to `component`, `product`, or `actor` (`E_PROTO_PARTICIPANT_KIND`). |
| `role`  | kebab-case string, ≤ 32 chars | no       | Display label (`initiator`, `publisher`, `broker`). No semantics.                |

```yaml
style: request-response
participants:
  - alias: customer
    ref: /actor/customer
    role: initiator
  - alias: checkout
    ref: /product/shop/component/checkout
    role: responder
```

```yaml
participants:
  - alias: Checkout                          # E_FM_SCHEMA — not kebab-case
    ref: /product/shop/component/checkout
  - alias: checkout                          # E_PROTO_ALIAS_DUP once lowercased
    ref: /product/shop/datamodel/order       # E_PROTO_PARTICIPANT_KIND — a
                                             # datamodel cannot participate
```

A participant carries **no title of its own**: the portal labels the lifeline
from the target entity's `title` and shows the alias as a subscript. Copying the
title here would drift.

### The component side owns the edge, the protocol side owns the alias

Components and products point at protocols with `exposes` (provider) and `uses`
(consumer); the protocol points back with `participants`. Both exist because
they carry different information:

| Concern                                                           | Authoritative source                        |
|-------------------------------------------------------------------|---------------------------------------------|
| Who is in the graph, and the direction of each edge               | `exposes` / `uses` on component/product     |
| The alias namespace inside `workflows/*.yaml` and lifeline labels | `participants` in the protocol              |
| NCA placement of the protocol directory (`structure.md`)          | `participants`, component/product refs only |

The portal builds the participant graph from `exposes`/`uses`; a participant
with no back-edge renders as an **undirected, dimmed node** rather than having
an edge invented for it. Both directions are cross-checked as *warnings*,
because during a swap one side legitimately moves first:

- `W_PROTO_PARTICIPANT_UNLINKED` — a component/product participant whose own
  `index.md` has neither `exposes` nor `uses` for this protocol.
- `W_PROTO_PARTICIPANT_MISSING` — a component/product that `exposes`/`uses` this
  protocol but is absent from `participants`.

**Actors are exempt from both.** An actor is not a catalogued implementation,
and requiring `uses` edges from every actor would be bookkeeping with no reader.
External systems outside the catalog (a PSP, a broker that is not a component)
participate **as actors** — `ref: /actor/psp-acquirer`; v1 has no external-system
kind. (But if anything must name it in a `uses`/`depends-on`/`exposes`/
`implements` edge, it has to be an `external` component instead — an actor is not
a legal target of those four. See `environments.md`.)

## `style` — three values on one axis

The axis is: **does the sender name the receiver, and does the protocol contract
a reply?** Applied in order, the rule is total and non-overlapping:

| Question                                            | Answer | `style`            |
|-----------------------------------------------------|--------|--------------------|
| Does the sender name the receiver?                  | no     | `bus`              |
| …and does the protocol contract a correlated reply? | yes    | `request-response` |
| …otherwise                                          | —      | `point-to-point`   |

- `bus` — published to a topic/exchange/subject; receivers found by
  subscription. Kafka topics, AMQP exchanges, webhook fan-out.
- `request-response` — named caller, named callee, a reply comes back. HTTP
  APIs, gRPC unary, in-process calls.
- `point-to-point` — directed, named receiver, no reply contract. One-way
  commands, streams, log shipping.

The value is deliberately **coarse**: it drives navigation, filtering and the
default diagram layout, and nothing else. Precision lives one level down, in
`transport.kind` and in each step's `kind`. Two cross-checks keep it from being
dead metadata, both warnings (`W_PROTO_STYLE_MISMATCH`) because a protocol may
be mid-migration: a `bus` protocol whose steps name a callee, and a
`request-response` protocol where no workflow ever answers.

`conforms-to` is a display-only list of `{ standard, version?, url? }` — for
*standards* (RFC 9457, CloudEvents), never for files. A spec document in the
directory is bound in `transport.yaml` under `spec`, in one place only.

A protocol SHOULD NOT list its payload datamodels under `relations.uses`: the
message × datamodel matrix is derived from the artifacts, and authoring the same
edges by hand is double bookkeeping. Reserve `uses` for non-payload
dependencies.

## `transport.yaml` — the wire binding

**One protocol, one transport.** A protocol offered over two wire technologies
is two protocol entities. A second binding block is `E_PROTO_TRANSPORT_BINDING`,
not a shortcut.

**Two dialects, and the wire picks.** Which grammar a file may use is decided by
`kind`, not by preference:

| `kind`                       | Dialect                   | Because                                                         |
|------------------------------|---------------------------|-----------------------------------------------------------------|
| `kafka`, `websocket`, `amqp` | mini-spec **or** AsyncAPI | AsyncAPI is the industry description of these surfaces.         |
| `http`                       | mini-spec only            | OpenAPI owns this wire and already has a role: `openapi.yaml`.  |
| `grpc`                       | mini-spec only            | AsyncAPI publishes no gRPC binding and no protocol spelling.    |
| `in-process`                 | mini-spec only            | A Server Object REQUIRES a `host`; an in-process call has none. |

The rest of this section is the mini-spec dialect; the AsyncAPI dialect follows
it. Never mix them — there is no `spec:`, no surface list and no `kind` in the
AsyncAPI form. Diagnostics split the same way: `E_PROTO_TRANSPORT_SCHEMA`,
`E_PROTO_TRANSPORT_BINDING` and `E_PROTO_TRANSPORT_SPEC_CONFLICT` are
mini-spec-only, `E_PROTO_TRANSPORT_ASYNCAPI` is the other dialect's one class,
and `E_PROTO_PAYLOAD_KIND` / `E_PROTO_SPEC_FILE` apply to both.

| Field      | Type                                                           | Required | Rule                                                                 |
|------------|----------------------------------------------------------------|----------|----------------------------------------------------------------------|
| `kind`     | `http \| grpc \| amqp \| kafka \| websocket \| in-process`     | yes      | Closed set; selects the binding block.                               |
| `<kind>`   | mapping                                                        | yes      | Keyed by **exactly** the `kind` value (`E_PROTO_TRANSPORT_BINDING`). |
| `summary`  | string, one line, ≤ 200 chars                                  | no       | Rendered above the transport card.                                   |
| `encoding` | `json \| avro \| protobuf \| msgpack \| xml \| text \| binary` | no       | Wire encoding of payloads.                                           |
| `auth`     | list of kebab-case strings                                     | no       | Display-only labels (`oauth2-bearer`, `mtls`, `sasl-scram`).         |
| `spec`     | `{ format, file, version? }`                                   | no       | Link to an external spec file in the entity directory.               |

Any other non-`x-` top-level key, or a type violation, is
`E_PROTO_TRANSPORT_SCHEMA`. **`$schema` is not "any other key"** — it is the
dialect header, which carries no row above because it is not a transport field,
and it is gone from the parsed document before this rule is applied. A key that
merely resembles it is an ordinary stranger:

```yaml
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/transport-document
kind: kafka
schema: transport-document   # E_PROTO_TRANSPORT_SCHEMA — an unknown key that
                             # merely resembles the header
```

### Binding blocks and surface lists

Each block may carry one optional **surface list** — its enumeration of what the
transport offers:

| `kind`       | Required binding fields                                                             | Optional                 | Surface list |
|--------------|-------------------------------------------------------------------------------------|--------------------------|--------------|
| `http`       | `base-path` (starts with `/`)                                                       | `tls` (default true)     | `operations` |
| `grpc`       | `package` (dotted), `service`                                                       | `tls` (default true)     | `methods`    |
| `amqp`       | `exchange` (may be empty), `exchange-type` (`direct \| topic \| fanout \| headers`) | `durable` (default true) | `bindings`   |
| `kafka`      | — (`topics` is required **unless** `spec` is present)                               | `cluster`                | `topics`     |
| `websocket`  | `path` (starts with `/`)                                                            | `subprotocol`, `tls`     | `channels`   |
| `in-process` | `language`, `module`                                                                | `interface`              | `functions`  |

Surface entry shapes:

| List         | Entry fields                                                                                                                                         |
|--------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| `operations` | `name` (kebab), `method` (`GET \| POST \| PUT \| PATCH \| DELETE \| HEAD \| OPTIONS`), `path` (may hold `{param}`), `request`, `response`, `summary` |
| `methods`    | `name`, `request`, `response`, `streaming` (`none \| client \| server \| bidi`, default `none`), `summary`                                           |
| `bindings`   | `routing-key` (may hold `*` / `#`), `queue`, `message`, `summary`                                                                                    |
| `topics`     | `name` (Kafka naming, not kebab-constrained), `key`, `message`, `partitions` (≥ 1), `retention`, `summary`                                           |
| `channels`   | `name` (kebab), `direction` (`client-to-server \| server-to-client \| bidi`), `message`, `summary`                                                   |
| `functions`  | `name`, `request`, `response`, `summary`                                                                                                             |

`request`, `response` and `message` are payload SRNs (see below), and each is
optional — a surface entry whose model is still under design legitimately has
none.

### `spec` XOR the surface list

| Field     | Type                                                        | Required | Rule                                                                       |
|-----------|-------------------------------------------------------------|----------|----------------------------------------------------------------------------|
| `format`  | `openapi \| asyncapi \| protobuf \| graphql \| json-schema` | yes      | Closed set.                                                                |
| `file`    | path relative to the entity directory                       | yes      | MUST exist; MUST NOT start with `/` or contain `..` (`E_PROTO_SPEC_FILE`). |
| `version` | string                                                      | no       | `3.1.0`, `proto3`.                                                         |

**`spec` and the surface list are mutually exclusive**
(`E_PROTO_TRANSPORT_SPEC_CONFLICT`). Either the real spec file is the single
source of operation truth, or — when no such file exists — the lightweight list
here is. Maintaining both guarantees divergence.

```yaml
kind: http
summary: JSON over HTTPS, served by checkout at the storefront edge.
encoding: json
auth: [oauth2-bearer]
spec:
  format: openapi
  version: "3.1.0"
  file: openapi.yaml           # sibling of index.md
http:
  base-path: /api/v1/orders
  tls: true
  operations:                  # E_PROTO_TRANSPORT_SPEC_CONFLICT — delete one side
    - { name: create-order, method: POST, path: / }
```

```yaml
spec:
  format: openapi
  file: ../shared/openapi.yaml  # E_PROTO_SPEC_FILE — escapes the entity directory
```

```yaml
kind: kafka
spec:
  format: asyncapi              # W_PROTO_SPEC_ASYNCAPI — on kafka/websocket/amqp
  file: asyncapi.yaml           # an AsyncAPI document belongs *in* transport.yaml,
                                # not beside it. Legal and unwarned on http/grpc/
                                # in-process, which have no AsyncAPI dialect.
```

In v1 the portal treats a linked spec as an **opaque attachment**: a card with
format, version and a raw link. Parsing a linked OpenAPI file to derive operation
tables is deferred — which is also why the `channel` check below is skipped when
a protocol links a spec instead of listing a surface. The AsyncAPI *dialect* is
no exception: it is specified in full below and read by nothing yet.

```yaml
# the smallest useful transport — the dialect header is part of it
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/transport-document
kind: in-process
in-process:
  language: typescript
  module: "@acme/checkout-core/tax"
  interface: TaxCalculator
  functions:
    - name: quote
      request: /product/shop/component/checkout/datamodel/cart@1
      response: /datamodel/money@1
```

### The AsyncAPI dialect

A `kafka`, `websocket` or `amqp` transport MAY instead be a full **AsyncAPI
3.1.0 document under the same filename**. The filename does not move, the role
does not fork, and `srn://acme/protocol/settlement.transport` keeps resolving.
Recognition is the whole `3.x` line — AsyncAPI promises minor-version forward
compatibility and says tooling ignores the patch — while a headerless file is
still told to declare the mini-spec, the dialect every wire can use.

**Six profile rules on top of AsyncAPI.** Any violation is
`E_PROTO_TRANSPORT_ASYNCAPI`:

| #   | Rule                                                                                               |
|-----|----------------------------------------------------------------------------------------------------|
| 1   | `x-srn` at the root = the owning entity's absolute SRN (the same key every `schema.json` carries). |
| 2   | `info.title` = the entity's frontmatter `title`.                                                   |
| 3   | `info.version` = the literal string `unversioned` — the frontmatter is the only clock.             |
| 4   | `servers` has **exactly one** entry, and its `protocol` is admitted for this wire.                 |
| 5   | `channels` present and non-empty.                                                                  |
| 6   | `operations` OPTIONAL; when present, `id` = one of the protocol's `participants[].ref`, absolute.  |

Rule 4's admitted values are AsyncAPI's own spellings, and TLS changes the
`protocol` string but **not** the bindings key — a `wss` server binds under `ws`:

| `kind`      | `protocol` (plain / TLS) | `bindings` key |
|-------------|--------------------------|----------------|
| `kafka`     | `kafka` / `kafka-secure` | `kafka`        |
| `websocket` | `ws` / `wss`             | `ws`           |
| `amqp`      | `amqp` / `amqps`         | `amqp`         |

`servers.<id>.host` is REQUIRED by AsyncAPI and is a deployment fact this file
does not hold. Write it as a bare variable with a description and **no
`default`**; a literal is `W_PROTO_TRANSPORT_HOST` (a warning — a fixed
third-party endpoint is legitimate).

Rule 6 is why `operations` is optional: `action` is `send`/`receive` relative to
*one application*, and a protocol is a conversation between several — so `id`
names whose side the document is written from. A kafka surface list records no
direction, so a migrated kafka file carries **no operations at all** and invents
nothing. A websocket one does, and converts mechanically:
`client-to-server` → `receive`, `server-to-client` → `send`, `bidi` → two
operations on one channel.

**Field for field, from the mini-spec:**

| Mini-spec                                | AsyncAPI                                                     |
|------------------------------------------|--------------------------------------------------------------|
| `kind`                                   | `servers.<id>.protocol` (table above)                        |
| `summary`                                | `info.description` — the Info Object has no `summary`        |
| `encoding`                               | `defaultContentType` (table below)                           |
| `auth`                                   | `x-srn-auth` on the Server Object                            |
| `spec`                                   | **dissolves** — the document *is* the spec                   |
| `kafka.cluster`                          | the **server id**                                            |
| `kafka.topics[].name`                    | `channels.<id>.address`                                      |
| `kafka.topics[].partitions`              | kafka channel binding `partitions`                           |
| `kafka.topics[].retention`               | kafka channel binding `topicConfiguration.retention.ms`      |
| `kafka.topics[].key`                     | `x-srn-partition-key` on the Message Object                  |
| `*.message` / `*.request` / `*.response` | `x-srn-payload` on the Message Object                        |
| `websocket.path`                         | `servers.<id>.pathname`                                      |
| `<kind>.tls`                             | the `protocol` string                                        |
| `websocket.channels[].name`              | `channels.<id>` — the channelId, kept verbatim               |
| `websocket.channels[]`                   | **N** channels, one per entry — see below                    |
| *(no mini-spec field)*                   | `channels.<id>.address` — the wire name; see below           |
| `amqp.exchange` / `-type` / `durable`    | amqp channel binding `exchange.{name,type,durable}`          |

Two rows change shape, not just place. `retention: 30d` becomes
`retention.ms: 2592000000` — exact, and the human unit does not survive the trip.

And **N `websocket.channels[]` entries become N AsyncAPI channels, not N messages
on one.** Each entry keeps its `name` as the channelId and MUST carry an
`address` — the wire event, frame type or subprotocol message name it rides. The
mini-spec has no field holding that, so take it from what the protocol already
documents about the wire; where the wire names nothing, the entry name serves. An
absent `address` reads as "unknown" in AsyncAPI, which is the one thing these are
not. Two entries may share an `address` when the mini-spec split them by
`direction` — they stay two channels, because `direction` became `action` and an
operation names exactly one channel.

The reason is W9: a step's `channel:` matches a channel `address` or channelId,
and every step naming a websocket channel names a mini-spec entry name. Collapse
N into one and N−1 of those references resolve to nothing, on a rewrite that lost
no information. AsyncAPI's ws binding note ("the channel represents the
connection") describes raw WebSockets and is not a cardinality constraint — the
connection is stated once, in `servers.<id>.pathname`. The catalog has exactly one
`websocket` transport, `solutions/brass/protocol/game-transport/transport.yaml`:
five entries, five channels, three distinct `address` values, 15 workflow
`channel:` references over 5 names, all resolving. Read its inline comments
before you write your own.

| `encoding` | `defaultContentType`              |
|------------|-----------------------------------|
| `json`     | `application/json`                |
| `xml`      | `application/xml`                 |
| `text`     | `text/plain`                      |
| `binary`   | `application/octet-stream`        |
| `msgpack`  | `application/vnd.msgpack`         |
| `avro`     | `application/vnd.apache.avro`     |
| `protobuf` | `application/vnd.google.protobuf` |

**Four `x-srn-` keys, and no more.** The prefix is ours because the OpenAPI
Initiative reserves `x-oai-`, `x-oas-` and `x-arazzo`, and this directory can
hold all three formats:

| Key                   | Object                                        | Carries                                                  |
| --------------------- | --------------------------------------------- | -------------------------------------------------------- |
| `x-srn`               | root                                          | the owning entity's SRN — profile rule 1, not a new key  |
| `x-srn-payload`       | Message                                       | the **pinned** SRN of the datamodel this message carries |
| `x-srn-auth`          | Server                                        | the `auth` labels, verbatim, display-only                |
| `x-srn-partition-key` | Message — or Channel, if it has no `messages` | the payload field the topic partitions by                |

`x-srn-payload` exists because `payload.$ref` at a catalog schema URL **loses
the pin** — a schema URL addresses the current schema, so `order@3` silently
becomes `order@4`. It is a payload ref like any other: resolves to a
`datamodel`, never an artifact SRN, SHOULD pin `@version`.

`x-srn-auth` exists so the framework **never fabricates a security fact**:
`mtls` is exactly `type: X509`, but `sasl-scram` does not say `scramSha256` or
`scramSha512`, and `seat-credentials` is not an AsyncAPI type at all. Real
`components.securitySchemes` are permitted and encouraged — and never derived.

`x-srn-partition-key` exists because AsyncAPI's kafka `key` is a Schema Object
describing the key's *shape*; `key: order-id` names a *field*. It belongs on the
**Message**, mirroring where AsyncAPI's own `key` sits — **and on the Channel
when, and only when, that channel declares no `messages` map.** There is no third
placement, and a channel that does declare `messages` must put the key on one, so
the two forms never both apply. The exception exists because both alternatives
lie: dropping the key loses a fact the mini-spec stated, and minting an empty
Message Object to hang it on invents a payload the source withheld. Counted on
disk 2026-08-21: **9** keys across the catalog, **8** on a Message and **1** on a
Channel — `reconciliation-report` in
`solutions/acme/protocol/settlement/transport.yaml`, whose payload model is still
under design. Read that file's comment before you copy the pattern.

**The dialect is specified to be parsed rather than served as bytes** — unlike
`openapi.yaml`, this role feeds the transport card, the message × datamodel
matrix and workflow rule W9. In this dialect a step's `channel` matches a channel
`address` or channelId, and W9 will stop being skipped. Everything outside the
profile rides in the raw bytes and derives nothing.

That reader **does not exist yet.** The portal *detects* the dialect —
`lib/catalog/dialects.ts` carries the `asyncapi:` row, the document loads and
records `dialect.key: 'asyncapi'` — and reads no transport document in either
dialect; `E_PROTO_TRANSPORT_ASYNCAPI`, `W_PROTO_TRANSPORT_HOST` and
`W_PROTO_WF_CHANNEL_UNKNOWN` sit in the portal's debt register with no emitter.
Write the file as if every rule here were enforced, because none of them is:
nothing will tell you when you get it wrong.

<!-- verbatim-excerpt: solutions/acme/protocol/settlement/transport.yaml -->
```yaml
# solutions/acme/protocol/settlement/transport.yaml — verbatim through the first channel
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

# … two more channels follow, and no `operations:` block at all — the mini-spec
# form recorded no direction, so none is invented. The whole file is reproduced
# in skills/protocol-design/references/worked-protocol.md.
```

**Rewriting between dialects is not a swap**, provided the surface survives:
the wire, the addresses and the pinned payloads are the contract surface; the
grammar stating them is not. Same addresses, same payloads → one ordinary
`version` bump. A topic that quietly disappears in the rewrite is a removal, and
needs a swap like any other.

## `workflows/<name>.yaml` — the workflow mini-language

One named, ordered exchange per file, `<name>` kebab-case. Designed to be as
legible to an AI reading raw YAML as to a renderer: flat message steps by
default, three named fragment forms, nothing else.

| Field          | Type                          | Required | Rule                                                                             |
|----------------|-------------------------------|----------|----------------------------------------------------------------------------------|
| `name`         | kebab-case string             | yes      | MUST equal the filename stem (`E_PROTO_WF_NAME`).                                |
| `title`        | string, ≤ 80 chars            | yes      | Diagram heading.                                                                 |
| `summary`      | string, one line, ≤ 200 chars | no       | Shown in the protocol page's workflow list.                                      |
| `participants` | list of aliases               | no       | Lifeline order; MUST be a subset of the protocol's aliases (`E_PROTO_WF_ALIAS`). |
| `steps`        | list of step nodes            | yes      | At least one (`E_PROTO_WF_EMPTY_BRANCH`).                                        |

`participants` is a **layout hint, never a restriction**: omit it and lifelines
order by first appearance; list a subset and unlisted aliases are appended.

`$schema` carries no row above and violates none of it: it is the dialect header,
and it binds to the **file root only**. A step is not an artifact root, so a
`$schema` inside one names the grammar of nothing and is an ordinary unknown key:

```yaml
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/workflow-document
name: place-order                # ✓ the header, at the file root
title: Place an order
steps:
  - message: submit-order
    from: customer
    to: checkout
    $schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/workflow-document
                                 # E_PROTO_WF_SCHEMA — a step is not an artifact
                                 # root; this names the grammar of nothing
```

### Step nodes

A step node carries **exactly one discriminator key** from `message`, `alt`,
`opt`, `loop` (`E_PROTO_WF_STEP_SHAPE`). `otherwise` is the one permitted
companion key, and only alongside `alt`.

```yaml
- message: submit-order        # ✓ one discriminator
  from: customer
  to: checkout

- message: submit-order        # E_PROTO_WF_STEP_SHAPE — two discriminators
  loop: { while: retrying, steps: [...] }

- from: customer               # E_PROTO_WF_STEP_SHAPE — no discriminator
  to: checkout
```

**Message step:**

| Field       | Type                                           | Required | Rule                                                                           |
|-------------|------------------------------------------------|----------|--------------------------------------------------------------------------------|
| `message`   | kebab-case string, ≤ 64 chars                  | yes      | Logical message name — the arrow label, **not** an SRN.                        |
| `from`      | participant alias                              | yes      | Declared in the protocol (`E_PROTO_WF_ALIAS`).                                 |
| `to`        | alias, or a list of aliases when `kind: event` | yes      | A list on a non-`event` step is `E_PROTO_WF_FANOUT`.                           |
| `kind`      | `call \| return \| event \| error`             | no       | Default `call`.                                                                |
| `payload`   | SRN reference                                  | no       | MUST resolve to a `datamodel` (`E_PROTO_PAYLOAD_KIND`); SHOULD pin `@version`. |
| `channel`   | string                                         | no       | Topic / queue / routing-key / path this message travels on.                    |
| `condition` | string, ≤ 120 chars                            | no       | Display-only guard label. Creates **no** branch.                               |
| `note`      | string, ≤ 200 chars                            | no       | Rendered as a UML note anchored to the step.                                   |

`from` and `to` MAY be the same alias — a self-call, rendered as the usual
looping arrow.

### The `condition` trap

`condition` annotates **one arrow** with a guard for the reader; it never changes
the step sequence. If two futures diverge, use `alt`. If a step may be skipped,
use `opt`.

```yaml
- message: charge-card
  from: checkout
  to: payment
  condition: cart total > 0    # renders "[cart total > 0] charge-card";
                               # the next step still follows unconditionally
```

### Fragments

- `alt` — a list of `{ when, steps }` branches, plus optional `otherwise` (a
  list of step nodes, the `[else]` compartment). An `alt` MUST have at least
  **two compartments**, counting `otherwise` as one (`E_PROTO_WF_SCHEMA`). A
  single branch with no `otherwise` is an `opt` — and the two mean different
  things: `opt` says the steps may be skipped, `alt` says exactly one
  compartment runs.
- `opt` — `{ when, steps }`.
- `loop` — `{ while, max?, steps }`. `while` and `when` are labels ≤ 120 chars;
  `max` is an integer ≥ 1 and renders as `loop [≤ max]`.

```yaml
- alt:
    - when: stock reserved
      steps:
        - { message: authorize-payment, from: checkout, to: payment }
    - when: partially reserved
      steps:
        - { message: propose-split-shipment, from: checkout, to: customer }
  otherwise:
    - message: out-of-stock
      from: checkout
      to: customer
      kind: error
      payload: /datamodel/problem@1

- loop:
    while: inventory answers RETRY
    max: 3
    steps:
      - { message: reserve-stock, from: checkout, to: inventory }
```

### Nesting, depth, and step identity

A fragment directly under the root `steps` is **depth 1**; one inside its branch
is depth 2. **Maximum depth is 3** (`E_PROTO_WF_DEPTH`) — beyond that a sequence
diagram stops being readable, and the exchange should be split into a second
workflow or moved into `states.json`. Every `steps` list — the workflow's own,
each branch's, `otherwise`'s, `opt`'s, `loop`'s — must be non-empty
(`E_PROTO_WF_EMPTY_BRANCH`).

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

**Steps have no ids.** The portal's stable key is the step's **positional path**
— `steps[4].alt[0].steps[2]` — which makes repeated message names (retries,
polling) unambiguous with no authoring overhead. Reordering steps therefore
changes their keys; that is accepted, because ordering is the workflow's whole
content.

### Rendering, and what is deliberately absent

| `kind`   | Arrow                                      | UML meaning         |
|----------|--------------------------------------------|---------------------|
| `call`   | solid line, filled arrowhead               | synchronous message |
| `return` | dashed line, open arrowhead                | reply message       |
| `event`  | solid line, open arrowhead                 | asynchronous signal |
| `error`  | dashed line, open arrowhead, error styling | failure reply       |

No `par` fragments, gateways, pools/swimlanes, timers, compensation,
sub-workflow invocation, or data objects — each turns a sequence description
into BPMN. Where one is genuinely needed: split into several workflows, or model
the ordering constraint in `states.json`.

### Workflow validation

| #   | Rule                                                                                                                                         | Class                                     |
|-----|----------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------|
| W1  | Parses and matches the field tables — unknown non-`x-` key (the `$schema` header aside), bad type.                                           | `E_PROTO_WF_SCHEMA`                       |
| W2  | `name` equals the filename stem.                                                                                                             | `E_PROTO_WF_NAME`                         |
| W3  | Exactly one discriminator key per step node.                                                                                                 | `E_PROTO_WF_STEP_SHAPE`                   |
| W4  | Every `from`/`to`/`participants` alias is declared in the protocol.                                                                          | `E_PROTO_WF_ALIAS`                        |
| W5  | Every `steps` list is non-empty.                                                                                                             | `E_PROTO_WF_EMPTY_BRANCH`                 |
| W6  | Fragment nesting depth ≤ 3.                                                                                                                  | `E_PROTO_WF_DEPTH`                        |
| W7  | List-valued `to` only on `kind: event`.                                                                                                      | `E_PROTO_WF_FANOUT`                       |
| W8  | `payload` resolves to a `datamodel`.                                                                                                         | `E_SRN_DANGLING` / `E_PROTO_PAYLOAD_KIND` |
| W9  | `channel` matches a surface-list `name`/`queue`/`routing-key`/`path`, or — in the AsyncAPI dialect — a channel's `address` or its channelId. | `W_PROTO_WF_CHANNEL_UNKNOWN`              |
| W10 | A `return`/`error` is preceded, in the same or an enclosing fragment, by a `call` in the opposite direction.                                 | `W_PROTO_WF_ORPHAN_RETURN`                |

W9 reads whichever dialect `transport.yaml` is in. In the mini-spec it matches
the surface list; in the AsyncAPI dialect it matches a channel's `address` **or**
its channelId, either one, because both are names an author legitimately writes —
in settlement's file `acme.settlement.order-paid.v1` and `order-paid` name the
same channel.

It is skipped entirely only when there is nothing to match against:
`transport.yaml` absent, or a mini-spec one that links a `spec` instead of
listing a surface — a linked OpenAPI file is not parsed in v1, and the absence of
a check is not a warning. The AsyncAPI dialect is never in that position, because
profile rule 5 requires a non-empty `channels`.

## `arazzo.yaml` — the orchestration surface

An **Arazzo Description** (the OpenAPI Initiative's format for a deterministic
sequence of API calls), under that fixed bare name, OPTIONAL, addressable as
`.arazzo`, **unvalidated**: snapshotted, served as authored, and judged by
nothing — `protocol.md` states no field table for it, so no rule can be broken in
one. Dialect key `arazzo: 1.1.0`.

Unvalidated is not unread: the portal draws a step graph of each workflow, which
asserts nothing about the grammar. A renderer that meets a field it does not know
draws less; a validator would have to call the document wrong, and there is no
published JSON Schema for Arazzo 1.1 to be right against.

**It is a sibling of `workflows/`, not a dialect of it.** The mini-spec above
stays the authoritative choreography source; sequence diagrams derive from
`workflows/*.yaml` and from nothing else. A protocol carrying both deprecates
neither and warns on neither. They describe different things: the mini-spec has
N participants with `from`/`to`, actor and `in-process` participants, self-calls,
event fan-out, paired `call`/`return` arrows and `alt`/`opt`/`loop` fragments —
none of which has an Arazzo carrier outside `x-` extensions. Arazzo has one
executor chaining operations. Writing choreography as Arazzo rebuilds the
mini-spec inside a goto-graph, and the step graph it would draw is a worse
picture of a multi-party exchange than the sequence diagram it cost.

**It MUST be grounded in this entity's own artifacts.**

- `sourceDescriptions[].url` MUST be a relative URI-reference to a sibling
  artifact — `./openapi.yaml` or `./transport.yaml`. Arazzo permits an absolute
  URL; this framework does not: a catalog is described offline, and a URL
  pointing outside the entity is a claim nothing here can check.
- Every operation, channel or workflow a step names MUST resolve into a document
  `sourceDescriptions` names, or into a workflow of the same file.

Both are `W_PROTO_ARAZZO_UNGROUNDED`. So the artifact only makes sense where a
grounding document exists: an `openapi.yaml`, or a `transport.yaml` in the
AsyncAPI dialect. `sourceDescriptions[].type` is closed to `openapi`, `asyncapi`
and `arazzo`, so `grpc` and `in-process` protocols can never carry one — do not
write the file there, and do not write it for an `http` protocol that has no
`openapi.yaml` yet.

```yaml
# arazzo.yaml — the two lines the framework reads, and the rule it adds
arazzo: 1.1.0
sourceDescriptions:
  - name: orders
    type: openapi
    url: ./openapi.yaml               # a sibling artifact — always relative
```

Everything else in the file is Arazzo's own; the framework adds no key to it and
validates none of it.

**The rest of the ruling, in four lines.** Scope is the *initiator-facing*
surface only — never a second description of the wire or of the choreography.
`arazzo.json` is **not** recognised (`W_PROTO_ARTIFACT_UNKNOWN`), though the
Specification recommends both spellings, because a role's file may not vary its
extension. Write **one self-contained document**: there is no asset subdirectory
for the non-entry parts of a split Arazzo Description, and such a file would be
unaddressable. Should the framework ever need a key inside the file it will be
`x-srn` / `x-srn-*` — never `x-arazzo`, `x-oai-*` or `x-oas-*`, which the OAI
reserves.

## `states.json` — the XState subset

An **XState v5 machine configuration**, directly loadable by `createMachine()` —
that is the point of pinning a subset rather than inventing a format. It
describes the state of **one conversation as the protocol sees it**, never the
internal state of a participant (that belongs to the implementing component).
Exactly one machine per protocol.

The one key that is not XState's is the `$schema` dialect header, and it is why
"directly loadable" stays literally true: the loader strips it before anything
downstream sees the machine, so what `createMachine()` receives is the file minus
exactly one framework key, and `E_PROTO_STATES_SUBSET` stays strict with nothing
carved out of it.

Root: `id` (MUST equal the protocol entity `name` — `E_PROTO_STATES_ID`),
`initial` (a key of `states`), `states`, optional `description`.

State node:

| Key            | Type                       | Required                    | Notes                                                  |
|----------------|----------------------------|-----------------------------|--------------------------------------------------------|
| `states`       | object                     | no                          | Makes the node compound; nesting allowed.              |
| `initial`      | string                     | yes iff `states` is present | A key of this node's `states`.                         |
| `type`         | `"final"`                  | no                          | The only legal value; a final state MUST have no `on`. |
| `on`           | object, event → transition | no                          | See below.                                             |
| `entry`/`exit` | string or list of strings  | no                          | Action names, plain strings.                           |
| `tags`         | list of kebab-case strings | no                          | Free facets; the portal may colour by tag.             |
| `description`  | string                     | no                          | Rendered inside the state box.                         |

A transition value is a target string, a transition object, or an **array** of
transition objects evaluated top to bottom — first matching guard wins, an
unguarded entry is the fallback. The object is `{ target?, guard?, actions?,
description? }`, all plain strings or lists of strings; omitting `target` means
an internal self-transition (actions only, no move).

**Target resolution supports exactly two forms** (`E_PROTO_STATES_TARGET`): a
**sibling state key** (`"reserved"`) and an **absolute id path**
(`"#order-placement.rejected"`). Relative descent (`"reserved.settled"`) is not
supported — it is the form that most often silently resolves to the wrong node.

**Event names** MUST match `^[A-Z][A-Z0-9_]*$` (`E_PROTO_STATES_EVENT_NAME`).

```json
{
  "$schema": "https://schemas.metaframework.dev/metaframework/product/specification/datamodel/state-machine-document",
  "id": "order-placement",
  "initial": "submitted",
  "states": {
    "submitted": {
      "on": {
        "STOCK_RESERVATION_RESULT": [
          { "target": "reserved", "guard": "reservation granted in full" },
          { "target": "rejected", "actions": ["emit-problem"] }
        ]
      }
    },
    "reserved": {
      "on": { "PAYMENT_DECLINED": { "target": "rejected", "actions": ["release-stock"] } }
    },
    "rejected": { "type": "final", "tags": ["failure"] }
  }
}
```

### Outside the subset — all `E_PROTO_STATES_SUBSET`

`context`, `assign`, `always`, `after`, `invoke`, `input`, `output`, `meta`,
`type: "parallel"`, `type: "history"`, wildcard events (`"*"`), and object-form
actions or guards.

```json
{ "context": { "attempts": 0 } }                             /* E_PROTO_STATES_SUBSET */
{ "states": { "paid": { "after": { "5000": "expired" } } } } /* E_PROTO_STATES_SUBSET */
{ "on": { "payment_ok": "confirmed" } }                      /* E_PROTO_STATES_EVENT_NAME */
```

The rationale is the framework's, not XState's: **the catalog documents
contracts, not runtime behaviour** — anything carrying data or executing is out.
Data shapes belong to datamodels; timers and invocations belong to the
implementing component.

### Correspondence with workflow messages

An event name maps to a message name by lowercasing and turning `_` into `-`:

```text
STOCK_RESERVATION_RESULT   ⇔   stock-reservation-result
PAYMENT_DECLINED           ⇔   payment-declined
```

An event matching no message in any of this protocol's workflows is
`W_PROTO_STATES_EVENT_UNKNOWN`. The reverse is **not** checked — plenty of
messages carry no state change. A state no transition can reach is
`W_PROTO_STATES_UNREACHABLE`.

`states.json` carries **no SRN references at all**: it names events and states
only. Payload shapes attach to the messages that carry those events.

## Payload binding to datamodels

Every payload reference — a step's `payload`, and a surface entry's `request`,
`response` or `message` — is an ordinary SRN (`srn.md`) that MUST resolve to an
entity of kind `datamodel` (`E_PROTO_PAYLOAD_KIND`), and SHOULD pin a version.
An unpinned reference silently follows the datamodel's latest version, so a
contract reviewed against `order@2` starts describing `order@3` with no diff on
this file.

> **`message` means two different things, in two different files.** In
> `workflows/*.yaml` a step's `message` is a kebab-case **logical name** (the
> arrow label) and the SRN lives in the separate `payload` key. In
> `transport.yaml` a surface entry's `message` **is** the SRN of the datamodel
> the topic or queue carries — the role `request`/`response` play for
> call-shaped transports. A step `message` that looks like an SRN is
> `E_PROTO_WF_SCHEMA`; a topic `message` that is a bare name is
> `E_PROTO_TRANSPORT_SCHEMA`.

```yaml
# workflows/place-order.yaml
- message: order-placed                              # a name
  payload: /product/shop/datamodel/order-placed@2    # the SRN

# transport.yaml
topics:
  - name: acme.shop.order.placed.v1
    message: /product/shop/datamodel/order-placed@2  # the SRN
```

A payload is an **SRN**, while the datamodel's own `schema.json` uses canonical
schema **URLs** in its `$ref`s (`schemas.md`). These are two spellings of one
identity, not two addressing schemes: `/product/shop/datamodel/order-placed`
here is `https://schemas.metaframework.dev/acme/product/shop/datamodel/order-placed`
there, one prefix apart. Neither is a fallback for the other, because they are
read by different consumers: `schema.json` is governed by an interoperability
standard and must stay resolvable by stock JSON Schema tooling, whereas a payload
reference is a catalog reference in a framework-private YAML file no external
tool reads. That is also why pinning works here and not there — the SRN carries
`@version`, and the projection to a schema URL is exactly what drops it, because
a schema URL addresses the current schema.

### Write payloads path-absolute

Relative references resolve against **the referring file's own URI**, so the
depth differs between a sibling artifact and a file under `workflows/`. For
`srn://acme/product/shop/protocol/order-placement`, the same text
`../../datamodel/order@1` means:

| Referring file               | Resolves to                                                  |
|------------------------------|--------------------------------------------------------------|
| `index.md`                   | `srn://acme/product/shop/datamodel/order@1`                  |
| `transport.yaml`             | `srn://acme/product/shop/datamodel/order@1`                  |
| `workflows/place-order.yaml` | five segments — odd, so `E_SRN_SYNTAX` ✗ (needs `../../../`) |

Bucketing changed the failure profile of a miscount, and it is worth knowing
which half you are in:

- **Off by one** (any odd number) is always caught: the segment count goes odd
  and no odd path parses.
- **Off by two** stays grammatical and fails later, or not at all — it resolves
  to a legal SRN that is simply the wrong entity, surfacing as `E_SRN_DANGLING`
  if nothing is there and as a silently wrong edge if something is.

```yaml
payload: /product/shop/datamodel/order-request@1              # recommended
payload: ../../../datamodel/order-request@1                   # legal here, easy to miscount
payload: srn://acme/product/shop/datamodel/order-request@1    # legal, verbose
```

Path-absolute refs read identically wherever the file sits, survive the protocol
being re-placed by an NCA change, and remove the only case the grammar cannot
catch for you.

## Evolution

The contract surface is **the operations, messages, and states**
(`evolution.md`). Which file holds each part:

| Element                                                                                                    | Contract surface? | Consequence                                                    |
|------------------------------------------------------------------------------------------------------------|-------------------|----------------------------------------------------------------|
| A `participants` entry                                                                                     | yes               | Removing one requires a swap.                                  |
| A surface entry and its `request`/`response`/`message`                                                     | yes               | Removing or repointing requires a swap.                        |
| An AsyncAPI `channels` entry, its `address`, and its `x-srn-payload`                                       | yes               | The same rule in the other grammar.                            |
| `transport.kind` and the binding block's addressing fields                                                 | yes               | Changing the wire requires a swap.                             |
| AsyncAPI `servers.<id>.protocol` and `pathname`                                                            | yes               | The same rule in the other grammar.                            |
| A message `name` and its `payload`, anywhere in `workflows/`                                               | yes               | Removing or repointing requires a swap.                        |
| A state, its `type: final`, a transition's event + target                                                  | yes               | Removing requires a swap.                                      |
| `title`, `summary`, `note`, `condition`, `when`, `while`, `role`, `tags`, `description`, prose, step order | no                | Metadata: bump `version`, no swap.                             |
| The dialect header on any artifact (**Artifact dialects** above)                                           | no                | Bump `version` once for the whole commit, whatever it touched. |

Adding a participant, a workflow file, a step, a surface entry, a state, or a
transition is additive and always legal. Every change in either row bumps the
entity's `version`.

## What the portal derives

| View                       | Inputs                                                                                                                                                           |
|----------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Participant graph          | `exposes`/`uses` (edges + direction); `participants` (aliases, roles)                                                                                            |
| Sequence diagram           | one per `workflows/*.yaml`, plus `participants` for lifeline labels                                                                                              |
| State chart                | `states.json` — final states double-bordered, guards `[g]`, actions `/ a`                                                                                        |
| Message × datamodel matrix | every `payload` in the workflows, plus every `request`/`response`/`message` in a surface list or every `x-srn-payload` in an AsyncAPI one                        |
| Transport card             | `transport.yaml` in either dialect — mini-spec: `kind`/`encoding`/`auth`/bindings/`spec.file`; AsyncAPI: `protocol`/`pathname`/`defaultContentType`/`x-srn-auth` |

The matrix is bidirectional in presentation only: "carried by these protocols"
on a datamodel page is a **derived inverse**, never authored on the datamodel.

## Protocol error classes

| Code                              | Meaning                                                                                                        |
|-----------------------------------|----------------------------------------------------------------------------------------------------------------|
| `E_PROTO_PARTICIPANTS`            | `participants` missing or with fewer than 2 entries.                                                           |
| `E_PROTO_ALIAS_DUP`               | Two participants share an `alias`.                                                                             |
| `E_PROTO_PARTICIPANT_KIND`        | A participant `ref` resolves to a kind other than component/product/actor.                                     |
| `E_PROTO_TRANSPORT_SCHEMA`        | Mini-spec `transport.yaml` violates the top-level field table.                                                 |
| `E_PROTO_TRANSPORT_BINDING`       | Mini-spec binding block key ≠ `kind`, block missing, or a required field absent.                               |
| `E_PROTO_TRANSPORT_SPEC_CONFLICT` | Mini-spec `spec` and a surface list both present.                                                              |
| `E_PROTO_TRANSPORT_ASYNCAPI`      | The AsyncAPI dialect violates its six profile rules, or its server's `protocol` is not admitted for this wire. |
| `E_PROTO_SPEC_FILE`               | `spec.file` does not exist, is absolute, or escapes the entity directory.                                      |
| `E_PROTO_WF_SCHEMA`               | Workflow file violates the field tables.                                                                       |
| `E_PROTO_WF_NAME`                 | Workflow `name` ≠ filename stem.                                                                               |
| `E_PROTO_WF_STEP_SHAPE`           | Step node lacks exactly one of `message`/`alt`/`opt`/`loop`.                                                   |
| `E_PROTO_WF_ALIAS`                | `from`/`to`/`participants` names an undeclared alias.                                                          |
| `E_PROTO_WF_EMPTY_BRANCH`         | A `steps` list is empty.                                                                                       |
| `E_PROTO_WF_DEPTH`                | Fragment nesting deeper than 3.                                                                                |
| `E_PROTO_WF_FANOUT`               | List-valued `to` on a step whose `kind` is not `event`.                                                        |
| `E_PROTO_PAYLOAD_KIND`            | A payload ref resolves to a non-datamodel.                                                                     |
| `E_PROTO_STATES_ID`               | `states.json` `id` ≠ the protocol entity `name`.                                                               |
| `E_PROTO_STATES_SUBSET`           | An XState construct outside the supported subset.                                                              |
| `E_PROTO_STATES_TARGET`           | Transition `target` is neither a sibling key nor a valid `#id.path`.                                           |
| `E_PROTO_STATES_EVENT_NAME`       | Event key does not match `^[A-Z][A-Z0-9_]*$`.                                                                  |
| `W_PROTO_TRANSPORT_HOST`          | An AsyncAPI server declares a literal `host` — a deployment fact.                                              |
| `W_PROTO_SPEC_ASYNCAPI`           | A mini-spec transport on an AsyncAPI-capable wire links `spec.format: asyncapi`.                               |
| `W_PROTO_PARTICIPANT_UNLINKED`    | Component/product participant with no `exposes`/`uses` back-edge.                                              |
| `W_PROTO_PARTICIPANT_MISSING`     | Component/product `exposes`/`uses` this protocol but is not a participant.                                     |
| `W_PROTO_STYLE_MISMATCH`          | Step kinds contradict the declared `style`.                                                                    |
| `W_PROTO_WF_CHANNEL_UNKNOWN`      | `channel` matches no surface-list entry (mini-spec) or channel address/id (AsyncAPI).                          |
| `W_PROTO_WF_ORPHAN_RETURN`        | `return`/`error` with no preceding counterpart `call`.                                                         |
| `W_PROTO_STATES_EVENT_UNKNOWN`    | State event has no corresponding workflow message name.                                                        |
| `W_PROTO_STATES_UNREACHABLE`      | A state no transition can reach.                                                                               |
| `W_PROTO_ARAZZO_UNGROUNDED`       | An `arazzo.yaml` names a source document, operation or channel this protocol does not carry.                   |
| `W_PROTO_ARTIFACT_UNKNOWN`        | Unrecognised file in the protocol entity directory.                                                            |

Codes from `srn.md`, `structure.md`, `frontmatter.md` and `evolution.md` apply
unchanged — in particular `E_FM_SCHEMA` covers every type or enum violation of
the protocol's frontmatter fields, `E_SRN_DANGLING` every unresolvable
reference, and `W_STRUCT_PROTOCOL_NCA` a protocol below its participants' NCA.
All are enforced by the catalog loader — `metaframework check` runs it and
exits non-zero on any error.
