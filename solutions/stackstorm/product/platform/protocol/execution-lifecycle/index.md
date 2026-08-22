---
name: execution-lifecycle
kind: protocol
version: 3
title: Execution lifecycle
summary: Three exchanges, seven queues and a status that is also a routing key — the conversation that moves one action from requested to finished, and the one the amqp binding block cannot describe.
status: review
owner: sergio-bershadsky
style: bus
participants:
  - alias: api
    ref: /product/platform/component/st2api
    role: requester
  - alias: rules-engine
    ref: /product/platform/component/st2rulesengine
    role: requester
  - alias: workflow-engine
    ref: /product/platform/component/st2workflowengine
    role: requester
  - alias: scheduler
    ref: /product/platform/component/st2scheduler
    role: consumer
  - alias: action-runner
    ref: /product/platform/component/st2actionrunner
    role: consumer
  - alias: stream
    ref: /product/platform/component/st2stream
    role: observer
  - alias: broker
    ref: /product/platform/component/rabbitmq
    role: broker
conforms-to:
  - standard: AMQP 0-9-1
    version: 0-9-1
    url: https://www.rabbitmq.com/tutorials/amqp-concepts
tags:
  - amqp
  - bus
  - execution
---

The centre of the system. Somebody asks for an action to run; the record's
status becomes the routing key it is published under; whichever process has a
queue bound to that key wakes up and does the next thing. Five statuses have a
queue, and those five are the whole dispatch mechanism: `requested` reaches the
scheduler, `scheduled`, `canceling`, `pausing` and `resuming` reach the runners.

Nothing here is a request/response. There is no correlation id, no reply queue
and no callback: the answer to "did it run" is another message under another
status.

## The three exchanges are one conversation

- **The status exchange** carries every transition of a
  [live-action](srn://stackstorm/datamodel/live-action@1), keyed by the status
  string. Five durable queues bind five of the fourteen keys.
- **The record exchange** carries the same record under `create`, `update` and
  `delete`. One queue binds it, and it belongs to the event stream.
- **The polling exchange** carries an
  [action-execution-state](srn://stackstorm/datamodel/action-execution-state@1)
  under `create`, for work that finishes somewhere else.

They are one protocol entity because they are one conversation about one thing,
between the same participants, and splitting them into three would be splitting a
sentence into words. That decision is where the framework's mini-spec dialect
stops being usable, which is the subject of most of this page.

## Nine statuses are published to nobody

Only five of the fourteen keys have a queue bound to them. The other nine —
including every terminal one — reach the status exchange and are discarded,
because a topic exchange with no matching binding drops the message. That is not
a defect: the terminal statuses are read from the document store by everything
that cares, and the record exchange carries them to the stream separately. It is,
however, invisible in any description that lists only bindings, which is exactly
what the mini-spec's surface list is.

The transport document declares all fourteen as channels, because all fourteen
are real addresses, and marks the nine with an extension key. It has to be an
extension: AsyncAPI expresses "somebody is at the far end" through `operations`,
whose `action` is send or receive **relative to one application**, and the
framework's own profile rule for this dialect makes an operations block name one
participant as the document's `id`. A bus with seven applications on it therefore
either picks one and hides six, or — as here — carries no operations at all and
says nothing about who consumes what.

So the one question a reader of a bus description most wants answered is the one
the standard answers only from a single application's point of view, and the one
the framework's profile then makes unanswerable for a multi-party protocol.

One of the nine is stranger still. The `delayed` transition is written to the
store with publishing switched off, so its routing key is a legal address that
nothing ever sends to; the channel carries a second extension saying so, and the
workflow step that shows it names no channel at all.

## A durable queue with a publisher and no consumer

The polling exchange has a durable queue named for a results tracker. It is
declared at start-up, it is in the list the platform pre-declares specifically so
that messages survive having no consumer online, and at `v3.9.0` **nothing
consumes it** — the queue constant appears in the module that defines it and the
module that pre-declares it, and in no service.

The ontology has no way to say that. A protocol requires at least two
participants (`E_PROTO_PARTICIPANTS`); this conversation has a publisher, a
broker, a durable queue, and no far end. Modelled as its own entity it could not
be authored without inventing a consumer, so it is a channel of this protocol and
a paragraph on the datamodel instead. The finding is not "StackStorm has a bug";
it is that a catalog cannot describe a surface that is half-alive, and half-alive
surfaces are what long-lived systems accumulate.

## What the `amqp` binding block could not carry

The framework's mini-spec `amqp` block is `exchange` (one string), `exchange-type`
(one value), `durable` (one boolean) and `bindings[]` of `routing-key` plus a
**required** `queue`. Measured against this protocol, four separate things do not
fit:

1. **One exchange.** This conversation spans three. There is no honest mini-spec
   file here: either two thirds of the surface is dropped, or one conversation is
   split into three protocol entities that no participant experiences as three.
2. **A required queue name, on queues that have none.** One of the queues here,
   and six across this platform, are declared with no name at all — the broker
   generates one per connection — and the required field cannot be filled with
   anything true. The
   AsyncAPI dialect can say this exactly, and says it with `address: null`, which
   its own specification defines as "unknown", useful "when the address is
   generated dynamically at runtime". The framework's migration guidance warns
   against an absent address because it "reads as unknown in AsyncAPI, which is
   the one thing these are not" — that is right for a websocket channel and
   precisely wrong here, where unknown-until-runtime is the fact.
3. **One `durable` boolean for the whole transport.** Durability is a property of
   each queue and each exchange. As it happens every queue in this system is
   durable — the messaging library's default, never overridden — so the boolean
   would not have lied. What varies queue by queue is `exclusive` and
   `auto-delete`, and the block has no field for either, so the difference between
   a work queue that survives a restart with its messages and a per-connection
   queue that dies with the socket is inexpressible either way.
4. **Competing consumers.** Every runner process binds the same work queue, and
   that is the platform's whole horizontal-scaling story. Neither dialect has a
   field for it; AsyncAPI at least leaves room for a note beside the channel.

Point 3 is worth stating as a correction rather than a complaint: the survey that
preceded this catalog expected the stream queues to be non-durable and they are
not. The measurement changed the finding, and the finding it changed into is
sharper — the missing fields are the ones nobody thought to ask for.

## The state machine is a reconstruction, and says so

`states.json` beside this file is **not** a transcription. The function that
changes a live action's status validates only that the new value is a member of
the enum; there is no transition table anywhere in the source. What the source
does declare is four named subsets — runnable, cancelable, completed, failed —
and which status each queue binds. The machine was assembled from those two, and
every transition in it carries a `description` naming what it was read from.

Under ADR 0018 that makes it a claim rather than a measurement, and the honest
options were to omit it or to flag it. It is flagged: the machine's own
`description` says so, so the claim travels with the artifact rather than living
only on this page.

## The Arazzo description

`arazzo.yaml` re-describes this exchange as an action runner drives it, in the
OpenAPI Initiative's [Arazzo](https://spec.openapis.org/arazzo/latest.html)
format, grounded in `transport.yaml` — the four things a runner does with an
item: run it, cancel it, hold it and let it go, and hand it to a human. The
requesters' side of each is a single publish onto the status exchange, which is
why the runner is the side written.

An Arazzo Description has a single executor, so it describes one participant's
path and never the whole exchange: `workflows/` stays the authoritative
choreography, and the sequence diagrams on this page derive from it alone. The
file is grammar-free — snapshotted with the entity, served as authored, and
judged by no field table, so no shape of it can be wrong here. One rule does
reach it: grounding, `W_PROTO_ARAZZO_UNGROUNDED` — every source description
must name a sibling artifact, and every operation or channel a step names must
resolve inside one. The step graph the portal draws from the file is a picture
and checks nothing.

## Sources

Read at `v3.9.0`:
[`st2common/st2common/transport/liveaction.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/transport/liveaction.py),
[`st2common/st2common/transport/actionexecutionstate.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/transport/actionexecutionstate.py),
[`st2common/st2common/transport/queues.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/transport/queues.py),
[`st2common/st2common/transport/bootstrap_utils.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/transport/bootstrap_utils.py),
[`st2common/st2common/constants/action.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/constants/action.py),
[`st2actions/st2actions/worker.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2actions/st2actions/worker.py),
[`st2actions/st2actions/scheduler/handler.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2actions/st2actions/scheduler/handler.py),
[`st2common/st2common/services/inquiry.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/services/inquiry.py).
