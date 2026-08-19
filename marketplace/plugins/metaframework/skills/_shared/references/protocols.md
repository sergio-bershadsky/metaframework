# Protocols — participants, transport, workflows, states

> Distilled from `framework/spec/kinds/protocol.md` (version 3). **When
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
├── openapi.yaml            # OPTIONAL  external spec, recognised by being linked
├── states.json             # OPTIONAL  XState-subset conversation machine
└── workflows/              # OPTIONAL  asset dir — never an entity
    ├── place-order.yaml    # one workflow; name = filename stem
    └── cancel-order.yaml
```

- **All four artifacts are optional.** A protocol with only `index.md` is legal —
  an intent-level protocol under design. It simply derives no diagrams.
- Sibling filenames are **bare and fixed**: `transport.yaml`, `states.json`. An
  `order-placement.transport.yaml` or a `protocol.yaml` is not recognised —
  `W_PROTO_ARTIFACT_UNKNOWN`. Extra `*.md` prose siblings are fine and carry no
  machine semantics; anything else unrecognised warns.
- `workflows/` is the only recognised asset subdirectory: one `*.yaml` per
  workflow, kebab-case, no nesting below it, no `index.md` at any depth.
- A file linked from `transport.yaml` `spec.file` (`openapi.yaml`,
  `asyncapi.yaml`, `pricing.proto`) sits next to `index.md` and is recognised
  *by virtue of being linked*. It follows the external tool's naming convention,
  not the framework's bare-filename rule.
- **Artifacts carry no version of their own.** A top-level `version:` key in
  `transport.yaml` or a workflow file is a shape violation; the entity's
  frontmatter `version` is a snapshot of the whole directory.
- The **`x-` escape hatch** reaches into `transport.yaml` and `workflows/*.yaml`
  — top level and inside entries. `states.json` is exempt: it is an XState
  machine configuration and an unknown key there is `E_PROTO_STATES_SUBSET`.

  ```yaml
  kind: http
  x-gateway-route: shop-edge   # tolerated, ignored by the portal
  gateway-route: shop-edge     # E_PROTO_TRANSPORT_SCHEMA
  ```

## Participants and aliases

`participants` is a list of `{ alias, ref, role? }`, at least two entries
(`E_PROTO_PARTICIPANTS`):

| Field   | Type                          | Required | Rule                                                                     |
|---------|-------------------------------|----------|---------------------------------------------------------------------------|
| `alias` | kebab-case string, ≤ 32 chars | yes      | The local name `workflows/*.yaml` uses; unique here (`E_PROTO_ALIAS_DUP`). |
| `ref`   | SRN reference                 | yes      | MUST resolve to `component`, `product`, or `actor` (`E_PROTO_PARTICIPANT_KIND`). |
| `role`  | kebab-case string, ≤ 32 chars | no       | Display label (`initiator`, `publisher`, `broker`). No semantics.         |

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

| Concern                                                        | Authoritative source                   |
|----------------------------------------------------------------|-----------------------------------------|
| Who is in the graph, and the direction of each edge             | `exposes` / `uses` on component/product |
| The alias namespace inside `workflows/*.yaml` and lifeline labels | `participants` in the protocol          |
| NCA placement of the protocol directory (`structure.md`)        | `participants`, component/product refs only |

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
|-----------------------------------------------------|--------|---------------------|
| Does the sender name the receiver?                  | no     | `bus`               |
| …and does the protocol contract a correlated reply? | yes    | `request-response`  |
| …otherwise                                          | —      | `point-to-point`    |

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

| Field      | Type                                                        | Required | Rule                                             |
|------------|-------------------------------------------------------------|----------|---------------------------------------------------|
| `kind`     | `http \| grpc \| amqp \| kafka \| websocket \| in-process`  | yes      | Closed set; selects the binding block.            |
| `<kind>`   | mapping                                                     | yes      | Keyed by **exactly** the `kind` value (`E_PROTO_TRANSPORT_BINDING`). |
| `summary`  | string, one line, ≤ 200 chars                               | no       | Rendered above the transport card.                |
| `encoding` | `json \| avro \| protobuf \| msgpack \| xml \| text \| binary` | no     | Wire encoding of payloads.                        |
| `auth`     | list of kebab-case strings                                  | no       | Display-only labels (`oauth2-bearer`, `mtls`, `sasl-scram`). |
| `spec`     | `{ format, file, version? }`                                | no       | Link to an external spec file in the entity directory. |

Any other non-`x-` top-level key, or a type violation, is
`E_PROTO_TRANSPORT_SCHEMA`.

### Binding blocks and surface lists

Each block may carry one optional **surface list** — its enumeration of what the
transport offers:

| `kind`       | Required binding fields                         | Optional            | Surface list |
|--------------|--------------------------------------------------|----------------------|--------------|
| `http`       | `base-path` (starts with `/`)                    | `tls` (default true) | `operations` |
| `grpc`       | `package` (dotted), `service`                    | `tls` (default true) | `methods`    |
| `amqp`       | `exchange` (may be empty), `exchange-type` (`direct \| topic \| fanout \| headers`) | `durable` (default true) | `bindings` |
| `kafka`      | — (`topics` is required **unless** `spec` is present) | `cluster`        | `topics`     |
| `websocket`  | `path` (starts with `/`)                         | `subprotocol`, `tls` | `channels`   |
| `in-process` | `language`, `module`                             | `interface`          | `functions`  |

Surface entry shapes:

| List         | Entry fields                                                                                       |
|--------------|-----------------------------------------------------------------------------------------------------|
| `operations` | `name` (kebab), `method` (`GET \| POST \| PUT \| PATCH \| DELETE \| HEAD \| OPTIONS`), `path` (may hold `{param}`), `request`, `response`, `summary` |
| `methods`    | `name`, `request`, `response`, `streaming` (`none \| client \| server \| bidi`, default `none`), `summary` |
| `bindings`   | `routing-key` (may hold `*` / `#`), `queue`, `message`, `summary`                                    |
| `topics`     | `name` (Kafka naming, not kebab-constrained), `key`, `message`, `partitions` (≥ 1), `retention`, `summary` |
| `channels`   | `name` (kebab), `direction` (`client-to-server \| server-to-client \| bidi`), `message`, `summary`   |
| `functions`  | `name`, `request`, `response`, `summary`                                                             |

`request`, `response` and `message` are payload SRNs (see below), and each is
optional — a surface entry whose model is still under design legitimately has
none.

### `spec` XOR the surface list

| Field     | Type                                                        | Required | Rule                                                     |
|-----------|--------------------------------------------------------------|----------|-----------------------------------------------------------|
| `format`  | `openapi \| asyncapi \| protobuf \| graphql \| json-schema` | yes      | Closed set.                                               |
| `file`    | path relative to the entity directory                        | yes      | MUST exist; MUST NOT start with `/` or contain `..` (`E_PROTO_SPEC_FILE`). |
| `version` | string                                                       | no       | `3.1.0`, `proto3`.                                        |

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

In v1 the portal treats a linked spec as an **opaque attachment**: a card with
format, version and a raw link. Parsing OpenAPI/AsyncAPI to derive operation
tables is deferred — which is also why the `channel` check below is skipped when
a protocol links a spec instead of listing a surface.

```yaml
# the smallest useful transport
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

## `workflows/<name>.yaml` — the workflow mini-language

One named, ordered exchange per file, `<name>` kebab-case. Designed to be as
legible to an AI reading raw YAML as to a renderer: flat message steps by
default, three named fragment forms, nothing else.

| Field          | Type                          | Required | Rule                                                              |
|----------------|-------------------------------|----------|--------------------------------------------------------------------|
| `name`         | kebab-case string             | yes      | MUST equal the filename stem (`E_PROTO_WF_NAME`).                  |
| `title`        | string, ≤ 80 chars            | yes      | Diagram heading.                                                   |
| `summary`      | string, one line, ≤ 200 chars | no       | Shown in the protocol page's workflow list.                        |
| `participants` | list of aliases               | no       | Lifeline order; MUST be a subset of the protocol's aliases (`E_PROTO_WF_ALIAS`). |
| `steps`        | list of step nodes            | yes      | At least one (`E_PROTO_WF_EMPTY_BRANCH`).                          |

`participants` is a **layout hint, never a restriction**: omit it and lifelines
order by first appearance; list a subset and unlisted aliases are appended.

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

| Field       | Type                                         | Required | Rule                                                         |
|-------------|-----------------------------------------------|----------|---------------------------------------------------------------|
| `message`   | kebab-case string, ≤ 64 chars                 | yes      | Logical message name — the arrow label, **not** an SRN.       |
| `from`      | participant alias                             | yes      | Declared in the protocol (`E_PROTO_WF_ALIAS`).                |
| `to`        | alias, or a list of aliases when `kind: event` | yes     | A list on a non-`event` step is `E_PROTO_WF_FANOUT`.          |
| `kind`      | `call \| return \| event \| error`            | no       | Default `call`.                                                |
| `payload`   | SRN reference                                 | no       | MUST resolve to a `datamodel` (`E_PROTO_PAYLOAD_KIND`); SHOULD pin `@version`. |
| `channel`   | string                                        | no       | Topic / queue / routing-key / path this message travels on.   |
| `condition` | string, ≤ 120 chars                           | no       | Display-only guard label. Creates **no** branch.              |
| `note`      | string, ≤ 200 chars                           | no       | Rendered as a UML note anchored to the step.                  |

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
|----------|--------------------------------------------|----------------------|
| `call`   | solid line, filled arrowhead               | synchronous message  |
| `return` | dashed line, open arrowhead                | reply message        |
| `event`  | solid line, open arrowhead                 | asynchronous signal  |
| `error`  | dashed line, open arrowhead, error styling | failure reply        |

No `par` fragments, gateways, pools/swimlanes, timers, compensation,
sub-workflow invocation, or data objects — each turns a sequence description
into BPMN. Where one is genuinely needed: split into several workflows, or model
the ordering constraint in `states.json`.

### Workflow validation

| #   | Rule                                                                     | Class                       |
|-----|---------------------------------------------------------------------------|------------------------------|
| W1  | Parses and matches the field tables (unknown non-`x-` key, bad type).    | `E_PROTO_WF_SCHEMA`          |
| W2  | `name` equals the filename stem.                                          | `E_PROTO_WF_NAME`            |
| W3  | Exactly one discriminator key per step node.                              | `E_PROTO_WF_STEP_SHAPE`      |
| W4  | Every `from`/`to`/`participants` alias is declared in the protocol.       | `E_PROTO_WF_ALIAS`           |
| W5  | Every `steps` list is non-empty.                                          | `E_PROTO_WF_EMPTY_BRANCH`    |
| W6  | Fragment nesting depth ≤ 3.                                               | `E_PROTO_WF_DEPTH`           |
| W7  | List-valued `to` only on `kind: event`.                                   | `E_PROTO_WF_FANOUT`          |
| W8  | `payload` resolves to a `datamodel`.                                      | `E_SRN_DANGLING` / `E_PROTO_PAYLOAD_KIND` |
| W9  | `channel` matches a `name`/`queue`/`routing-key`/`path` in the transport surface list. | `W_PROTO_WF_CHANNEL_UNKNOWN` |
| W10 | A `return`/`error` is preceded, in the same or an enclosing fragment, by a `call` in the opposite direction. | `W_PROTO_WF_ORPHAN_RETURN` |

W9 is skipped entirely when `transport.yaml` is absent or declares no surface
list — a linked OpenAPI file is not parsed in v1, so there is nothing to check
against, and the absence of a check is not a warning.

## `states.json` — the XState subset

An **XState v5 machine configuration**, directly loadable by `createMachine()` —
that is the point of pinning a subset rather than inventing a format. It
describes the state of **one conversation as the protocol sees it**, never the
internal state of a participant (that belongs to the implementing component).
Exactly one machine per protocol.

Root: `id` (MUST equal the protocol entity `name` — `E_PROTO_STATES_ID`),
`initial` (a key of `states`), `states`, optional `description`.

State node:

| Key           | Type                        | Required                    | Notes                                    |
|---------------|-----------------------------|-----------------------------|-------------------------------------------|
| `states`      | object                      | no                          | Makes the node compound; nesting allowed. |
| `initial`     | string                      | yes iff `states` is present | A key of this node's `states`.            |
| `type`        | `"final"`                   | no                          | The only legal value; a final state MUST have no `on`. |
| `on`          | object, event → transition  | no                          | See below.                                |
| `entry`/`exit`| string or list of strings   | no                          | Action names, plain strings.              |
| `tags`        | list of kebab-case strings  | no                          | Free facets; the portal may colour by tag.|
| `description` | string                      | no                          | Rendered inside the state box.            |

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

| Referring file               | Resolves to                                            |
|------------------------------|---------------------------------------------------------|
| `index.md`                   | `srn://acme/product/shop/datamodel/order@1`             |
| `transport.yaml`             | `srn://acme/product/shop/datamodel/order@1`             |
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

| Element                                                                    | Contract surface? | Consequence                             |
|-----------------------------------------------------------------------------|-------------------|------------------------------------------|
| A `participants` entry                                                     | yes               | Removing one requires a swap.            |
| A surface entry and its `request`/`response`/`message`                     | yes               | Removing or repointing requires a swap.  |
| `transport.kind` and the binding block's addressing fields                 | yes               | Changing the wire requires a swap.       |
| A message `name` and its `payload`, anywhere in `workflows/`               | yes               | Removing or repointing requires a swap.  |
| A state, its `type: final`, a transition's event + target                  | yes               | Removing requires a swap.                |
| `title`, `summary`, `note`, `condition`, `when`, `while`, `role`, `tags`, `description`, prose, step order | no | Metadata: bump `version`, no swap. |

Adding a participant, a workflow file, a step, a surface entry, a state, or a
transition is additive and always legal. Every change in either row bumps the
entity's `version`.

## What the portal derives

| View                       | Inputs                                                                          |
|----------------------------|----------------------------------------------------------------------------------|
| Participant graph          | `exposes`/`uses` (edges + direction); `participants` (aliases, roles)            |
| Sequence diagram           | one per `workflows/*.yaml`, plus `participants` for lifeline labels              |
| State chart                | `states.json` — final states double-bordered, guards `[g]`, actions `/ a`        |
| Message × datamodel matrix | every `payload` in the workflows and every `request`/`response`/`message` in the surface list |
| Transport card             | `transport.yaml`, including a link to `spec.file`                                |

The matrix is bidirectional in presentation only: "carried by these protocols"
on a datamodel page is a **derived inverse**, never authored on the datamodel.

## Protocol error classes

| Code                              | Meaning                                                                       |
|-----------------------------------|--------------------------------------------------------------------------------|
| `E_PROTO_PARTICIPANTS`            | `participants` missing or with fewer than 2 entries.                          |
| `E_PROTO_ALIAS_DUP`               | Two participants share an `alias`.                                            |
| `E_PROTO_PARTICIPANT_KIND`        | A participant `ref` resolves to a kind other than component/product/actor.     |
| `E_PROTO_TRANSPORT_SCHEMA`        | `transport.yaml` violates the top-level field table.                          |
| `E_PROTO_TRANSPORT_BINDING`       | Binding block key ≠ `kind`, block missing, or a required binding field absent.|
| `E_PROTO_TRANSPORT_SPEC_CONFLICT` | `spec` and a surface list both present.                                       |
| `E_PROTO_SPEC_FILE`               | `spec.file` does not exist, is absolute, or escapes the entity directory.     |
| `E_PROTO_WF_SCHEMA`               | Workflow file violates the field tables.                                      |
| `E_PROTO_WF_NAME`                 | Workflow `name` ≠ filename stem.                                              |
| `E_PROTO_WF_STEP_SHAPE`           | Step node lacks exactly one of `message`/`alt`/`opt`/`loop`.                  |
| `E_PROTO_WF_ALIAS`                | `from`/`to`/`participants` names an undeclared alias.                         |
| `E_PROTO_WF_EMPTY_BRANCH`         | A `steps` list is empty.                                                      |
| `E_PROTO_WF_DEPTH`                | Fragment nesting deeper than 3.                                               |
| `E_PROTO_WF_FANOUT`               | List-valued `to` on a step whose `kind` is not `event`.                       |
| `E_PROTO_PAYLOAD_KIND`            | A payload ref resolves to a non-datamodel.                                    |
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

Codes from `srn.md`, `structure.md`, `frontmatter.md` and `evolution.md` apply
unchanged — in particular `E_FM_SCHEMA` covers every type or enum violation of
the protocol's frontmatter fields, `E_SRN_DANGLING` every unresolvable
reference, and `W_STRUCT_PROTOCOL_NCA` a protocol below its participants' NCA.
All are enforced at portal build/load; there is no CLI in v1.
