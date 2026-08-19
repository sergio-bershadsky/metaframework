# The three protocol mini-languages

> `transport.yaml`, `workflows/*.yaml` and `states.json` are the only formats the
> framework invents for itself, and the shared reference bundle at
> `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/` deliberately carries **no**
> distillation of them — it stops at placement and frontmatter. This file is that
> distillation. **When `framework/spec/kinds/protocol.md` is present in the
> repository it is authoritative and wins over this file**; it is the largest kind
> document in the spec and worth reading in full before authoring a protocol.

All three artifacts are optional. A protocol with only `index.md` is legal — an
intent-level protocol under design, which simply derives no diagrams.

Two shape rules bind `transport.yaml` and `workflows/*.yaml` alike: **no
top-level `version:` key** (artifacts carry no version of their own; the
entity's frontmatter governs the whole directory), and unknown keys at any level
are rejected unless `x-` prefixed. `states.json` is the exception to the second
— see its section.

## `transport.yaml` — the wire binding

One protocol, **one transport**. A protocol offered over two wire technologies is
two protocol entities. A second binding block is `E_PROTO_TRANSPORT_BINDING`, not
a shortcut.

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

| Transport    | Entry fields                                                                          |
|--------------|---------------------------------------------------------------------------------------|
| `http`       | `name` (kebab), `method`, `path` (may contain `{param}`), `request`, `response`, `summary` |
| `grpc`       | `name`, `request`, `response`, `streaming` (`none`/`client`/`server`/`bidi`), `summary` |
| `amqp`       | `routing-key`, `queue`, `message`, `summary`                                           |
| `kafka`      | `name`, `key`, `message`, `partitions`, `retention`, `summary`                          |
| `websocket`  | `name` (kebab), `direction` (`client-to-server`/`server-to-client`/`bidi`), `message`, `summary` |
| `in-process` | `name`, `request`, `response`, `summary`                                                |

`request`, `response` and `message` are payload references — ordinary SRNs, see
"Payload binding" in `SKILL.md`. A surface entry's payload is **optional**; the
third topic of the shipped `settlement/transport.yaml` deliberately has none,
because its model is still under design.

### `spec` XOR the surface list

**`spec` and the surface list are mutually exclusive**
(`E_PROTO_TRANSPORT_SPEC_CONFLICT`). Either point at a real OpenAPI / AsyncAPI /
`.proto` file and let it be the single source of operation truth, or — when no
such file exists — write the lightweight list here. Maintaining both guarantees
divergence.

`spec` is `{ format, file, version? }`; `file` is relative to the entity
directory and may not be absolute or contain `..` (`E_PROTO_SPEC_FILE`). In v1
the portal renders the linked file as an opaque card and does not parse it. Such
a file is named by the external tool's convention (`openapi.yaml`,
`pricing.proto`), not by the framework's bare-filename rule.

The shipped HTTP protocols show both halves of the choice:
`order-placement/transport.yaml` and `authorization-check/transport.yaml` write
an `operations` list; `refund-request/transport.yaml` and
`carrier-booking/transport.yaml` link an `openapi.yaml` and carry no list.

`conforms-to` in the frontmatter is for **standards** (RFC 9457, CloudEvents),
never for files. A file in the directory is bound here under `spec`, in one
place.

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
# transport.yaml — "message" is the payload SRN
topics:
  - name: acme.settlement.order-paid.v1
    message: /product/shop/component/checkout/component/payment/datamodel/order@3
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

Two more checks worth knowing: `channel` must match a `name` / `queue` /
`routing-key` / `path` in the transport surface list
(`W_PROTO_WF_CHANNEL_UNKNOWN`; skipped entirely when there is no surface list),
and a `return`/`error` should be preceded by a `call` in the opposite direction
in the same or an enclosing fragment (`W_PROTO_WF_ORPHAN_RETURN`).

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

`states.json` carries no SRN references at all — it names events and states only.
