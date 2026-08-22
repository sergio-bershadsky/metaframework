# A complete protocol — `srn://acme/protocol/settlement`

> Reproduced **verbatim** from `solutions/acme/protocol/settlement/`: the
> `index.md` frontmatter (its prose body is not reproduced — the heading below
> says so) and then all four artifact files, complete and unabridged, dialect
> header and comments included. Nothing is elided. Every block below is
> generated from the file on disk, never hand-copied. When the repository is
> present, read the originals; this copy exists because an installed plugin
> cannot see them.
>
> Each block carries an HTML comment naming its source
> (`<!-- verbatim: solutions/acme/protocol/settlement/transport.yaml -->`), and
> `framework/portal/scripts/repo-hygiene.mjs` byte-compares every one of them
> against the catalog on every push — so "never hand-copied" is enforced rather
> than promised.

A `bus` protocol at the solution root: a Kafka transport written as an **AsyncAPI
3.1.0 document**, one workflow with fan-out, a compound state machine, and an
**Arazzo Description** of one participant's path across the bus. Read it
alongside `references/artifacts.md`, which carries the rules each file obeys.

Each of the four artifacts opens with a dialect header, and that first line is
part of what you are copying — but they are **not the same key**, and that is the
lesson this protocol carries that no other file states as plainly. `states.json`
and `workflows/settle-order.yaml` are written in framework mini-specs, so each
carries the framework's `$schema` at a different meta-schema URL — one
`state-machine-document`, one `workflow-document`. `transport.yaml` is written in
the *other* dialect its role admits, so it carries AsyncAPI's own `asyncapi: 3.1.0`
and the framework adds nothing beside it. `arazzo.yaml` has only one dialect and
it is likewise the format's own, `arazzo: 1.1.0`. Same protocol, same directory,
same addresses; four files, two kinds of discriminator across three different
keys, because the key declares the grammar of *that file* and nothing else.

## `index.md` frontmatter

<!-- verbatim-excerpt: solutions/acme/protocol/settlement/index.md -->
```yaml
---
name: settlement
kind: protocol
version: 6
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

<!-- verbatim: solutions/acme/protocol/settlement/transport.yaml -->
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

## `workflows/settle-order.yaml`

<!-- verbatim: solutions/acme/protocol/settlement/workflows/settle-order.yaml -->
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

<!-- verbatim: solutions/acme/protocol/settlement/states.json -->
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

## `arazzo.yaml`

The one artifact of this protocol that is **grammar-free**: it is snapshotted
with the entity, served as authored, and judged by no field table, so no shape of
it can be wrong here — there is no published Arazzo 1.1 schema to check one
against. The portal still draws it — a step graph of each workflow, beside the
source — because reading a document to show it is not the same as checking it.

Exactly one rule does reach the file, and it is not a rule about Arazzo.
Grounding asks where the document's references *land*: `./transport.yaml` below
is a sibling this entity carries, and each `channelPath` names a channel that
transport declares. Break either and `metaframework check` reports
`W_PROTO_ARAZZO_UNGROUNDED` — see **Write it only where it can be grounded** in
[artifacts.md](artifacts.md).

It deprecates nothing. The sequence diagram still derives from
`workflows/settle-order.yaml`, the step graph is a second picture rather than a
replacement, and where the two descriptions disagree the workflow file wins.

Read the file's own comments for the decision that shapes it: an Arazzo
Description has one executor and a bus has none, so a file like this must name
whose path it describes and say where that fact came from.

<!-- verbatim: solutions/acme/protocol/settlement/arazzo.yaml -->
```yaml
# Arazzo Description — one participant's path across this bus. Grammar-free
# here: this framework snapshots and serves the file and judges it by no field
# table (kinds/protocol.md, "arazzo.yaml — the orchestration surface"). One
# rule does reach it — grounding: every source description must name a sibling
# artifact, and every operation or channel a step names must resolve inside
# one, or `metaframework check` raises W_PROTO_ARAZZO_UNGROUNDED. The portal
# reads the file to draw the step graph beside this source.
# workflows/settle-order.yaml stays the authoritative choreography, and the
# sequence diagram on this page derives from it alone.
#
# WHOSE PATH. An Arazzo Description has one executor; a bus has none. These
# workflows are written for `reconciliation`, the one participant of
# settle-order.yaml that both consumes and publishes on this bus, so it is the
# only side whose path is a sequence rather than a single publish. Payment's
# side is the first step alone, and the ledger's is the second.
#
# Steps reference channels by `channelPath`, not by `operationId`: transport.yaml
# declares no `operations` block, deliberately — its own comment says inventing a
# direction there would say more than the mini-spec it replaced. Direction is
# stated per step below instead, and it is taken from settle-order.yaml's
# `from`/`to`, which is where this catalog has always kept it.
arazzo: 1.1.0
info:
  title: Settlement
  summary: Reconciliation's path across the settlement bus.
  # Arazzo REQUIRES info.version. It is a field of a foreign format and not this
  # entity's clock — that is `version:` in index.md — so it carries the same
  # spelling transport.yaml gives AsyncAPI's equally-required info.version.
  version: unversioned
  description: >-
    Two workflows because settle-order.yaml describes two cadences: a per-order
    pair of facts that arrive as they happen, and a nightly report that is
    published inside a window. Writing them as one sequence would claim a report
    follows every settled order, which is the one thing the `opt` in that file
    says is not true.
sourceDescriptions:
  - name: transport
    type: asyncapi
    url: ./transport.yaml # a sibling artifact of this entity — always relative
workflows:
  - workflowId: observe-a-settlement
    summary: Take in the two facts one settled order produces.
    description: >-
      The first two steps of workflows/settle-order.yaml, seen from
      reconciliation. Both channels are keyed by order-id, so the pair for one
      order arrives in publication order on one partition — which is what makes
      the dependency below a real ordering rather than a hopeful one.
    steps:
      - stepId: receive-order-paid
        description: >-
          Published after funds are captured, never before; a reversal is a new
          fact rather than an edit. No successCriteria: this channel declares
          exactly one message and it is unambiguously the successful outcome,
          which is the case the Arazzo Specification allows the criteria to be
          omitted in.
        channelPath: "{$sourceDescriptions.transport.url}#/channels/order-paid"
        action: receive
      - stepId: receive-ledger-entry-posted
        description: >-
          One event per posted leg, debit and credit. settle-order.yaml draws
          this as caused by the paid order above, which is the dependency
          declared here.
        channelPath: "{$sourceDescriptions.transport.url}#/channels/ledger-entry-posted"
        action: receive
        dependsOn:
          - receive-order-paid
  - workflowId: publish-a-reconciliation-report
    summary: Publish the nightly outcome.
    description: >-
      The `opt` of workflows/settle-order.yaml, which fires on the nightly
      window rather than on a settled order. Arazzo carries no guard, so the
      window is stated here and enforced nowhere in this file.
    steps:
      - stepId: send-reconciliation-report
        description: >-
          This channel declares no messages map — transport.yaml withheld the
          payload model because the mini-spec it replaced named none — so no
          requestBody is spelled out here either.
        channelPath: "{$sourceDescriptions.transport.url}#/channels/reconciliation-report"
        action: send
```

## Audit — run this checklist on any protocol you write

- **Placement.** Participant pair prefixes are `product/shop + component/checkout
  + component/payment`, `product/billing + component/ledger`, and
  `product/billing + component/reconciliation`. The common prefix is empty, so
  the NCA is the solution root — which is where the directory sits.
- **Dialect.** Each artifact declares one as its **first** key, naming that
  file's grammar and no revision of it: `workflows/settle-order.yaml` and
  `states.json` carry the framework's `$schema` at their own meta-schema URLs,
  `transport.yaml` carries AsyncAPI's native `asyncapi: 3.1.0`, and `arazzo.yaml`
  carries Arazzo's native `arazzo: 1.1.0`. All are
  recognised, so `W_ARTIFACT_DIALECT` fires on none of them. An artifact that
  declares nothing still loads — read as the legacy dialect and warned on the
  entity, never broken — so this bullet is the one the checker cannot fail for
  you with an error.
- **Back-edges.** All three component participants declare `exposes` or `uses`
  for this protocol, so no `W_PROTO_PARTICIPANT_UNLINKED`.
- **Style.** `bus`, and every step is `kind: event` with no `call` anywhere — no
  `W_PROTO_STYLE_MISMATCH`. The list-valued `to` is legal precisely because the
  steps are events.
- **Transport profile.** All six AsyncAPI-dialect rules hold: `x-srn` equals the
  entity SRN, `info.title` equals the frontmatter `title`, `info.version` is the
  literal `unversioned`, `servers` has exactly one entry whose `protocol` is
  admitted for a `kafka` wire, `channels` is non-empty, and `operations` is
  absent — legal, and honest, because the mini-spec form this replaced recorded
  no direction to convert. `E_PROTO_TRANSPORT_SPEC_CONFLICT` cannot arise here:
  `spec` is a mini-spec key and this dialect has none. The third channel declares
  no `messages` map, which is legal — a channel's payload is optional — and it is
  the reason its `x-srn-partition-key` sits on the **Channel** rather than on a
  Message. That placement is the rule's one exception and applies only where a
  channel declares no `messages`; the other two keys in this file are on Messages,
  where they belong.
- **Channels.** All three workflow `channel` values match a channel `address`, so
  `W_PROTO_WF_CHANNEL_UNKNOWN` does not fire. In this dialect the channelId would
  have matched too; the `address` is written because that is the topic name a
  Kafka operator would recognise.
- **States.** `id` equals `name`; every event matches `^[A-Z][A-Z0-9_]*$` and
  maps to a message in the workflow (`ORDER_PAID` ⇔ `order-paid`,
  `LEDGER_ENTRY_POSTED` ⇔ `ledger-entry-posted`, `RECONCILIATION_REPORT` ⇔
  `reconciliation-report`); every state is reachable; both finals carry no `on`.
- **Payloads.** Path-absolute and pinned; both target `datamodel` entities.

## Where to read the forms this one does not exercise

- Nested `alt` with `otherwise`, `loop` with `max`, and a self-call —
  `solutions/acme/product/shop/protocol/order-placement/workflows/place-order.yaml`,
  which sits exactly at the depth-3 ceiling.
- **The mini-spec dialect of `transport.yaml`**, which this protocol no longer
  uses at all — an HTTP transport with an authoritative `operations` list, at
  `solutions/acme/product/shop/protocol/order-placement/transport.yaml`. Read it
  before you assume the field tables in `references/artifacts.md` describe the
  file above.
- **An AsyncAPI transport that does carry `operations`** —
  `solutions/brass/protocol/game-transport/transport.yaml`, a `websocket` wire.
  Its mini-spec form recorded `direction` on every entry, so there was something
  to convert: `client-to-server` became `receive` and `server-to-client` became
  `send`, read from the participant its root `id` names. It is also where the
  websocket channel rule is visible: its five mini-spec entries became **five
  channels**, not five messages on one, because W9 matches a workflow step's
  `channel:` against a channel `address` or channelId and its two workflows name
  all five. Two pairs share an `address` — three socket.io events across five
  channels — which is legal and is why each entry keeps its own channelId. Read
  its inline comments rather than assuming; they record why the file is shaped as
  it is.
- An HTTP transport that delegates to an external spec file instead —
  `solutions/acme/product/billing/component/ledger/protocol/refund-request/transport.yaml`
  with its sibling `openapi.yaml`.
- An `in-process` transport — `.../component/checkout/protocol/tax-quoting/transport.yaml`,
  which is `style: request-response` over `kind: in-process`, a pairing that is
  not a contradiction.
- An actor as a participant, and the NCA that follows from excluding it —
  `solutions/acme/product/billing/component/ledger/protocol/refund-request/index.md`.
- **An `arazzo.yaml` whose steps name operations rather than channel pointers** —
  `solutions/brass/protocol/game-transport/arazzo.yaml`. Its source description
  is the only AsyncAPI transport in the catalog that declares `operations`, so
  `operationId` is available there and is what Arazzo prefers; settlement's file
  above has to use `channelPath` because its transport declares none. That file
  also carries the trap the format sets over an AsyncAPI source: its transport is
  written from the authority's side, Arazzo's `action` is the *executor's*
  intent, and every `action` in the Arazzo file is therefore the mirror of the
  one in the transport.
- **An `arazzo.yaml` grounded in an `openapi.yaml`** —
  `solutions/acme/product/fulfilment/protocol/carrier-booking/arazzo.yaml`, which
  is where `successCriteria` and `onFailure` have something to read: an HTTP
  status code the source document declares. Over a bus there is no status code
  and usually no declared payload field, which is why settlement's file asserts
  nothing.
