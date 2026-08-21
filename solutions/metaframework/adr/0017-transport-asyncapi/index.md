---
name: 0017-transport-asyncapi
kind: adr
version: 1
title: Transport speaks AsyncAPI where AsyncAPI speaks the wire
summary: transport.yaml gains an AsyncAPI 3.1.0 dialect under its own filename, discriminated by the native asyncapi key, admitted for kafka, websocket and amqp — http, grpc and in-process keep the mini-spec.
status: review
owner: sergio-bershadsky
decision-status: proposed
date: "2026-08-21"
relations:
  uses:
    - /product/specification/component/kind-contracts
    - /product/specification/datamodel/transport-document
    - /product/portal/component/protocol-model
    - /product/portal/component/catalog-loader
tags:
  - dialects
  - artifacts
  - protocols
---

## Context

[0015-artifact-dialects](srn://metaframework/adr/0015-artifact-dialects) built
the machinery for exactly this and named this file as its worked case: a payload
standardizes inside a filename that does not move, the old dialect is warned and
never broken, and `transport.yaml` becoming AsyncAPI does not move
`srn://acme/protocol/settlement.transport`. It also provisioned the
discriminator in advance — "when `transport.yaml` gains an AsyncAPI dialect
*inside its existing filename*, `asyncapi: 3.1.0` is that dialect's
discriminator". Nothing here has to be invented; what has to be decided is
**which files it applies to**, and that turns on a mapping nobody had done.

The census, counted on disk at this commit: **16** `transport.yaml` files —
**9** `http`, **3** `kafka`, **3** `in-process`, **1** `websocket`, and **zero**
each of `amqp` and `grpc`, both of which the closed `kind` enum admits. Two of
the nine http files link an `openapi.yaml` under `spec:`; the other seven carry
a hand-written `operations` surface list, **30** operations between them. The
three kafka files carry **9** topics; the websocket file carries **5** channels.

The mini-spec is small and its job is stated in `framework/spec/kinds/protocol.md`:
`transport.yaml` "describes how the conversation reaches the wire — one protocol,
one transport. It deliberately does not re-express what OpenAPI, AsyncAPI, or a
`.proto` file already expresses." The surface lists exist for the case where no
such file exists — they are the hand-rolled substitute, and
`E_PROTO_TRANSPORT_SPEC_CONFLICT` forbids keeping both.

That sentence is the whole tension. For a Kafka topic set there **is** no
industry document today, so the surface list is what an author writes and
AsyncAPI is a strict upgrade over it. For an HTTP API there is one, it has a role
and a filename already (`openapi.yaml`, discriminated natively by `openapi:`),
and two of the nine files use it.

AsyncAPI 3.1.0 was released 2026-01-31 — a minor over 3.0.0 with no breaking
changes, adding ROS 2 to the bindings set; a 3.0.0 document becomes a 3.1.0
document by editing the version string. The specification itself states that
minor increments "should not interfere with operations of tooling developed to a
lower minor version" and that "the patch version will not be considered by
tooling", which is the property the recognition rule below leans on.

### The mapping, field by field, done before anything was decided

Writing **✓** for a genuine home, **~** for one that exists but converts or
narrows, and **✗** for none:

| `transport.yaml` field                        | AsyncAPI 3.1.0 home                                       |     | Note                                                                                                                             |
| --------------------------------------------- | --------------------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------- |
| `kind: kafka \| websocket \| amqp`            | `servers.<id>.protocol`                                   | ✓   | Spelling changes: `websocket` → `ws`/`wss`; TLS folds into the protocol string.                                                  |
| `kind: http`                                  | `servers.<id>.protocol` = `http`/`https`                  | ~   | Expressible; the wrong standard — see below.                                                                                     |
| `kind: grpc`                                  | —                                                         | ✗   | No gRPC binding, no protocol convention, no service-definition schema format.                                                    |
| `kind: in-process`                            | —                                                         | ✗   | A Server Object REQUIRES a `host`. An in-process call has none.                                                                  |
| `summary`                                     | `info.description`                                        | ✓   | The Info Object has no `summary` field; `description` is the slot.                                                               |
| `encoding`                                    | `defaultContentType`                                      | ✓   | Seven values, one media type each — table below.                                                                                 |
| `auth`                                        | `components.securitySchemes` + `security`                 | ~   | Typed schemes vs. display labels; the loss is named below.                                                                       |
| `spec`                                        | —                                                         | ✗   | Dissolves: in this dialect the document **is** the spec.                                                                         |
| `x-*` at the root                             | `x-*` on any object                                       | ✓   | AsyncAPI's pattern is `^x-[\w\d\.\x2d_]+$`; every catalog key already matches.                                                   |
| `http.base-path`, `websocket.path`            | `servers.<id>.pathname`                                   | ✓   |                                                                                                                                  |
| `<kind>.tls`                                  | the `protocol` string                                     | ✓   | `wss` vs `ws`, `amqps` vs `amqp`, `https` vs `http`.                                                                             |
| `kafka.cluster`                               | the **server id**                                         | ✓   | `^[A-Za-z0-9_\-]+$` admits all three catalog values verbatim.                                                                    |
| `kafka.topics[].name`                         | `channels.<id>.address`                                   | ✓   |                                                                                                                                  |
| `kafka.topics[].partitions`                   | kafka channel binding `partitions`                        | ✓   | Exact; integer, positive.                                                                                                        |
| `kafka.topics[].retention`                    | kafka channel binding `topicConfiguration.retention.ms`   | ~   | `30d` → `2592000000`. Convertible; the human unit does not survive.                                                              |
| `kafka.topics[].key`                          | —                                                         | ✗   | The kafka message binding `key` is a **Schema Object** — the key's shape, not which payload field it is.                         |
| `kafka.topics[].message`                      | `channels.<id>.messages.<id>`                             | ~   | The Message Object is a genuine home; the **pinned SRN** inside it is not.                                                       |
| `websocket.channels[]`                        | N channels, one per entry                                 | ~   | The ws binding's note calls the channel the connection; W9 makes that reading unusable — see below. Five entries, five channels. |
| `websocket.channels[].direction`              | `operations.<id>.action`                                  | ~   | `send`/`receive` is relative to *an application*; a protocol is not one.                                                         |
| `websocket.subprotocol`                       | ws channel binding `headers` schema                       | ~   | `Sec-WebSocket-Protocol` as a header property. No catalog file uses it.                                                          |
| `amqp.exchange`, `.exchange-type`, `.durable` | amqp channel binding `exchange.{name,type,durable}`       | ✓   | Their `type` enum is a superset of ours.                                                                                         |
| `amqp.bindings[].routing-key` / `.queue`      | amqp channel binding, `is: routingKey` **or** `is: queue` | ~   | One entry carrying both becomes two channels.                                                                                    |
| `http.operations[].method`                    | http operation binding `method`                           | ✓   | Our seven verbs are a subset of their nine.                                                                                      |
| `http.operations[].path`                      | `channels.<id>.address` + `parameters`                    | ✓   | `{param}` is a Channel Address Expression.                                                                                       |
| `http.operations[].request`/`response`        | the operation's messages + `operations.<id>.reply`        | ✓   | Request/reply is a first-class AsyncAPI 3 shape.                                                                                 |
| `grpc.*`, `in-process.*`                      | —                                                         | ✗   | `language`, `module`, `interface`, `package`, `service` have no home anywhere.                                                   |

Three things AsyncAPI **requires** that `transport.yaml` deliberately does not
have, and they matter more than any row above:

- **`servers.<id>.host` is REQUIRED.** `transport.yaml` says nothing about where
  anything runs; placement is a claim made in `environment/topology.yaml`, and
  keeping deployment facts out of the protocol is not an omission but the rule
  that makes one transport describable across every environment.
- **`info.version` is REQUIRED.** `framework/spec/evolution.md` makes the
  entity's frontmatter the only clock, and
  [0014](srn://metaframework/adr/0014-artifact-addresses) refused artifacts one
  of their own. There is no truthful value here that is not a second clock.
- **`info.title` is REQUIRED**, and the title lives in `index.md`. Copying it is
  the drift the spec already warns about for participant titles.

And one field has no home at all in either direction: a **pinned SRN**. A
Message Object's `payload` takes a Schema Object or a `$ref`, and a `$ref` is a
JSON Reference to a URI. The catalog's canonical schema URLs deliberately carry
no `@N` ([0006](srn://metaframework/adr/0006-dereferenceable-schema-urls),
[0007](srn://metaframework/adr/0007-canonical-schema-host-and-x-srn-restored)),
so `$ref`-ing one silently converts `order@3` into "whatever `order` is now" —
the exact drift `payload:` is told to pin against.

## Decision

**`transport.yaml` gains a second dialect — an AsyncAPI 3.1.0 document under the
same filename, discriminated by the format's own `asyncapi:` key — and that
dialect is admitted for the wires AsyncAPI describes and the framework has no
other standard for: `kafka`, `websocket`, `amqp`.** `http` keeps the legacy
dialect, because OpenAPI is that wire's standard and the role table already
carries it. `in-process` and `grpc` keep the legacy dialect, because AsyncAPI
cannot express them. The two dialects coexist on one role permanently, and
`W_ARTIFACT_DIALECT` already describes what a reader does with either.

Measured: **4** of 16 files migrate (3 kafka, 1 websocket) — **4** entity
version bumps. **12** stay legacy (9 http, 3 in-process), unwarned and correct.

### The document replaces the file; the filename does not move

The AsyncAPI document **is** `transport.yaml`, not a sibling beside it. This is
the path [0015](srn://metaframework/adr/0015-artifact-dialects) was built for and
the cheap one, and three separate rules make a sibling worse:

- The role table is a spec constant and a new filename is an amendment to it —
  0015 states exactly that fence. A dialect inside an existing filename is not.
  `srn://acme/protocol/settlement.transport` keeps resolving, no SRN parser
  changes, and no referrer has to know which dialect it is pointing at before it
  can write an address.
- **One transport per protocol** is an invariant of this kind. Two files means
  two transports unless a rule says the sibling wins — and "the sibling wins" is
  replacement, bought at the price of an extra address and a permanent question
  about which file is stale.
- A free-named `asyncapi.yaml` is *already legal* as a `spec.file` attachment,
  unaddressable by design. Minting a fixed-name `asyncapi.yaml` beside it would
  give one filename two meanings depending on whether it is linked. Zero catalog
  files use the attachment form today, so nothing breaks — but the ambiguity
  would be permanent.

### `asyncapi: 3.1.0`, recognised across the 3.x line

The discriminator is the format's own required root field. It is **native**:
never stripped, part of the document, exactly as `openapi:` is on `openapi.yaml`.
The `transport:` role therefore carries two dialect rows, ordered mini-spec
first — an absent header is still told to add `$schema: {meta}/transport-document`,
which is right for the 12 files that stay and for every http protocol written
tomorrow.

Recognition is `^3\.\d+\.\d+$` — the whole 3.x line, not just 3.1. The
`openapi` row widened to `^3\.1\.\d+$` on the ground that OpenAPI versions the
*document*, so 3.1.1 is 3.1.0 with errata; AsyncAPI's own version string section
says more than that, promising that a minor increment stays usable by tooling
built for a lower minor and that tooling ignores the patch entirely. Warning on
a correct 3.2.0 document would report the reader's narrowness as the file's
fault. The framework reads 3.1 semantics either way: a construct introduced in a
later minor is carried in `Artifact.raw` and derives nothing, which is invisible
rather than wrong — the same posture every unrecognised key already has.

A file declaring **both** keys needs no new machinery. `adoptDialect` takes the
first match, so the mini-spec header wins; `asyncapi:` is not framework-owned, so
it is not stripped, and the mini-spec's own field table then rejects it as an
unknown non-`x-` top-level key (`E_PROTO_TRANSPORT_SCHEMA`). Correct outcome,
zero new codes — though it depends on `E_PROTO_TRANSPORT_SCHEMA` acquiring the
emitter it has never had.

### The admitted set is one table, and it is the thing to widen

| `kind`       | `protocol` (plain / TLS)  | `bindings` key | AsyncAPI dialect |
| ------------ | ------------------------- | -------------- | ---------------- |
| `kafka`      | `kafka` / `kafka-secure`  | `kafka`        | **admitted**     |
| `websocket`  | `ws` / `wss`              | `ws`           | **admitted**     |
| `amqp`       | `amqp` / `amqps`          | `amqp`         | **admitted**     |
| `http`       | `http` / `https`          | `http`         | deferred         |
| `grpc`       | —                         | —              | closed           |
| `in-process` | —                         | —              | closed           |

The spellings are AsyncAPI's own: its 2.6 JSON Schema documents "supported
protocols include, but are not limited to: amqp, amqps, http, https, ibmmq, jms,
kafka, kafka-secure, anypointmq, mqtt, secure-mqtt, solace, stomp, stomps, ws,
wss, mercure, googlepubsub", and 3.x left `protocol` a free string with no
enumeration at all. Note the asymmetry: TLS changes the `protocol` value and does
**not** change the `bindings` key — a `wss` server still binds under `ws`.

**`http` is deferred, not rejected, and the reason is a defect rather than a
preference.** AsyncAPI expresses HTTP: the operation binding carries `method` and
`query`, the message binding carries `headers` and `statusCode`, and
`operations.<id>.reply` is a first-class request/reply shape — it would even
improve `catalog-history`, whose four operations are one path discriminated by a
query parameter that today has no field and lives in `x-op`. But the http
**server and channel binding objects "MUST NOT contain any properties"**, so
AsyncAPI has strictly less to say about an HTTP endpoint than OpenAPI does; and
`refund-request` and `carrier-booking` each already link an `openapi.yaml`.
Migrating them would leave two standard descriptions of the same 30 operations
with nothing forcing agreement — while removing the anchor that prevents it,
because `E_PROTO_TRANSPORT_SPEC_CONFLICT` keys on the `spec` mapping and this
dialect has no `spec`. That is a regression wearing a standardization badge.

Widening is one row of the table above plus a ruling on how an AsyncAPI-dialect
http transport coexists with `openapi.yaml`. The reopening trigger is that
ruling, not new evidence about AsyncAPI.

**`grpc` and `in-process` are closed.** Not deferred: there is nothing to wait
for. AsyncAPI publishes no gRPC binding and no protocol spelling for it, and a
Server Object requires a `host` that an in-process call does not have. The three
in-process files include `brass`'s MCP surface, whose real wire is stdio
JSON-RPC — already recorded in `x-wire` because the `kind` enum cannot say it
either. Writing `protocol: stdio` with a fabricated host would produce a document
no tool understands, to satisfy a standard that does not cover the case. The
legacy dialect stays legal for them indefinitely, and `W_ARTIFACT_DIALECT` never
fires, because they carry the mini-spec header and always will.

### The framework profile — six rules on top of AsyncAPI

A file that opts into this dialect opts into its checks. Violations are
`E_PROTO_TRANSPORT_ASYNCAPI`, one class for the whole profile, mirroring how
`E_PROTO_TRANSPORT_SCHEMA` covers the whole legacy field table.

1. **`x-srn` at the document root equals the owning protocol entity's absolute
   SRN.** This is not a new key: it is the identity extension
   [0007](srn://metaframework/adr/0007-canonical-schema-host-and-x-srn-restored)
   put in every `schema.json`, doing the same job for a second travelling
   document.
2. **`info.title` equals the entity's frontmatter `title`.** A checked mirror,
   which is safe here and is not safe for `version` — a title changes rarely,
   and when it does the entity bumps anyway and the check catches the drift in
   the same commit.
3. **`info.version` is exactly the string `unversioned`.** AsyncAPI requires the
   field; the framework has no second clock to put in it. Mirroring the
   frontmatter was rejected: it would make every unrelated entity bump edit this
   file forever, and a mirrored number is a clock whether or not a check keeps
   it honest.
4. **Exactly one entry in `servers`, whose `protocol` is in the admitted table.**
   This is "one transport per protocol", restated in the new grammar.
5. **`channels` is present and non-empty.** It is what the surface list became.
6. **`operations` is OPTIONAL, and when present `id` names the application.**
   `action` is `send`/`receive` relative to *one application*, and a protocol is
   a conversation between several — so `id` MUST be present and MUST equal one
   of the protocol's `participants[].ref`, resolved absolute, and every `action`
   is read from that participant's side.

Rule 6 is the one that keeps the migration honest. The kafka surface list
records **no** direction, so the three kafka files migrate with **no
`operations` block at all** — valid AsyncAPI (both `channels` and `operations`
are optional at the root), side-neutral exactly as today, nothing invented. The
websocket file *does* carry direction, so its five channel entries become five
operations mechanically, from the authority's side:

| `direction`        | `action`                                   |
| ------------------ | ------------------------------------------ |
| `client-to-server` | `receive`                                  |
| `server-to-client` | `send`                                     |
| `bidi`             | two operations on one channel, one of each |

### N websocket entries become N channels, not N messages on one

The mapping table above first read "one channel, N messages", on the AsyncAPI
WebSockets binding's note that the channel "represents the connection" and that
WebSockets has no virtual channels. Writing the file proved that unusable, and
the ruling is reversed here: **each `websocket.channels[]` entry becomes its own
Channel Object**, keeping the entry `name` as its channelId and carrying an
`address` for the wire name it rides.

The forcing argument is `W_PROTO_WF_CHANNEL_UNKNOWN` (workflow rule W9), which
matches a step's `channel:` against a channel `address` or channelId. `brass`'s
two workflows carry **15** `channel:` references naming **5** distinct values,
and those 5 are exactly the mini-spec entry names. Collapse them into one channel
and 4 of the 5 resolve to nothing — a migration that lost no information would
light up a validation rule, and the only way to keep it quiet would be to rewrite
the workflows to name a channel that is not the thing they are about.

The binding note is a description of raw WebSockets, not a cardinality
constraint: AsyncAPI places no limit on how many Channel Objects a document
declares, and socket.io — what `brass` actually runs — multiplexes named events
over one connection, which is the virtual channel the note says the raw protocol
lacks. The connection is still stated once, in `servers.<id>.pathname`. The cost
is that a stock ws generator sees five channels where its binding note suggested
one; it generates five handlers on one socket, which is the application's real
shape.

Two entries may share an `address`: `brass`'s five entries ride three socket.io
events, because the mini-spec split two of them by `direction`. They stay five
channels — `direction` became `action`, and an operation names exactly one
channel.

### Four extension keys under `x-srn-`, and no more

The prefix is `x-srn-`. AsyncAPI reserves nothing — its extension pattern is
`^x-[\w\d\.\x2d_]+$` with no reserved-prefix clause — but the OpenAPI Initiative
reserves `x-oai-` and `x-oas-` (OAS 3.1.1) and additionally `x-arazzo` (Arazzo
1.0.1), and this catalog will hold all three formats. `x-srn-` collides with none
of them, matches AsyncAPI's pattern, and is the family the catalog already
speaks: `x-srn` names an address, `x-srn-<thing>` names a catalog fact.

| Key                   | Object                                        | Carries                                                  | Uses in the catalog |
| --------------------- | --------------------------------------------- | -------------------------------------------------------- | ------------------- |
| `x-srn`               | root                                          | the owning entity's SRN (0007's key, not new)            | 4                   |
| `x-srn-payload`       | Message                                       | the **pinned** SRN of the datamodel this message carries | 12                  |
| `x-srn-auth`          | Server                                        | the `auth` labels, verbatim, display-only                | 4                   |
| `x-srn-partition-key` | Message, or Channel when it has no `messages` | the payload field the topic partitions by                | 9                   |

`x-srn-payload` is the one that must exist. It is what the message × datamodel
matrix reads, what `E_PROTO_PAYLOAD_KIND` checks, and the only carrier that keeps
`@version`; `payload.$ref` at a canonical schema URL is available beside it and
means something weaker.

`x-srn-auth` exists **to avoid fabricating a security fact**. `mtls` maps exactly
onto `type: X509`, but `sasl-scram` does not say whether it is `scramSha256` or
`scramSha512`, and `seat-credentials` — brass's socket handshake — has no
AsyncAPI type at all. `auth` has always been "display-only labels"; turning a
label into a typed scheme invents the digest. So the labels carry over unchanged
and render the transport card exactly as they do today, and a real
`components.securitySchemes` + `security` is permitted, encouraged, and
**never derived by the framework**.

`x-srn-partition-key` exists because the kafka message binding's `key` is a
Schema Object describing the key's *shape*; our `key: order-id` names a *field*.
Authors who want to describe the shape too have the stock field.

**It rides the Message Object — except on a channel that declares no
`messages`, where it rides the Channel Object.** The amendment was forced by the
migration rather than designed: measured on disk 2026-08-21, the catalog holds
**9** partition keys, **8** on a Message and **1** on a Channel. The one is
`reconciliation-report` in `solutions/acme/protocol/settlement/transport.yaml` —
a keyed topic whose payload model is still under design, so the mini-spec named a
`key` and no `message`. Both alternatives lie: dropping `batch-id` loses a fact
the source stated, and minting an empty Message Object to hang it on invents a
payload the source withheld. The exception is therefore exact and self-limiting —
a channel with `messages` must put the key on one, so no channel can choose
between the two placements, and a reader looking for the key checks the Channel
only after finding no `messages` there.

### What dissolves, and what the host must not say

`spec` has no counterpart and is not carried: in this dialect the document is
the spec, which is what `spec` existed to point at, and no migrating file
carries one. `E_PROTO_TRANSPORT_SPEC_CONFLICT` and `E_PROTO_TRANSPORT_BINDING`
become legacy-dialect-only — there is no surface list and no kind-keyed block to
conflict. A future AsyncAPI-dialect protocol needing a foreign payload language
uses `components.schemas` with a `schemaFormat` from AsyncAPI's own table
(`application/vnd.apache.avro;version=1.9.0`,
`application/vnd.google.protobuf;version=3`); no extension is minted for a user
that does not exist. And a **legacy-dialect** transport whose `kind` is in the
admitted set and whose `spec.format` is `asyncapi` raises
`W_PROTO_SPEC_ASYNCAPI` — that document belongs in this file now, not beside it.

`servers.<id>.host` is required by AsyncAPI and forbidden by this framework's
division of labour, so it is written as a bare server variable with a
description and **no `default`**, a default being a deployment fact:

```yaml
host: "{host}"
variables:
  host:
    description: Supplied by the environment; this protocol names no deployment.
```

A literal host raises `W_PROTO_TRANSPORT_HOST` — a warning rather than an error,
because a fixed third-party endpoint is a legitimate constant, and because a
warning is what "never broken" means here.

`encoding` maps to `defaultContentType` through a fixed table:

| `encoding` | `defaultContentType`              | Registered where                |
| ---------- | --------------------------------- | ------------------------------- |
| `json`     | `application/json`                | IANA, RFC 8259                  |
| `avro`     | `application/vnd.apache.avro`     | AsyncAPI's schema-formats table |
| `protobuf` | `application/vnd.google.protobuf` | AsyncAPI's schema-formats table |
| `msgpack`  | `application/vnd.msgpack`         | IANA                            |
| `xml`      | `application/xml`                 | IANA, RFC 7303                  |
| `text`     | `text/plain`                      | IANA, RFC 2046                  |
| `binary`   | `application/octet-stream`        | IANA, RFC 2046                  |

Two of the seven are not in the IANA registry and are named here on AsyncAPI's
own authority, which is the authority that matters for a document AsyncAPI
tooling reads.

### What the portal derives, so this is not a regression

The AsyncAPI dialect **is to be parsed, not served as bytes.** `openapi.yaml` can
be an opaque attachment because nothing was ever derived from it;
`transport.yaml` feeds the transport card, the message × datamodel matrix, and
the `channel` half of `W_PROTO_WF_CHANNEL_UNKNOWN`. Serving these four files as
bytes would darken all three views for the protocols that did the most work.

**This is a decision about a reader that does not exist yet, and nothing in it
has shipped.** Measured in `framework/portal/src` on 2026-08-21:
`lib/catalog/dialects.ts` carries the `asyncapi:` row, so the dialect is
*detected* — the document loads, records `dialect.key: 'asyncapi'` and keeps its
native key unstripped — and `lib/protocol/` holds modules for workflows and state
machines and none for transports, in either dialect. `transport.yaml` falls
through to a generic YAML code block today. The three codes this ADR mints sit in
`lib/catalog/diagnostic-coverage.test.ts` with no emitter, beside the four the
mini-spec has never had. Adopting this ADR does not change that; implementing it
does.

What the reader will be, when written, is a **profile** — `asyncapi`, `id`,
`x-srn`, `info`, `servers`, `channels`, `operations`, and the four bindings it
knows — read with the portal's own schema and **no new dependency**:
`@asyncapi/parser` is not needed to read YAML the portal already parses, and it
would bundle a second validator with its own opinions. Everything outside the
profile rides in `Artifact.raw`, serves on the source pane, and derives nothing.
Full AsyncAPI conformance is a warn-only lint shell-out, named here and not
shipped — the same shape the Arazzo lane proposed for Redocly/Spectral.

`W_PROTO_WF_CHANNEL_UNKNOWN` (workflow rule W9) is one rule over two dialects,
and `kinds/protocol.md` states it once, in both halves: a step's `channel`
matches a mini-spec surface entry's `name`, `queue`, `routing-key` or `path`, or
— in this dialect — a channel's `address` or its channelId. It was already
skipped when a transport declared no surface list; it will never be skipped for
these four, because profile rule 5 makes `channels` non-empty.

### Worked: `solutions/acme/protocol/settlement/transport.yaml`

Three topics, no direction recorded in the mini-spec form, so no `operations`
block and nothing invented. Reproduced **verbatim from the file on disk** through
the first channel, comments included — the earlier draft of this block
paraphrased, and drifted from the file it names within one commit:

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
```

Note `protocol: kafka` and not `kafka-secure`: the mini-spec `kafka` block has no
`tls` field, so the file being replaced asserted nothing about TLS, and picking
the secure spelling would have invented a security fact — the same reason
`x-srn-auth` exists. `ledger-entry-posted` follows `order-paid` exactly.
`reconciliation-report`, whose payload model is still under design, becomes a
channel with **no** `messages` map — legal, because `messages` is optional, and
truthful, because that is what the legacy file says — and it is therefore the one
channel in the catalog carrying `x-srn-partition-key` on the Channel Object.

## Consequences

- **The lane is 4 files, not 16, and that is the finding.** The 0.2.0 plan sized
  this as "the largest real migration: 16 protocol entities". The mapping says
  12 of those 16 describe wires AsyncAPI either cannot express (3) or does not
  own (9). Counted on disk after the four rewrites: four entity bumps, **14**
  channels, **5** operations, **12** `x-srn-payload` keys, **9**
  `x-srn-partition-key` keys. (14 and not 10: the websocket file kept one channel
  per mini-spec entry, per the ruling above.) If the owner overrules the `http`
  deferral the lane becomes 13 files and 30 operations — one table row, and the
  duplication ruling that row demands.
- **One role now carries two live dialects, permanently.** Not a migration
  window: `in-process` and `grpc` have no AsyncAPI future, so the mini-spec is
  load-bearing forever and `transport-document` stays a published meta-schema.
  Every reader of this role must branch, and the `W_ARTIFACT_DIALECT` promotion
  0015 deferred can now never happen for `transport` — absence will always be a
  legitimate state for some kinds.
- **Four extension keys are proprietary content inside a standard document.**
  A stock AsyncAPI tool reading a migrated file gets the channels, the bindings
  and the protocol right, and silently ignores every payload binding and every
  auth label — which is to say it gets the parts that make this a *catalog*
  wrong. That is the honest price of not fabricating: `payload.$ref` would have
  been visible to that tool and would have dropped `@3`.
- **`retention: 30d` becomes `2592000000` and does not come back.** A reviewer
  reading the diff sees a nine-digit number where a human unit was. The
  conversion is exact and the loss is only legibility, but it is a real loss on
  a file whose whole purpose is being read.
- **The portal grows a second transport reader.** One more thing to be wrong
  about, on the read path, with no new dependency to blame it on. It is confined
  to a profile: the dialect is recorded by machinery 0015 already shipped, and
  the branch is one function over `Artifact.dialect`.
- **`E_PROTO_TRANSPORT_SCHEMA` finally needs an emitter.** Nothing validates
  `transport.yaml` today, which is how a file could declare both dialects and
  raise nothing. The ambiguity resolution above is correct only once that gap is
  closed, so this decision inherits it.
- **Three new codes on one kind that already has twenty-six.**
  `E_PROTO_TRANSPORT_ASYNCAPI`, `W_PROTO_TRANSPORT_HOST`,
  `W_PROTO_SPEC_ASYNCAPI`. The last has zero users today and exists to close a
  loophole before it is used, which is the cheapest moment.
- **AsyncAPI's application assumption stays a mismatch we route around, not one
  we solved.** `action` is relative to one application; our entity is a
  conversation. Making `operations` optional means the honest files simply do
  not carry direction — but it also means the framework ships a dialect whose
  most useful feature is off by default for three quarters of the migrated
  files, and a stock code generator gets nothing to generate from them.

## Alternatives considered

- **A sibling `asyncapi.yaml` as a new role.** Rejected. It amends the role
  table, mints an address for a second description of one wire, collides with
  the free-named attachment that is already legal under `spec.file`, and needs a
  precedence rule between the two files — which, once written, is replacement
  with an extra address attached. 0015 drew this exact fence: a new dialect
  inside an existing filename is not a role-table amendment, and a new filename
  is.
- **Migrating all 13 AsyncAPI-expressible files, `http` included.** Rejected for
  now on one measurable defect rather than on taste: `refund-request` and
  `carrier-booking` already link an `openapi.yaml`, so migrating them creates
  two standard descriptions of 30 operations while deleting the anchor
  (`spec:`) that `E_PROTO_TRANSPORT_SPEC_CONFLICT` uses to forbid exactly that.
  The http server and channel binding objects are additionally empty by
  specification, so the trade is less expressive power for more duplication.
  Reopening needs a coexistence ruling, not new evidence.
- **Migrating the 7 http files that carry no `openapi.yaml`.** Rejected as the
  worse half of the above: it makes the framework's advice "use AsyncAPI for
  your REST API unless you happen to have OpenAPI", which is backwards — an
  HTTP protocol should acquire an `openapi.yaml`, and the role already exists
  for it.
- **`protocol: stdio` (or `in-process`) with a placeholder host, for the three
  in-process files.** Rejected. The `protocol` field is a free string, so this
  is *legal* and entirely useless: no binding, no tooling, and a REQUIRED `host`
  filled with a value that names nothing. It converts "AsyncAPI cannot express
  this" into "AsyncAPI expresses this wrongly", which is worse for every reader,
  human or machine.
- **`payload.$ref` at the canonical schema URL instead of `x-srn-payload`.**
  Rejected as a silent unpinning. A canonical schema URL addresses the current
  schema by construction (0006, 0007), so `order@3` becomes `order` — and the
  contract that was reviewed against `@3` starts describing `@4` with no diff on
  this file, which is the precise failure `payload:` is told to pin against.
  `$ref` remains available beside the extension for consumers that want a
  dereferenceable link.
- **Deriving `components.securitySchemes` from the `auth` labels.** Rejected as
  fabrication. `sasl-scram` does not say `scramSha256` or `scramSha512`;
  `seat-credentials` and `origin-allowlist` are not authentication schemes at
  all. A translation table would have to guess, and a guessed security fact in a
  standard document is worse than an honest extension.
- **`info.version` mirroring the entity's frontmatter `version`.** Rejected.
  Every unrelated bump — a prose fix in `index.md` — would then have to edit
  `transport.yaml` too, turning one-file changes into two-file changes forever
  on every AsyncAPI protocol. And a mirrored number is still a clock, which is
  the thing 0014 closed and 0015 declined to reopen.
- **Recognising only `3.1.x`, as the `openapi` row does.** Rejected on
  AsyncAPI's own text, which promises minor-version forward compatibility and
  says tooling ignores the patch — a narrower rule would warn on a correct 3.2.0
  document and report the reader's limits as the file's fault.
- **Collapsing the websocket surface list onto one channel with N messages**, as
  the AsyncAPI ws binding's note suggests. Rejected on a measurement, not a
  preference: `brass`'s workflows make 15 `channel:` references over 5 distinct
  names, all of them mini-spec entry names, and W9 matches those against a
  channel `address` or channelId. One collapsed channel orphans 4 of the 5 while
  the file loses no information. Rewriting the workflows to name the collapsed
  channel instead would make every step say "the socket" where it used to say
  which message — which is deleting the surface to fit the grammar.
- **Treating the AsyncAPI dialect as bytes-only, like `openapi.yaml`.**
  Rejected: nothing was ever derived from `openapi.yaml`, whereas
  `transport.yaml` feeds the transport card, the message × datamodel matrix and
  workflow rule W9. Migrating a file and darkening three views on it is a
  regression sold as standardization.
