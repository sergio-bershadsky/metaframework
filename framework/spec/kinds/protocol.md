---
kind: spec
name: protocol
version: 3
status: review
title: Protocol kind
summary: The protocol entity contract — participants and style frontmatter, transport.yaml, the workflow YAML mini-spec, XState-subset states.json, payload binding, and derived diagrams.
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

| Component participants                                                                | Common pair prefix                | Protocol directory                                            |
| --------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------- |
| `/product/shop/component/checkout`, `/product/shop/component/inventory`                   | `product/shop`                    | `solutions/acme/product/shop/protocol/…`                      |
| `/product/shop/component/checkout`, `/product/shop/component/checkout/component/payment`  | `product/shop/component/checkout` | `solutions/acme/product/shop/component/checkout/protocol/…`   |
| `/product/shop/component/checkout`, `/product/billing/component/ledger`                   | *(empty)*                         | `solutions/acme/protocol/…`                                   |

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
├── openapi.yaml            # OPTIONAL  external spec, linked from transport.yaml
├── states.json             # OPTIONAL  XState-subset conversation state machine
└── workflows/              # OPTIONAL  asset subdirectory — never an entity
    ├── place-order.yaml    # one workflow, name = filename stem
    └── cancel-order.yaml   # one workflow, name = filename stem
```

Rules:

- Sibling filenames are **bare and fixed**: `transport.yaml`, `states.json`.
  A file named `order-placement.transport.yaml` or `protocol.yaml` is not
  recognised and raises `W_PROTO_ARTIFACT_UNKNOWN`.
- `workflows/` is the only recognised asset subdirectory. It contains one
  `*.yaml` file per workflow, kebab-case, no nesting below it, and — per
  [structure.md](../structure.md) — no `index.md` at any depth.
- Files linked from `transport.yaml` (`spec.file`, e.g. `openapi.yaml`,
  `asyncapi.yaml`, `pricing.proto`) sit alongside `index.md` and are recognised
  by virtue of being linked.
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
  `E_PROTO_STATES_SUBSET`.

  ```yaml
  kind: http
  x-gateway-route: shop-edge   # tolerated, ignored by the portal
  gateway-route: shop-edge     # E_PROTO_TRANSPORT_SCHEMA
  http:
    base-path: /api/v1/orders
  ```
- All four artifacts are optional. A protocol with only `index.md` is legal
  (an intent-level protocol under design); it simply derives no diagrams.

## Frontmatter additions

On top of the common contract in [frontmatter.md](../frontmatter.md), a
protocol's `index.md` adds three fields.

| Field         | Type                            | Required | Rule                                                                    |
| ------------- | ------------------------------- | -------- | ----------------------------------------------------------------------- |
| `participants`| list of participant objects     | yes      | At least 2 entries (`E_PROTO_PARTICIPANTS`); aliases unique (`E_PROTO_ALIAS_DUP`). |
| `style`       | `point-to-point \| bus \| request-response` | yes | Closed set; see the decision rule below.                       |
| `conforms-to` | list of standard objects        | no       | External standards this protocol follows; display-only, never resolved. |

Participant object:

| Field   | Type                          | Required | Rule                                                                        |
| ------- | ----------------------------- | -------- | ---------------------------------------------------------------------------- |
| `alias` | kebab-case string, ≤ 32 chars | yes      | Local name used by `workflows/*.yaml`; unique within the protocol.           |
| `ref`   | SRN reference                 | yes      | MUST resolve to a `component`, `product`, or `actor` (`E_PROTO_PARTICIPANT_KIND`). |
| `role`  | kebab-case string, ≤ 32 chars | no       | Free-form display label (`initiator`, `publisher`, `broker`). No semantics.  |

Standard object (`conforms-to` entries):

| Field      | Type   | Required | Rule                                                    |
| ---------- | ------ | -------- | ------------------------------------------------------- |
| `standard` | string | yes      | Human name, e.g. `RFC 9457 Problem Details for HTTP APIs`. |
| `version`  | string | no       | e.g. `1.0`, `proto3`.                                    |
| `url`      | string | no       | http(s) URL; rendered as a link, never fetched.          |

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

| Concern                                              | Authoritative source                       |
| ---------------------------------------------------- | ------------------------------------------ |
| Which entities are in the protocol's graph, and the direction of each edge (provides vs consumes) | `exposes` / `uses` on the component or product |
| The alias namespace used inside `workflows/*.yaml` and by the portal's lifeline labels | `participants` in the protocol's `index.md` |
| NCA placement of the protocol directory ([structure.md](../structure.md)) | `participants`, filtered to component/product refs |

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
protocol, one transport. It deliberately does not re-express what OpenAPI,
AsyncAPI, or a `.proto` file already expresses.

### Top-level fields

| Field      | Type                                                   | Required | Rule                                                                |
| ---------- | ------------------------------------------------------ | -------- | -------------------------------------------------------------------- |
| `kind`     | `http \| grpc \| amqp \| kafka \| websocket \| in-process` | yes  | Closed set; selects the binding block.                              |
| `<kind>`   | mapping                                                | yes      | The binding block, keyed by **exactly** the `kind` value (`E_PROTO_TRANSPORT_BINDING`). |
| `summary`  | string, one line, ≤ 200 chars                          | no       | Rendered above the transport card.                                  |
| `encoding` | `json \| avro \| protobuf \| msgpack \| xml \| text \| binary` | no | Wire encoding of payloads.                                   |
| `auth`     | list of kebab-case strings                             | no       | Display-only labels (`oauth2-bearer`, `mtls`, `sasl-scram`).        |
| `spec`     | mapping, see below                                     | no       | Link to an external spec file in the entity directory.              |

Any other top-level key that is not `x-` prefixed, or a type violation of the
above, is `E_PROTO_TRANSPORT_SCHEMA`.

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

| Field    | Type                                                  | Required | Rule                                                             |
| -------- | ----------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| `format` | `openapi \| asyncapi \| protobuf \| graphql \| json-schema` | yes | Closed set.                                                     |
| `file`   | string, path relative to the entity directory         | yes      | MUST exist; MUST NOT start with `/` or contain `..` (`E_PROTO_SPEC_FILE`). |
| `version`| string                                                | no       | e.g. `3.1.0`, `proto3`.                                           |

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

### Binding blocks

`http`:

| Field        | Type                                  | Required | Rule                                     |
| ------------ | ------------------------------------- | -------- | ------------------------------------------ |
| `base-path`  | string starting with `/`              | yes      | Path prefix all operations hang off.      |
| `tls`        | boolean                               | no       | Default `true`.                            |
| `operations` | list of operation objects             | no       | Surface list.                              |

Operation object: `name` (kebab-case, required), `method`
(`GET \| POST \| PUT \| PATCH \| DELETE \| HEAD \| OPTIONS`, required), `path`
(string starting with `/`, may contain `{param}` placeholders, required),
`request` (SRN → datamodel), `response` (SRN → datamodel), `summary` (string).

`grpc`:

| Field     | Type                                | Required | Rule                                   |
| --------- | ----------------------------------- | -------- | ---------------------------------------- |
| `package` | string, dot-separated               | yes      | Proto package; external identifier, not kebab-constrained. |
| `service` | string                              | yes      | Service name as declared in the proto.  |
| `tls`     | boolean                             | no       | Default `true`.                          |
| `methods` | list of method objects              | no       | Surface list.                            |

Method object: `name` (string, required), `request` / `response` (SRN →
datamodel), `streaming` (`none \| client \| server \| bidi`, default `none`),
`summary` (string).

`amqp`:

| Field           | Type                                       | Required | Rule                    |
| --------------- | ------------------------------------------ | -------- | ------------------------- |
| `exchange`      | string (may be empty for the default exchange) | yes  | Exchange name.           |
| `exchange-type` | `direct \| topic \| fanout \| headers`     | yes      | AMQP exchange type.      |
| `durable`       | boolean                                    | no       | Default `true`.          |
| `bindings`      | list of binding objects                    | no       | Surface list.            |

Binding object: `routing-key` (string, may contain `*` / `#`, required),
`queue` (string, required), `message` (SRN → datamodel), `summary` (string).

`kafka`:

| Field     | Type                    | Required                    | Rule                                |
| --------- | ----------------------- | --------------------------- | ------------------------------------- |
| `cluster` | string                  | no                          | Free label for the logical cluster.  |
| `topics`  | list of topic objects   | yes, unless `spec` is present | Surface list.                       |

Topic object: `name` (string, required — Kafka naming, not kebab-constrained),
`key` (string, the partition key), `message` (SRN → datamodel), `partitions`
(integer ≥ 1), `retention` (string, e.g. `7d`), `summary` (string).

`websocket`:

| Field         | Type                     | Required | Rule                        |
| ------------- | ------------------------ | -------- | ----------------------------- |
| `path`        | string starting with `/` | yes      | Upgrade path.                |
| `subprotocol` | string                   | no       | `Sec-WebSocket-Protocol`.    |
| `tls`         | boolean                  | no       | Default `true`.              |
| `channels`    | list of channel objects  | no       | Surface list.                |

Channel object: `name` (kebab-case, required), `direction`
(`client-to-server \| server-to-client \| bidi`, required), `message` (SRN →
datamodel), `summary` (string).

`in-process`:

| Field       | Type                      | Required | Rule                                    |
| ----------- | ------------------------- | -------- | ----------------------------------------- |
| `language`  | string                    | yes      | e.g. `typescript`, `python`, `go`.       |
| `module`    | string                    | yes      | Import path / package path.              |
| `interface` | string                    | no       | Exported symbol implementing the surface.|
| `functions` | list of function objects  | no       | Surface list.                            |

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

## The workflow mini-spec

A workflow is one named, ordered exchange between participants. It is the input
to the portal's sequence diagrams, and it is designed to be as legible to an AI
reading the raw YAML as to a renderer: flat message steps by default, three
named fragment forms for structure, nothing else.

File: `workflows/<name>.yaml`, `<name>` kebab-case.

### Top-level fields

| Field          | Type                             | Required | Rule                                                                     |
| -------------- | -------------------------------- | -------- | -------------------------------------------------------------------------- |
| `name`         | kebab-case string                | yes      | MUST equal the filename stem (`E_PROTO_WF_NAME`).                         |
| `title`        | string, ≤ 80 chars               | yes      | Diagram heading.                                                          |
| `summary`      | string, one line, ≤ 200 chars    | no       | Shown in the protocol page's workflow list.                               |
| `participants` | list of aliases                  | no       | Lifeline order; MUST be a subset of the protocol's aliases (`E_PROTO_WF_ALIAS`). |
| `steps`        | list of step nodes               | yes      | At least one (`E_PROTO_WF_EMPTY_BRANCH`).                                 |

When `participants` is omitted, lifelines are ordered by first appearance in
`steps`. When present it MAY be a strict subset — aliases not listed but used
in a step are appended after the listed ones, so the field is a layout hint,
never a restriction.

```yaml
name: place-order              # file is workflows/place-order.yaml
title: Place an order
summary: Customer submits a cart; checkout reserves stock, authorizes payment, confirms.
participants: [customer, checkout, inventory, payment]
steps:
  - message: submit-order
    from: customer
    to: checkout
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

| Field       | Type                                          | Required | Rule                                                                        |
| ----------- | --------------------------------------------- | -------- | ---------------------------------------------------------------------------- |
| `message`   | kebab-case string, ≤ 64 chars                 | yes      | Logical message name; the arrow label.                                       |
| `from`      | participant alias                             | yes      | MUST be declared in the protocol's `participants` (`E_PROTO_WF_ALIAS`).      |
| `to`        | alias, or list of aliases when `kind: event`  | yes      | A list on a non-`event` step is `E_PROTO_WF_FANOUT`.                         |
| `kind`      | `call \| return \| event \| error`            | no       | Default `call`.                                                              |
| `payload`   | SRN reference                                 | no       | MUST resolve to a `datamodel` (`E_PROTO_PAYLOAD_KIND`); SHOULD pin `@version`. |
| `channel`   | string                                        | no       | Topic / queue / routing-key / path this message travels on.                  |
| `condition` | string, ≤ 120 chars                           | no       | Display-only guard label on the arrow. Creates **no** branch.                |
| `note`      | string, ≤ 200 chars                           | no       | Rendered as a UML note anchored to the step.                                 |

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

| Field       | Type                    | Required | Rule                                                     |
| ----------- | ----------------------- | -------- | ---------------------------------------------------------- |
| `alt`       | list of branch objects  | yes      | At least one branch.                                      |
| `otherwise` | list of step nodes      | no       | The `[else]` compartment; at least one step.              |

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

| `kind`   | Arrow                                | UML meaning            |
| -------- | ------------------------------------ | ---------------------- |
| `call`   | solid line, filled arrowhead         | synchronous message    |
| `return` | dashed line, open arrowhead          | reply message          |
| `event`  | solid line, open arrowhead           | asynchronous signal    |
| `error`  | dashed line, open arrowhead, error styling | failure reply    |

`alt` renders as an `alt` fragment with one compartment per branch labelled by
`when`, plus an `[else]` compartment for `otherwise`; `opt` and `loop` render
as the fragments of the same names. `condition` prefixes the arrow label in
brackets; `note` becomes an anchored note; `channel` is appended to the arrow
label in the transport's styling.

### Workflow validation rules

| #  | Rule                                                                  | Error class                 |
| -- | --------------------------------------------------------------------- | --------------------------- |
| W1 | File parses and matches the field tables above.                       | `E_PROTO_WF_SCHEMA`         |
| W2 | `name` equals the filename stem.                                      | `E_PROTO_WF_NAME`           |
| W3 | Exactly one discriminator key per step node.                          | `E_PROTO_WF_STEP_SHAPE`     |
| W4 | Every `from` / `to` / `participants` alias is declared in the protocol.| `E_PROTO_WF_ALIAS`          |
| W5 | Every `steps` list is non-empty.                                      | `E_PROTO_WF_EMPTY_BRANCH`   |
| W6 | Fragment nesting depth ≤ 3.                                           | `E_PROTO_WF_DEPTH`          |
| W7 | List-valued `to` only on `kind: event`.                               | `E_PROTO_WF_FANOUT`         |
| W8 | `payload` resolves (per [srn.md](../srn.md)) to a `datamodel`.        | `E_SRN_DANGLING` / `E_PROTO_PAYLOAD_KIND` |
| W9 | `channel` matches a `name` / `queue` / `routing-key` / `path` declared in `transport.yaml`. | `W_PROTO_WF_CHANNEL_UNKNOWN` |
| W10| A `return` / `error` step is preceded, in the same fragment or an enclosing one, by a `call` in the opposite direction. | `W_PROTO_WF_ORPHAN_RETURN` |

W9 is skipped entirely when `transport.yaml` is absent or declares no surface
list (a linked OpenAPI/AsyncAPI file is not parsed in v1, so there is nothing
to check against — the absence of a check is not a warning).

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

## `states.json` — the conversation state machine

`states.json` is an **XState v5 machine configuration** describing the state of
**one conversation** as the protocol sees it — not the internal state of any
single participant. A participant's own state machine belongs to that component.
Exactly one machine per protocol; a `states/` subdirectory for several is a
plausible additive extension, not v1.

The file is directly loadable by `createMachine()` — that is the point of
pinning a subset rather than inventing a format.

### Supported subset

Root object:

| Key           | Type                        | Required | Notes                                       |
| ------------- | --------------------------- | -------- | --------------------------------------------- |
| `id`          | string                      | yes      | MUST equal the protocol entity `name` (`E_PROTO_STATES_ID`). |
| `initial`     | string                      | yes      | A key of `states`.                            |
| `states`      | object                      | yes      | Keys are kebab-case state names.              |
| `description` | string                      | no       | Rendered above the chart.                     |

State node:

| Key           | Type                          | Required                       | Notes                                       |
| ------------- | ----------------------------- | ------------------------------ | --------------------------------------------- |
| `states`      | object                        | no                             | Makes the node compound; nesting allowed.    |
| `initial`     | string                        | yes iff `states` is present    | A key of this node's `states`.               |
| `type`        | `"final"`                     | no                             | Only this value; a final state MUST have no `on`. |
| `on`          | object, event → transition    | no                             | See below.                                    |
| `entry`       | string or list of strings     | no                             | Action names, plain strings.                 |
| `exit`        | string or list of strings     | no                             | Action names, plain strings.                 |
| `tags`        | list of kebab-case strings    | no                             | Free facets; the portal may colour by tag.   |
| `description` | string                        | no                             | Rendered inside the state box.               |

Transition value — a target string, a transition object, or an **array** of
transition objects evaluated top to bottom (first matching guard wins; an
unguarded entry is the fallback):

| Key           | Type                      | Required | Notes                                                    |
| ------------- | ------------------------- | -------- | ---------------------------------------------------------- |
| `target`      | string                    | no       | Omitted ⇒ internal self-transition (actions only, no move). |
| `guard`       | string                    | no       | Plain string, rendered as `[guard]` on the edge.           |
| `actions`     | string or list of strings | no       | Plain strings, rendered as `/ action`.                     |
| `description` | string                    | no       | Edge tooltip.                                              |

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

Every payload reference — a workflow step's `payload`, and a surface list
entry's `request`, `response`, or `message` — is an ordinary SRN reference per
[srn.md](../srn.md).

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
against `order@2` starts describing `order@3` with no diff on this file.

A payload reference is an SRN even though the datamodel's own `schema.json` uses
relative file paths in its `$ref`s ([kinds/datamodel.md](datamodel.md)). The two
are not in conflict and neither is a fallback for the other: `schema.json` is
governed by an interoperability standard and must stay resolvable by stock JSON
Schema tooling, while a workflow step's `payload` is a catalog reference in a
framework-private YAML format that no external tool reads. That is also why
pinning still works here and no longer works in a `$ref` — an SRN carries
`@version`, a path does not.

Relative references resolve against **the referring file's own URI**, which is
the artifact path inside the entity — so the depth differs between a sibling
artifact and a file under `workflows/`. Taking the protocol
`srn://acme/product/shop/protocol/order-placement` and the same reference text
in each of its files:

| Referring file               | Base URI                                                                       | `../../datamodel/order@1` resolves to                       |
| ---------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `index.md`                   | `srn://acme/product/shop/protocol/order-placement/index.md`                     | `srn://acme/product/shop/datamodel/order@1`                  |
| `transport.yaml`             | `srn://acme/product/shop/protocol/order-placement/transport.yaml`               | `srn://acme/product/shop/datamodel/order@1`                  |
| `workflows/place-order.yaml` | `srn://acme/product/shop/protocol/order-placement/workflows/place-order.yaml`   | `srn://acme/product/shop/protocol/datamodel/order@1` ✗       |

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
```

`states.json` carries no SRN references at all — it names events and states
only. Payload shapes are attached to the messages that carry those events, in
the workflows.

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

| Derived view                 | Inputs                                                                 | Notes                                                                   |
| ---------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Participant graph            | `exposes` / `uses` on components and products (edges + direction); `participants` (aliases, roles) | Nodes with no back-edge render dimmed and undirected.  |
| Sequence diagram             | one per `workflows/*.yaml`, plus `participants` for lifeline labels     | Fragments from `alt`/`opt`/`loop`; arrow styling from step `kind`.       |
| State chart                  | `states.json`                                                           | Final states double-bordered; guards and actions as edge labels.        |
| Message × datamodel matrix   | every `payload` in the workflows and every `request`/`response`/`message` in the transport surface list | Rows = message names, columns = datamodel SRNs, cell = pinned version. |
| Transport card               | `transport.yaml`                                                        | `kind`, `encoding`, `auth`, binding fields, link to `spec.file`.         |

The matrix is bidirectional in presentation only: the datamodel entity page
shows "carried by these protocols" as a **derived inverse**, exactly like the
inverse relation edges in [frontmatter.md](../frontmatter.md) — it is never
authored on the datamodel.

## Evolution of a protocol

[evolution.md](../evolution.md) already fixes the additive-only rule and names
the protocol's contract surface as "the operations, messages, and states". This
document only says which files hold each part:

| Element                                                                   | Contract surface? | Consequence                       |
| -------------------------------------------------------------------------- | ----------------- | ---------------------------------- |
| A `participants` entry                                                     | yes               | Removing one requires a swap.     |
| A surface list entry in `transport.yaml`, and its `request`/`response`/`message` | yes         | Removing or repointing requires a swap. |
| `transport.kind` and the binding block's addressing fields                 | yes               | Changing the wire requires a swap.|
| A message `name` and its `payload` ref, anywhere in `workflows/`           | yes               | Removing or repointing requires a swap. |
| A state, its `type: final`, and a transition's event + target              | yes               | Removing requires a swap.         |
| `title`, `summary`, `note`, `condition`, `when`, `while`, `role`, `tags`, `description`, prose, step order within a workflow | no | Metadata: bump `version`, no swap. |

Every change in either row bumps the entity's `version`, per
[evolution.md](../evolution.md). Adding a participant, a workflow file, a step,
a surface list entry, a state, or a transition is additive and always legal.

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

# Order placement

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
list, so W9 does not apply.

### `states.json`

```json
{
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
the frontmatter fields added here, and `E_SRN_DANGLING` covers every
unresolvable reference.

| Code                              | Meaning                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `E_PROTO_PARTICIPANTS`            | `participants` missing or with fewer than 2 entries.                          |
| `E_PROTO_ALIAS_DUP`               | Two participants share an `alias`.                                            |
| `E_PROTO_PARTICIPANT_KIND`        | A participant `ref` resolves to a kind other than component/product/actor.    |
| `E_PROTO_TRANSPORT_SCHEMA`        | `transport.yaml` violates the top-level field table (unknown non-`x-` key, bad type). |
| `E_PROTO_TRANSPORT_BINDING`       | Binding block key ≠ `kind`, block missing, or a required binding field absent.|
| `E_PROTO_TRANSPORT_SPEC_CONFLICT` | `spec` and a surface list both present.                                       |
| `E_PROTO_SPEC_FILE`               | `spec.file` does not exist, is absolute, or escapes the entity directory.     |
| `E_PROTO_WF_SCHEMA`               | Workflow file violates the field tables (unknown non-`x-` key, bad type).     |
| `E_PROTO_WF_NAME`                 | Workflow `name` ≠ filename stem.                                              |
| `E_PROTO_WF_STEP_SHAPE`           | Step node does not carry exactly one of `message`/`alt`/`opt`/`loop`.         |
| `E_PROTO_WF_ALIAS`                | `from`/`to`/`participants` names an alias the protocol does not declare.      |
| `E_PROTO_WF_EMPTY_BRANCH`         | A `steps` list (workflow, branch, `otherwise`, `opt`, `loop`) is empty.       |
| `E_PROTO_WF_DEPTH`                | Fragment nesting deeper than 3.                                               |
| `E_PROTO_WF_FANOUT`               | List-valued `to` on a step whose `kind` is not `event`.                       |
| `E_PROTO_PAYLOAD_KIND`            | A `payload`/`request`/`response`/`message` ref resolves to a non-datamodel.   |
| `E_PROTO_STATES_ID`               | `states.json` `id` ≠ the protocol entity `name`.                              |
| `E_PROTO_STATES_SUBSET`           | An XState construct outside the supported subset.                             |
| `E_PROTO_STATES_TARGET`           | Transition `target` is neither a sibling key nor a valid `#id.path`.          |
| `E_PROTO_STATES_EVENT_NAME`       | Event key does not match `^[A-Z][A-Z0-9_]*$`.                                 |
| `W_PROTO_PARTICIPANT_UNLINKED`    | Component/product participant with no `exposes`/`uses` back-edge.             |
| `W_PROTO_PARTICIPANT_MISSING`     | Component/product `exposes`/`uses` this protocol but is not a participant.    |
| `W_PROTO_STYLE_MISMATCH`          | Step kinds contradict the declared `style`.                                   |
| `W_PROTO_WF_CHANNEL_UNKNOWN`      | `channel` matches no entry in the transport surface list.                     |
| `W_PROTO_WF_ORPHAN_RETURN`        | `return`/`error` with no preceding counterpart `call`.                        |
| `W_PROTO_STATES_EVENT_UNKNOWN`    | State event has no corresponding workflow message name.                       |
| `W_PROTO_STATES_UNREACHABLE`      | A state no transition can reach.                                              |
| `W_PROTO_ARTIFACT_UNKNOWN`        | Unrecognised file in the protocol entity directory.                           |

All are enforced at portal build/load; there is no CLI in v1.
