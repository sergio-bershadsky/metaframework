# The three protocol mini-languages

> `transport.yaml`, `workflows/*.yaml` and `states.json` are the only formats the
> framework invents for itself. The rule copy of all three lives in the shared
> bundle at `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/protocols.md`, with
> the full field tables and the `E_PROTO_*` codes; **this file is the authoring
> companion** — the same contracts stated as traps, anchored to the protocols
> shipped in `solutions/acme/`. **When `framework/spec/kinds/protocol.md` is
> present in the repository it is authoritative and wins over both**; it is the
> largest kind document in the spec and worth reading in full before authoring a
> protocol.

All three artifacts are optional. A protocol with only `index.md` is legal — an
intent-level protocol under design, which simply derives no diagrams.

Two shape rules bind the `transport.yaml` mini-spec and `workflows/*.yaml`
alike: **no top-level `version:` key** (artifacts carry no version of their own;
the entity's frontmatter governs the whole directory), and unknown keys at any
level are rejected unless `x-` prefixed. `states.json` is the exception to the
second — see its section. The one framework-owned key, the `$schema` dialect
header below, is admitted **by name** at the artifact root, so neither rule
reaches it.

`transport.yaml` has a **second dialect**, and neither shape rule above governs
it: on a `kafka`, `websocket` or `amqp` wire the file may instead be a whole
AsyncAPI 3.x document, with AsyncAPI's grammar and AsyncAPI's own root key. See
"The AsyncAPI dialect" below before you read the mini-spec field tables as the
only way to write this file.

## The dialect header — first key of every artifact

A role names a **file, never a format**. `transport.yaml` is *the transport role
of this protocol*, not *the transport mini-spec*, which is what lets the payload
standardize one day inside a filename that does not move. The price of that is
that a reader cannot tell the two grammars apart by looking — so each artifact
says which one it is written in, in its own bytes, under a fixed key. Writing
`{meta}` for
`https://schemas.metaframework.dev/metaframework/product/specification/datamodel`:

| Artifact                | Dialect       | Key        | Value                           | Whose key is it          |
|-------------------------|---------------|------------|---------------------------------|--------------------------|
| `transport.yaml`        | the mini-spec | `$schema`  | `{meta}/transport-document`     | the framework's          |
| `transport.yaml`        | AsyncAPI      | `asyncapi` | `3.x`                           | AsyncAPI's own, natively |
| `states.json`           | XState subset | `$schema`  | `{meta}/state-machine-document` | the framework's          |
| `workflows/<name>.yaml` | the mini-spec | `$schema`  | `{meta}/workflow-document`      | the framework's          |
| `openapi.yaml`          | OpenAPI       | `openapi`  | `3.1.x`                         | OpenAPI's own, natively  |

Four artifacts, five dialects: `transport.yaml` has two, and the mini-spec row is
listed first because that order is what a headerless file is advised to add.

Written out — every block below is the real opening of a shipped file, cut off a
few keys in. Both `transport.yaml` dialects are shown, because settlement's
transport is in the AsyncAPI one and so carries AsyncAPI's key rather than the
framework's; the mini-spec form is quoted from a protocol that still uses it:

```yaml
# transport.yaml — the format names itself, so the framework adds nothing
asyncapi: 3.1.0
x-srn: srn://acme/protocol/settlement
info:
  title: Settlement
  version: unversioned
```

```yaml
# transport.yaml, the mini-spec dialect — solutions/acme/product/shop/protocol/order-placement/
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/transport-document
kind: http
summary: JSON over HTTPS, served by checkout at the storefront edge.
encoding: json
```

```json
{
  "$schema": "https://schemas.metaframework.dev/metaframework/product/specification/datamodel/state-machine-document",
  "id": "settlement",
  "initial": "awaiting-payment"
}
```

In JSON it is a member of the root object, in the same position and to the same
effect. In neither case does the filename move, the SRN
(`srn://acme/protocol/settlement.transport`) change, or any reference written
against the file need touching — which is the whole reason the role and the
dialect are separate things.

Seven things decide whether you get this right.

- **No `@version` on the URL.** It is the canonical `$id` of a meta-schema
  *entity*, and it names the grammar the file is written in, never a revision of
  the file. `transport-document@2` is wrong for the same reason a `$ref` never
  carries a pin. The entity's frontmatter `version` remains the only clock, and
  a top-level `version:` here is still a shape violation.
- **Root only.** A `$schema` on a workflow *step*, a surface entry, or a state
  node is an ordinary unknown key — `E_PROTO_WF_SCHEMA`,
  `E_PROTO_TRANSPORT_SCHEMA`, `E_PROTO_STATES_SUBSET` respectively. The header
  is admitted at exactly one position and nowhere else.
- **The framework's key is read once and deleted.** The loader records the
  dialect and removes `$schema` from the parsed document before the mini-spec
  parser is handed anything, which is why the strict validators stay strict and
  `x-` stays a hatch for *authors'* keys. `openapi:` and `asyncapi:` are their
  own formats' keys and are never stripped. The bytes on disk are untouched in
  every case, so the source pane and the artifact route still serve the file as
  authored.
- **The native keys carry version bands, the framework URLs do not.**
  `openapi: 3.1.x` means the whole `3.1` line — OpenAPI versions the *document*,
  so `3.1.1` is the same dialect and is not warned. `asyncapi: 3.x` is wider
  still, because AsyncAPI promises a minor increment stays usable by tooling
  built for a lower minor and says tooling ignores the patch. Paste `3.1.0` for
  either when writing a new file. A meta-schema URL has no version to widen.
- **Unrecognised — not merely unfamiliar — is the legacy dialect**, warned and
  never broken: `W_ARTIFACT_DIALECT` on the owning *protocol entity*, pathed at
  the file, with the message ending `— read as the legacy dialect`. Recognition
  is against **every** row for that artifact, so `asyncapi: 3.1.0` on a
  `transport.yaml` is a recognised dialect and raises nothing; only a header that
  matches no row, or no header at all, does. The file is still parsed, still
  rendered, still checked against its grammar either way. A catalog full of
  headerless files loads exactly as it did before.
- **A `transport.yaml` declaring both keys is an error, not a choice.** The
  loader takes the first matching row, so `$schema` wins and the file is read as
  the mini-spec; `asyncapi:` is a foreign key so it is never stripped, and the
  mini-spec's field table then rejects it as an unknown non-`x-` top-level key
  (`E_PROTO_TRANSPORT_SCHEMA`). Write one dialect per file.
- **Adding the header bumps `version` by exactly 1, per entity.** A protocol that
  gains a header in `transport.yaml`, `states.json` and three workflow files in
  one commit bumps once. It is additive metadata, never a swap: it adds a key,
  removes nothing, and repoints nothing.

## `transport.yaml` — the wire binding

One protocol, **one transport**. A protocol offered over two wire technologies is
two protocol entities. A second binding block is `E_PROTO_TRANSPORT_BINDING`, not
a shortcut.

**The wire decides which dialect you may write**, and it is not a preference:

| `kind`                       | Dialect                   | Because                                                         |
|------------------------------|---------------------------|-----------------------------------------------------------------|
| `kafka`, `websocket`, `amqp` | mini-spec **or** AsyncAPI | AsyncAPI is the industry description of these surfaces.         |
| `http`                       | mini-spec only            | OpenAPI owns this wire, and it already has a role file.         |
| `grpc`                       | mini-spec only            | AsyncAPI publishes no gRPC binding and no protocol spelling.    |
| `in-process`                 | mini-spec only            | A Server Object REQUIRES a `host`; an in-process call has none. |

The rest of this section is the **mini-spec** dialect. The AsyncAPI dialect has
its own subsection at the end, and the two never mix: there is no `kind`, no
`spec:` and no surface list in an AsyncAPI document.

Top level: `kind` (required, from the closed set below), a mapping keyed by
**exactly** the `kind` value (required), plus optional `summary`, `encoding`
(`json`, `avro`, `protobuf`, `msgpack`, `xml`, `text`, `binary`), `auth`
(display-only labels), and `spec`. Anything else non-`x-` is
`E_PROTO_TRANSPORT_SCHEMA`.

| `kind`       | Required binding fields             | Surface list key |
|--------------|-------------------------------------|------------------|
| `http`       | `base-path`                         | `operations`     |
| `grpc`       | `package`, `service`                | `methods`        |
| `amqp`       | `exchange`, `exchange-type`         | `bindings`       |
| `kafka`      | — (`topics` required unless `spec`) | `topics`         |
| `websocket`  | `path`                              | `channels`       |
| `in-process` | `language`, `module`                | `functions`      |

Surface entry shapes, per transport:

| Transport    | Entry fields                                                                                     |
|--------------|--------------------------------------------------------------------------------------------------|
| `http`       | `name` (kebab), `method`, `path` (may contain `{param}`), `request`, `response`, `summary`       |
| `grpc`       | `name`, `request`, `response`, `streaming` (`none`/`client`/`server`/`bidi`), `summary`          |
| `amqp`       | `routing-key`, `queue`, `message`, `summary`                                                     |
| `kafka`      | `name`, `key`, `message`, `partitions`, `retention`, `summary`                                   |
| `websocket`  | `name` (kebab), `direction` (`client-to-server`/`server-to-client`/`bidi`), `message`, `summary` |
| `in-process` | `name`, `request`, `response`, `summary`                                                         |

`request`, `response` and `message` are payload references — ordinary SRNs, see
"Payload binding" in `SKILL.md`. A surface entry's payload is **optional**: the
`preflight` operation in `schema-serving/transport.yaml` declares neither
`request` nor `response`, because an `OPTIONS` preflight carries no body worth
modelling. The same option exists in the other dialect — settlement's third
channel carries no `messages` map at all, because its payload model is still
under design.

### `spec` XOR the surface list

**`spec` and the surface list are mutually exclusive**
(`E_PROTO_TRANSPORT_SPEC_CONFLICT`). Either point at a real OpenAPI or `.proto`
file and let it be the single source of operation truth, or — when no such file
exists — write the lightweight list here. Maintaining both guarantees
divergence. Both keys are **mini-spec-only**: an AsyncAPI-dialect document has
neither, because it *is* the spec.

`spec: { format: asyncapi }` on a `kafka`, `websocket` or `amqp` transport is
`W_PROTO_SPEC_ASYNCAPI`: that document belongs *inside* `transport.yaml` as its
AsyncAPI dialect, not beside it. On `http`, `grpc` and `in-process` — which have
no AsyncAPI dialect to move it into — the attachment stays legal and unwarned.

`spec` is `{ format, file, version? }`; `file` is relative to the entity
directory and may not be absolute or contain `..` (`E_PROTO_SPEC_FILE`). In v1
the portal renders the linked file as an opaque card and does not parse it. Such
a file is named by the external tool's convention (`pricing.proto`,
`schema.graphql`), not by the framework's bare-filename rule — `openapi.yaml` is
the exception, a fixed-name artifact recognised link or no link.

The shipped HTTP protocols show both halves of the choice:
`order-placement/transport.yaml` and `authorization-check/transport.yaml` write
an `operations` list; `refund-request/transport.yaml` and
`carrier-booking/transport.yaml` link an `openapi.yaml` and carry no list.

`conforms-to` in the frontmatter is for **standards** (RFC 9457, CloudEvents),
never for files. A file in the directory is bound here under `spec`, in one
place.

### The AsyncAPI dialect

On a `kafka`, `websocket` or `amqp` wire, `transport.yaml` MAY instead be a whole
**AsyncAPI 3.x document**, discriminated by the format's own `asyncapi:` key.
The filename does not move and neither does
`srn://acme/protocol/settlement.transport` — that is the point of a role naming a
file rather than a format. Unlike a linked `openapi.yaml`, this dialect is
specified to be **parsed**: it feeds the transport card, the message × datamodel
matrix and the workflow `channel` check, so nothing goes dark when you migrate.
That reader is not written yet — the portal detects the dialect and reads no
transport document in either dialect — so every rule below is on you, not on a
validator.

Six profile rules ride on top of AsyncAPI; any violation is
`E_PROTO_TRANSPORT_ASYNCAPI`:

| #   | Rule                                                                                              |
|-----|---------------------------------------------------------------------------------------------------|
| 1   | `x-srn` at the root = the owning entity's absolute SRN.                                           |
| 2   | `info.title` = the entity's frontmatter `title`.                                                  |
| 3   | `info.version` = the literal string `unversioned` — the frontmatter is the only clock.            |
| 4   | Exactly **one** `servers` entry, its `protocol` admitted for this wire (table below).             |
| 5   | `channels` present and non-empty.                                                                 |
| 6   | `operations` OPTIONAL; when present, `id` = one of the protocol's `participants[].ref`, absolute. |

| `kind`      | `protocol` (plain / TLS) | `bindings` key |
|-------------|--------------------------|----------------|
| `kafka`     | `kafka` / `kafka-secure` | `kafka`        |
| `websocket` | `ws` / `wss`             | `ws`           |
| `amqp`      | `amqp` / `amqps`         | `amqp`         |

Four traps, in the order authors hit them.

- **`host` is REQUIRED by AsyncAPI and forbidden as a fact here.** Placement is
  an environment's claim, not a protocol's. Write it as a bare variable with a
  description and **no `default`**; a literal raises `W_PROTO_TRANSPORT_HOST`.
- **`operations` is optional, and silence beats invention.** `action` is
  `send`/`receive` relative to *one* application, which is why rule 6 makes `id`
  name that application. A kafka surface list records no direction, so a migrated
  kafka file carries no `operations` at all. A websocket one does, and converts
  mechanically: `client-to-server` → `receive`, `server-to-client` → `send`,
  `bidi` → two operations on one channel.
- **Only four `x-srn-` keys exist, and they are not decoration.** `x-srn` (root),
  `x-srn-payload` (Message — the **pinned** datamodel SRN), `x-srn-auth`
  (Server — the `auth` labels verbatim, display-only), `x-srn-partition-key`
  (Message — the field the topic partitions by; it rides the **Channel** when,
  and only when, that channel declares no `messages` map, which is true of
  exactly one channel in the catalog: `reconciliation-report` in
  `solutions/acme/protocol/settlement/transport.yaml`). `payload.$ref` at a
  canonical schema URL is *not* a
  substitute for `x-srn-payload`: a canonical URL carries no `@version`, so it
  silently unpins `order@3`.
- **Two conversions change shape, not just place.** `retention: 30d` becomes
  `topicConfiguration.retention.ms: 2592000000` — exact, and the human unit is
  gone. And `websocket.channels[]` becomes **N channels, one per entry** — not N
  messages on one connection channel. Each keeps its entry `name` as the
  channelId and MUST carry an `address` (the wire event or frame name; the
  mini-spec has no field for it, so take it from what the protocol documents
  about the wire). W9 is why: a step's `channel:` matches a channel `address` or
  channelId, so collapsing N names into one leaves N−1 steps matching nothing.
  AsyncAPI's ws binding note calls the channel the connection; that describes raw
  WebSockets and is not a cardinality rule, and the connection is stated once in
  `servers.<id>.pathname`. The catalog has exactly one `websocket` transport,
  `solutions/brass/protocol/game-transport/transport.yaml` — five entries, five
  channels, three distinct `address` values; read its comments.

`encoding` becomes `defaultContentType`: `json` → `application/json`, `xml` →
`application/xml`, `text` → `text/plain`, `binary` → `application/octet-stream`,
`msgpack` → `application/vnd.msgpack`, `avro` → `application/vnd.apache.avro`,
`protobuf` → `application/vnd.google.protobuf`.

Read the whole profile in
`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/protocols.md`, and the shipped
example in `references/worked-protocol.md`, which reproduces
`solutions/acme/protocol/settlement/transport.yaml` in this dialect.

## `workflows/<name>.yaml` — the workflow mini-language

`<name>` kebab-case, and the file's `name` key MUST equal the filename stem
(`E_PROTO_WF_NAME`). Top level: `name`, `title`, `steps` (required, non-empty),
plus optional `summary` and `participants` (a layout hint — a subset of the
protocol's aliases, never a restriction).

A step node carries **exactly one discriminator key** from `message`, `alt`,
`opt`, `loop` (`E_PROTO_WF_STEP_SHAPE`). `otherwise` is the one permitted
companion, only alongside `alt`.

Message step: `message` (kebab-case name — the arrow label), `from`, `to`,
optional `kind` (`call`, `return`, `event`, `error`; default `call`), `payload`,
`channel`, `condition`, `note`. `from` and `to` are participant **aliases**
(`E_PROTO_WF_ALIAS`), never SRNs, and may be the same alias — a self-call. `to`
may be a **list only on `kind: event`** (`E_PROTO_WF_FANOUT`).

### Trap 1 — `condition` annotates one arrow; `alt`/`opt` change the sequence

`condition` renders as `[guard] message` and the next step still follows
unconditionally. If two futures diverge, use `alt`. If steps may be skipped, use
`opt`. An `alt` needs at least **two compartments**, counting `otherwise` as one
— a single branch with no `otherwise` is an `opt`, and the two mean different
things (`opt`: may be skipped; `alt`: exactly one compartment runs).

### Trap 2 — `message` means two different things in two files

In a workflow step it is a kebab-case logical name, and the SRN lives in the
separate `payload` key. In a `transport.yaml` surface entry it *is* the SRN of
the datamodel the topic or queue carries — the same role `request`/`response`
play for call-shaped transports. A step `message` that looks like an SRN is
`E_PROTO_WF_SCHEMA`; a topic `message` that is a bare name is
`E_PROTO_TRANSPORT_SCHEMA`.

```yaml
# workflows/settle-order.yaml — "message" is the arrow label
- message: order-paid
  payload: /product/shop/component/checkout/component/payment/datamodel/order@3
```

```yaml
# transport.yaml, mini-spec dialect — "message" is the payload SRN
topics:
  - name: acme.settlement.order-paid.v1
    message: /product/shop/component/checkout/component/payment/datamodel/order@3
```

The AsyncAPI dialect ends the collision by not reusing the word: a Message Object
is a named thing in its own right, and the payload SRN moves to `x-srn-payload`
on it. Settlement is written that way now, so the mini-spec block above is the
form, not a quotation from it.

```yaml
# transport.yaml, AsyncAPI dialect — the same fact, under the extension key
channels:
  order-paid:
    address: acme.settlement.order-paid.v1
    messages:
      order-paid:
        x-srn-payload: /product/shop/component/checkout/component/payment/datamodel/order@3
```

### Fragments and the depth limit

`alt` is a list of `{ when, steps }` plus optional `otherwise`; `opt` is
`{ when, steps }`; `loop` is `{ while, max?, steps }`. Every `steps` list must be
non-empty (`E_PROTO_WF_EMPTY_BRANCH`).

**Maximum nesting depth is 3** (`E_PROTO_WF_DEPTH`). A fragment directly under
the root `steps` is depth 1. Audit it by counting fragment keys down the deepest
path — in `order-placement/workflows/place-order.yaml`: `loop` = 1, `opt` = 1,
outer `alt` = 1, inner `alt` = 2, innermost `opt` = 3, exactly at the ceiling.
Beyond that a sequence diagram stops being readable: split into a second
workflow, or move the ordering constraint into `states.json`.

Deliberately unsupported: `par`, gateways, pools/swimlanes, timers, compensation,
sub-workflow invocation, data objects. Each of them turns a sequence description
into BPMN.

Steps have no ids — the portal's stable key is the positional path
(`steps[4].alt[0].steps[2]`), so repeated message names in retries and polling
are unambiguous with no authoring overhead.

Two more checks worth knowing. `channel` must match something in the transport,
and what counts depends on the dialect: a `name` / `queue` / `routing-key` /
`path` in a mini-spec surface list, or a channel's `address` **or** its channelId
in the AsyncAPI dialect (`W_PROTO_WF_CHANNEL_UNKNOWN`). It is skipped entirely
only when there is nothing to match against — no `transport.yaml`, or a
mini-spec one that links a `spec` instead of listing a surface; an AsyncAPI
transport always has channels, so it is never skipped. And a `return`/`error`
should be preceded by a `call` in the opposite direction in the same or an
enclosing fragment (`W_PROTO_WF_ORPHAN_RETURN`).

## `states.json` — the XState subset

An XState v5 machine configuration, directly loadable by `createMachine()` —
that is the point of pinning a subset instead of inventing a format. It describes
the state of **one conversation as the protocol sees it**, never the internal
state of a participant. Exactly one machine per protocol.

Root: `id` (must equal the protocol entity `name` — `E_PROTO_STATES_ID`),
`initial`, `states`, optional `description`. A state node may carry `states`
(making it compound, and then `initial` is required), `type: "final"` (the only
legal `type`, and a final state must have no `on`), `on`, `entry`, `exit`,
`tags`, `description`. A transition is a target string, a transition object
(`target?`, `guard?`, `actions?`, `description?`), or an **array** evaluated top
to bottom with an unguarded entry as the fallback.

Target resolution supports exactly two forms (`E_PROTO_STATES_TARGET`): a
**sibling state key** (`"reserved"`) and an **absolute id path**
(`"#settlement.disputed"`). Relative descent (`"posting.entry-posted"`) is not
supported — it is the form that most often silently resolves to the wrong node.

Event names must match `^[A-Z][A-Z0-9_]*$` (`E_PROTO_STATES_EVENT_NAME`) and map
to workflow message names by lowercasing and turning `_` into `-`:
`LEDGER_ENTRY_POSTED` ⇔ `ledger-entry-posted`. An event with no matching message
is `W_PROTO_STATES_EVENT_UNKNOWN`; the reverse is not checked, because plenty of
messages carry no state change. An unreachable state is
`W_PROTO_STATES_UNREACHABLE`.

Outside the subset, all `E_PROTO_STATES_SUBSET`: `context`, `assign`, `always`,
`after`, `invoke`, `input`, `output`, `meta`, `type: "parallel"`,
`type: "history"`, wildcard events, and object-form actions or guards. The
catalog documents contracts, not runtime behaviour — anything carrying data or
executing is out. Data shapes belong to datamodels; timers and invocations belong
to the implementing component. `states.json` is the one artifact exempt from the
`x-` escape hatch: unknown keys there are errors, not extensions.

The root `$schema` dialect header is the single key that is not XState's, and it
is why "directly loadable by `createMachine()`" stays *literally* true rather
than nearly true: the loader strips it before anything downstream sees the
machine, so what a runtime receives is the file minus exactly one framework key,
and `E_PROTO_STATES_SUBSET` keeps rejecting every other stranger with nothing
carved out of it. Inside a state node it is a stranger like any other.

`states.json` carries no SRN references at all — it names events and states only.
