---
name: protocol-design
description: This skill should be used when the user asks to "add a protocol", "describe how these components talk", "write transport.yaml", "add a workflow to a protocol", "draw a sequence diagram from the catalog", "add states.json", "write the XState machine for a conversation", "bind an OpenAPI or AsyncAPI file", "declare participants and aliases", "pick point-to-point vs bus vs request-response", or asks where a protocol directory belongs — in a metaframework solution catalog under `solutions/`.
---

# Authoring a protocol

A protocol says who talks, over which wire, in what order, and through which
conversation states. It is the richest kind in the ontology and feeds the most
derived views: the participant graph, one sequence diagram per workflow, a state
chart, and the message × datamodel matrix.

Four files, all optional except `index.md`. A protocol with only `index.md` is
legal — an intent-level protocol under design that derives no diagrams.

```text
solutions/acme/protocol/settlement/
├── index.md              REQUIRED   frontmatter + prose
├── transport.yaml        OPTIONAL   the wire binding — exactly one transport
├── states.json           OPTIONAL   XState-subset conversation machine
├── openapi.yaml          OPTIONAL   external spec, recognised by being linked from transport.yaml
└── workflows/            OPTIONAL   asset dir, never an entity, no index.md at any depth
    └── settle-order.yaml            one workflow; name = filename stem
```

## Where the rules live

**Read `framework/spec/kinds/protocol.md` in full when the repository has it —
it is authoritative and it is the largest kind document in the spec.** The
shared bundle carries protocol placement and artifact rules (`structure.md`) and
the `participants` / `style` / `conforms-to` frontmatter (`frontmatter.md`), but
deliberately **no** distillation of the three mini-languages. Those live in this
skill's own `references/artifacts.md`, which is the fallback when the repo spec
is absent.

| Need                                                     | Read                                                              |
|----------------------------------------------------------|-------------------------------------------------------------------|
| `transport.yaml`, workflow YAML, `states.json` in detail | `references/artifacts.md`                                          |
| A complete protocol, verbatim, with an audit checklist   | `references/worked-protocol.md`                                    |
| NCA placement, artifact filenames, `x-` escape           | `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/structure.md`    |
| `participants`, `style`, `conforms-to`, relations        | `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/frontmatter.md`  |
| Payload reference syntax, the `..` arithmetic            | `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/srn.md`          |
| Version bumps, the swap procedure                        | `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/evolution.md`    |
| Payload datamodels                                       | the `model-data` skill                                            |

## Procedure

1. **List the participants** — the entities, then an alias for each.
2. **Compute the NCA** from the component/product participants; that is the
   directory. Actors are excluded.
3. **Check the back-edges** on each component/product participant.
4. **Pick `style`** with the decision rule below.
5. **Write `index.md`.**
6. **Write `transport.yaml`** — one transport; external spec link **XOR**
   surface list.
7. **Write `workflows/*.yaml`** — one file per named exchange.
8. **Write `states.json`** only if the conversation has states worth naming.
9. **Run the catalog check** and report the result.

## 1 & 3. Participants, aliases, and who owns which fact

`participants` is a list of `{ alias, ref, role? }`, at least two entries
(`E_PROTO_PARTICIPANTS`), aliases kebab-case and unique
(`E_PROTO_ALIAS_DUP`), each `ref` resolving to a **component, product, or actor**
(`E_PROTO_PARTICIPANT_KIND`). A participant carries no title — the portal labels
the lifeline from the target entity, so copying a title here only drifts.

**The component side owns the edge; the protocol side owns the alias.** Both
facts exist and neither is redundant:

| Concern                                                       | Authoritative source                       |
|---------------------------------------------------------------|--------------------------------------------|
| Who is in the graph, and which direction each edge runs       | `exposes` / `uses` on the component or product |
| The alias namespace used by `workflows/*.yaml` and the lifelines | `participants` in the protocol's `index.md` |
| Where the protocol directory sits                             | `participants`, filtered to component/product refs |

So writing `participants` is only half the job: the provider component needs
`relations.exposes: [<this protocol>]` and each consumer needs
`relations.uses: [<this protocol>]`, in their own `index.md`. Missing back-edge
is `W_PROTO_PARTICIPANT_UNLINKED`; a component that declares the edge but is
absent from `participants` is `W_PROTO_PARTICIPANT_MISSING`. Both are warnings
because during a swap one side legitimately moves first.

**Actors are exempt from both warnings** — they are personas and external
systems, not catalogued implementations. An external system outside the catalog
(a payment service provider, a broker that is not a component) participates *as
an actor*: `ref: /actor/psp-acquirer`. There is no external-system kind in v1.

## 2. NCA placement — take the prefix pair by pair

A protocol lives at the nearest common ancestor of its **component and product**
participants, computed over whole `{kind}/{name}` **pairs**, never over raw
segments. Taking a prefix at a bare segment lands on a bucket, and a bucket has
no SRN and cannot hold an `index.md`. Four of the shipped protocols, one per
placement outcome:

```text
checkout + inventory + payment                    → product/shop
  solutions/acme/product/shop/protocol/order-placement/

checkout + checkout/tax-engine                    → product/shop + component/checkout
  solutions/acme/product/shop/component/checkout/protocol/tax-quoting/

payment + billing/ledger + billing/reconciliation → (empty: products diverge)
  solutions/acme/protocol/settlement/

support-agent (actor, excluded) + billing/ledger  → that one component
  solutions/acme/product/billing/component/ledger/protocol/refund-request/
```

Row three is why the rule is pairwise: shop and billing share the literal segment
`product`, but `product` alone is a bucket, so the shared prefix is empty and the
protocol belongs at the solution root. Row four is why actors are excluded — they
are solution-level, so counting them collapses every protocol to the root.

Below the NCA is `W_STRUCT_PROTOCOL_NCA` (a warning: the participant list may
lead the directory by a commit during a swap). But adding a participant that
moves the NCA does **not** license a `git mv` — entities are never moved. Getting
the NCA wrong at creation costs a swap.

## 4. `style` — one axis, three values

Apply in order; the rule is total and non-overlapping:

| Question                                            | Answer | `style`            |
|-----------------------------------------------------|--------|--------------------|
| Does the sender name the receiver?                  | no     | `bus`              |
| …and does the protocol contract a correlated reply? | yes    | `request-response` |
| …otherwise                                          | —      | `point-to-point`   |

The value is deliberately coarse — it drives navigation, filtering, and the
default diagram layout, nothing else. Precision lives one level down, in
`transport.kind` and each step's `kind`. **`style` and `transport.kind` are
different axes**: `tax-quoting` is `style: request-response` over
`kind: in-process`, and that is not a contradiction.

Two lints, both warnings: `style: bus` with any `kind: call` step, and
`style: request-response` with no `call`/`return` pair anywhere, are each
`W_PROTO_STYLE_MISMATCH`.

## 6. `transport.yaml`

One protocol, **one transport**. A protocol offered over two wire technologies
is two protocol entities. A second binding block is
`E_PROTO_TRANSPORT_BINDING`, not a shortcut.

Top level: `kind` (required, from the closed set below), a mapping keyed by
**exactly** the `kind` value (required), plus optional `summary`, `encoding`
(`json|avro|protobuf|msgpack|xml|text|binary`), `auth` (display-only labels),
and `spec`. Anything else non-`x-` is `E_PROTO_TRANSPORT_SCHEMA`.

| `kind`       | Required binding fields          | Surface list key |
|--------------|----------------------------------|------------------|
| `http`       | `base-path`                      | `operations`     |
| `grpc`       | `package`, `service`             | `methods`        |
| `amqp`       | `exchange`, `exchange-type`      | `bindings`       |
| `kafka`      | — (`topics` required unless `spec`) | `topics`      |
| `websocket`  | `path`                           | `channels`       |
| `in-process` | `language`, `module`             | `functions`      |

**`spec` and the surface list are mutually exclusive**
(`E_PROTO_TRANSPORT_SPEC_CONFLICT`). Either point at a real OpenAPI / AsyncAPI /
`.proto` file and let it be the single source of operation truth, or — when no
such file exists — write the lightweight list here. Maintaining both guarantees
divergence. `spec` is `{ format, file, version? }`; `file` is relative to the
entity directory and may not be absolute or contain `..` (`E_PROTO_SPEC_FILE`).
In v1 the portal renders the linked file as an opaque card and does not parse it.

The shipped HTTP protocols show both halves of that choice:
`order-placement/transport.yaml` and `authorization-check/transport.yaml` write
an `operations` list because there is no OpenAPI document;
`refund-request/transport.yaml` and `carrier-booking/transport.yaml` link an
`openapi.yaml` and carry no list.

`conforms-to` in the frontmatter is for **standards** (RFC 9457, CloudEvents),
never for files. A file in the directory is bound here under `spec`, in one place.

Two shape rules that also apply to `workflows/*.yaml`: **no top-level `version:`
key** — artifacts carry no version of their own, the entity's frontmatter governs
the whole directory — and unknown keys at any level are rejected unless `x-`
prefixed.

## 7. The workflow mini-language

`workflows/<name>.yaml`, `<name>` kebab-case, `name` equal to the filename stem
(`E_PROTO_WF_NAME`). Top level: `name`, `title`, `steps` (required, non-empty),
`summary` and `participants` (optional; a layout hint, a subset of the protocol's
aliases, never a restriction).

A step node carries **exactly one discriminator key** from `message`, `alt`,
`opt`, `loop` (`E_PROTO_WF_STEP_SHAPE`). `otherwise` is the one permitted
companion, only alongside `alt`.

Message step: `message` (kebab-case name — the arrow label), `from`, `to`,
optional `kind` (`call|return|event|error`, default `call`), `payload`,
`channel`, `condition`, `note`. `from` and `to` may be the same alias — a
self-call. `to` may be a **list only on `kind: event`** (`E_PROTO_WF_FANOUT`).

### The two traps

**`condition` annotates one arrow; `alt` and `opt` change the sequence.**
`condition` renders as `[guard] message` and the next step still follows
unconditionally. If two futures diverge, use `alt`. If steps may be skipped, use
`opt`. An `alt` needs at least **two compartments**, counting `otherwise` as one
— a single branch with no `otherwise` is an `opt`, and the two mean different
things (`opt`: may be skipped; `alt`: exactly one compartment runs).

**`message` means two different things in two files.** In a workflow step it is a
kebab-case logical name and the SRN lives in the separate `payload` key. In a
`transport.yaml` surface entry it *is* the SRN of the datamodel the topic or
queue carries — the same role `request`/`response` play for call-shaped
transports. A step `message` that looks like an SRN is `E_PROTO_WF_SCHEMA`; a
topic `message` that is a bare name is `E_PROTO_TRANSPORT_SCHEMA`.

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

## 8. `states.json` — the XState subset

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

## 9. Payload binding

Every payload reference — a step's `payload`, and a surface entry's `request`,
`response`, or `message` — is an ordinary **SRN**, not a schema URL. It must
resolve to a `datamodel` (`E_PROTO_PAYLOAD_KIND`) and **should pin `@version`**:
an unpinned reference silently follows the target's latest, so a contract
reviewed against `order@2` starts describing `order@3` with no diff on this file.

Pinning works here and not in a `schema.json` `$ref` precisely because these are
framework-private catalog references that no external tool reads, while
`schema.json` must stay dereferenceable by stock JSON Schema tooling.

**Write payload references path-absolute** (`/product/shop/datamodel/order@1`).
A relative reference resolves against the referring *file's* URI, so the same
text means different things in `transport.yaml` and in `workflows/x.yaml` — the
workflow file is one level deeper. Worse, the failure profile is asymmetric: an
off-by-one miscount makes the segment count odd and is always rejected, but an
off-by-two stays grammatical and resolves to a *different, legal* entity —
surfacing as `E_SRN_DANGLING` if nothing is there, and as a silently wrong edge
if something is. Path-absolute removes the only case the grammar cannot catch.

`states.json` carries no SRN references at all — it names events and states only.

## Complete worked protocol — `srn://acme/protocol/settlement`

Verbatim from `solutions/acme/protocol/settlement/`. A `bus` protocol at the
solution root, Kafka transport with an authoritative surface list, one workflow
with fan-out, and a compound state machine.

`index.md` frontmatter:

```yaml
---
name: settlement
kind: protocol
version: 2
title: Settlement
summary: Event bus carrying paid orders from shop into billing, and ledger postings onward to reconciliation.
status: approved
owner: team-billing
style: bus
participants:
  - alias: payment
    ref: /product/shop/component/checkout/component/payment
    role: publisher
  - alias: ledger
    ref: /product/billing/component/ledger
    role: consumer
  - alias: reconciliation
    ref: /product/billing/component/reconciliation
    role: consumer
conforms-to:
  - standard: CloudEvents
    version: "1.0.2"
    url: https://cloudevents.io/
relations:
  uses:
    - /environment/production
tags:
  - settlement
  - asynchronous
---
```

The counterpart edges live on the participants, not here:
`payment` carries `exposes: [/protocol/settlement]`, `ledger` and
`reconciliation` each carry `uses: [/protocol/settlement]`. `relations` on the
protocol holds only the **non-payload** dependency — the payload datamodels are
deliberately absent, because the message × datamodel matrix is derived.

`transport.yaml`:

```yaml
kind: kafka
summary: Settlement facts published by shop and consumed by billing.
encoding: avro
auth:
  - sasl-scram
  - mtls
kafka:
  cluster: acme-settlement
  topics:
    - name: acme.settlement.order-paid.v1
      key: order-id
      message: /product/shop/component/checkout/component/payment/datamodel/order@3
      partitions: 12
      retention: 30d
      summary: Emitted once an order reaches the paid state and funds are captured.
    - name: acme.settlement.ledger-entry-posted.v1
      key: order-id
      message: /product/billing/datamodel/ledger-entry@1
      partitions: 12
      retention: 30d
      summary: One event per posted double-entry leg, published by the ledger.
    - name: acme.settlement.reconciliation-report.v1
      key: batch-id
      partitions: 1
      retention: 90d
      summary: Nightly reconciliation outcome; its payload model is still under design.
```

`workflows/settle-order.yaml`:

```yaml
name: settle-order
title: Settle a paid order
summary: Payment publishes a paid order; the ledger posts it and reconciliation proves the batch balances.
participants: [payment, ledger, reconciliation]
steps:
  - message: order-paid
    from: payment
    to: [ledger, reconciliation]
    kind: event
    payload: /product/shop/component/checkout/component/payment/datamodel/order@3
    channel: acme.settlement.order-paid.v1
    note: Published after funds are captured, never before — a reversal is a new fact.

  - message: ledger-entry-posted
    from: ledger
    to: [reconciliation]
    kind: event
    payload: /product/billing/datamodel/ledger-entry@1
    channel: acme.settlement.ledger-entry-posted.v1
    condition: one event per leg, debit and credit

  - opt:
      when: the nightly reconciliation window is open
      steps:
        - message: reconciliation-report
          from: reconciliation
          to: [payment, ledger]
          kind: event
          channel: acme.settlement.reconciliation-report.v1
          note: Carries no payload model yet; consumers read the topic headers only.
```

`states.json`, with the per-state `description` strings elided for width — note
the compound `posting` node carrying its own `initial`, and the absolute
`#settlement.<state>` targets used to leave it:

```json
{
  "id": "settlement",
  "initial": "awaiting-payment",
  "description": "State of the settlement of one order, as the billing side sees it.",
  "states": {
    "awaiting-payment": {
      "on": {
        "ORDER_PAID": {
          "target": "posting",
          "actions": ["open-settlement-window"],
          "description": "First fact for this order id; the window opens here."
        }
      }
    },
    "posting": {
      "initial": "entry-pending",
      "entry": ["reserve-batch-slot"],
      "states": {
        "entry-pending": {
          "on": {
            "LEDGER_ENTRY_POSTED": [
              { "target": "entry-posted", "guard": "debit and credit both accepted" },
              { "target": "#settlement.disputed", "actions": ["raise-imbalance"] }
            ]
          }
        },
        "entry-posted": {
          "on": {
            "RECONCILIATION_REPORT": [
              { "target": "#settlement.settled", "guard": "batch balances to zero" },
              { "target": "#settlement.disputed", "actions": ["raise-imbalance"] }
            ]
          }
        }
      }
    },
    "settled":  { "type": "final", "tags": ["success"] },
    "disputed": { "type": "final", "tags": ["failure"] }
  }
}
```

**Audit — run this checklist on any protocol you write.**

- Placement: participant pair prefixes are `product/shop + component/checkout +
  component/payment`, `product/billing + component/ledger`, and
  `product/billing + component/reconciliation`. The common prefix is empty, so
  the NCA is the solution root — which is where the directory sits.
- Back-edges: all three component participants declare `exposes` or `uses` for
  this protocol, so no `W_PROTO_PARTICIPANT_UNLINKED`.
- Style: `bus`, and every step is `kind: event` with no `call` anywhere — no
  `W_PROTO_STYLE_MISMATCH`. The list-valued `to` is legal precisely because the
  steps are events.
- Transport: `topics` is present and `spec` is absent, so no
  `E_PROTO_TRANSPORT_SPEC_CONFLICT`. The third topic declares no `message`,
  which is legal — a surface entry's payload is optional.
- Channels: all three `channel` values match topic `name`s, so W9 passes.
- States: `id` equals `name`; every event matches the name regex and maps to a
  message in the workflow (`ORDER_PAID` ⇔ `order-paid`, `LEDGER_ENTRY_POSTED` ⇔
  `ledger-entry-posted`, `RECONCILIATION_REPORT` ⇔ `reconciliation-report`);
  every state is reachable; both finals carry no `on`.
- Payloads: path-absolute and pinned; both target `datamodel` entities.

For the fragment forms this workflow does not exercise — nested `alt` with
`otherwise`, `loop` with `max`, and a self-call — read
`solutions/acme/product/shop/protocol/order-placement/workflows/place-order.yaml`,
which sits exactly at the depth-3 ceiling.

## Evolving a protocol

Contract surface — removing or repointing any of these requires a **swap**, never
an in-place edit: a `participants` entry; a surface list entry and its
`request`/`response`/`message`; `transport.kind` and the binding block's
addressing fields; a message `name` and its `payload` ref; a state, its
`type: final`, and a transition's event and target.

Metadata — bump `version`, no swap: `title`, `summary`, `note`, `condition`,
`when`, `while`, `role`, `tags`, `description`, prose, and step order within a
workflow.

Adding a participant, a workflow file, a step, a surface entry, a state, or a
transition is additive and always legal. Every change in either category bumps
the entity's `version`, including a change to a single artifact file.

## Finish

Every run that writes files ends here:

```bash
cd framework/portal && npx vitest run src/lib/catalog
```

Zero **error** diagnostics is the pass condition; there is no CLI. Report
pass/fail and every diagnostic with its code and file. `E_PROTO_*` and
`W_PROTO_*` codes are documented at the end of
`framework/spec/kinds/protocol.md`. If a diagnostic demands removing, renaming,
narrowing or moving an entity, that is not a fix — stop and say it requires a
swap.
