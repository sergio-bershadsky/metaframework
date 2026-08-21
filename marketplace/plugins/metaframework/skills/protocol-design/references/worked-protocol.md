# A complete protocol — `srn://acme/protocol/settlement`

> Reproduced **verbatim** from `solutions/acme/protocol/settlement/`: the
> `index.md` frontmatter (its prose body is not reproduced — the heading below
> says so) and then all three artifact files, complete and unabridged, dialect
> header included. Nothing is elided. When the repository is present, read the
> originals; this copy exists because an installed plugin cannot see them.

A `bus` protocol at the solution root: Kafka transport with an authoritative
surface list, one workflow with fan-out, and a compound state machine. Read it
alongside `references/artifacts.md`, which carries the rules each file obeys.

Each of the three artifacts opens with its `$schema` dialect header, and that
first line is part of what you are copying. The three URLs differ — one names
`transport-document`, one `workflow-document`, one `state-machine-document` —
because the key declares the grammar of *that file*, not of the protocol.

## `index.md` frontmatter

```yaml
---
name: settlement
kind: protocol
version: 3
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

The counterpart edges live on the participants, not here: `payment` carries
`exposes: [/protocol/settlement]`, `ledger` and `reconciliation` each carry
`uses: [/protocol/settlement]`. `relations` on the protocol holds only the
**non-payload** dependency — the payload datamodels are deliberately absent,
because the message × datamodel matrix is derived from the artifacts below.

## `transport.yaml`

```yaml
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/transport-document
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

## `workflows/settle-order.yaml`

```yaml
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/workflow-document
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

## `states.json`

Note the compound `posting` node carrying its own `initial`, and the absolute
`#settlement.<state>` targets used to leave it.

```json
{
  "$schema": "https://schemas.metaframework.dev/metaframework/product/specification/datamodel/state-machine-document",
  "id": "settlement",
  "initial": "awaiting-payment",
  "description": "State of the settlement of one order, as the billing side sees it.",
  "states": {
    "awaiting-payment": {
      "description": "The order exists in shop but no payment fact has arrived.",
      "on": {
        "ORDER_PAID": {
          "target": "posting",
          "actions": ["open-settlement-window"],
          "description": "First fact for this order id; the window opens here."
        }
      }
    },
    "posting": {
      "description": "The ledger is turning the payment fact into double-entry legs.",
      "initial": "entry-pending",
      "entry": ["reserve-batch-slot"],
      "states": {
        "entry-pending": {
          "description": "Legs computed, not yet acknowledged by the ledger store.",
          "on": {
            "LEDGER_ENTRY_POSTED": [
              { "target": "entry-posted", "guard": "debit and credit both accepted" },
              { "target": "#settlement.disputed", "actions": ["raise-imbalance"] }
            ]
          }
        },
        "entry-posted": {
          "description": "Both legs are durable; the batch awaits reconciliation.",
          "on": {
            "RECONCILIATION_REPORT": [
              { "target": "#settlement.settled", "guard": "batch balances to zero" },
              { "target": "#settlement.disputed", "actions": ["raise-imbalance"] }
            ]
          }
        }
      }
    },
    "settled": {
      "type": "final",
      "tags": ["success"],
      "description": "Order and ledger agree; the settlement window is closed."
    },
    "disputed": {
      "type": "final",
      "tags": ["failure"],
      "description": "A human owns it now — see the audit-trail requirement."
    }
  }
}
```

## Audit — run this checklist on any protocol you write

- **Placement.** Participant pair prefixes are `product/shop + component/checkout
  + component/payment`, `product/billing + component/ledger`, and
  `product/billing + component/reconciliation`. The common prefix is empty, so
  the NCA is the solution root — which is where the directory sits.
- **Dialect.** Each of `transport.yaml`, `workflows/settle-order.yaml` and
  `states.json` carries its `$schema` as its **first** key, naming that file's
  grammar and no revision of it. An artifact that declares nothing still loads —
  it is read as the legacy dialect and warned with `W_ARTIFACT_DIALECT` on the
  entity, never broken — so this bullet is the one the checker cannot fail for
  you with an error.
- **Back-edges.** All three component participants declare `exposes` or `uses`
  for this protocol, so no `W_PROTO_PARTICIPANT_UNLINKED`.
- **Style.** `bus`, and every step is `kind: event` with no `call` anywhere — no
  `W_PROTO_STYLE_MISMATCH`. The list-valued `to` is legal precisely because the
  steps are events.
- **Transport.** `topics` is present and `spec` is absent, so no
  `E_PROTO_TRANSPORT_SPEC_CONFLICT`. The third topic declares no `message`,
  which is legal — a surface entry's payload is optional.
- **Channels.** All three `channel` values match topic `name`s, so
  `W_PROTO_WF_CHANNEL_UNKNOWN` does not fire.
- **States.** `id` equals `name`; every event matches `^[A-Z][A-Z0-9_]*$` and
  maps to a message in the workflow (`ORDER_PAID` ⇔ `order-paid`,
  `LEDGER_ENTRY_POSTED` ⇔ `ledger-entry-posted`, `RECONCILIATION_REPORT` ⇔
  `reconciliation-report`); every state is reachable; both finals carry no `on`.
- **Payloads.** Path-absolute and pinned; both target `datamodel` entities.

## Where to read the forms this one does not exercise

- Nested `alt` with `otherwise`, `loop` with `max`, and a self-call —
  `solutions/acme/product/shop/protocol/order-placement/workflows/place-order.yaml`,
  which sits exactly at the depth-3 ceiling.
- An HTTP transport with an authoritative `operations` list —
  `solutions/acme/product/shop/protocol/order-placement/transport.yaml`.
- An HTTP transport that delegates to an external spec file instead —
  `solutions/acme/product/billing/component/ledger/protocol/refund-request/transport.yaml`
  with its sibling `openapi.yaml`.
- An `in-process` transport — `.../component/checkout/protocol/tax-quoting/transport.yaml`,
  which is `style: request-response` over `kind: in-process`, a pairing that is
  not a contradiction.
- An actor as a participant, and the NCA that follows from excluding it —
  `solutions/acme/product/billing/component/ledger/protocol/refund-request/index.md`.
