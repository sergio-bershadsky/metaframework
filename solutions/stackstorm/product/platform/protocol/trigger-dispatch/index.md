---
name: trigger-dispatch
kind: protocol
version: 3
title: Trigger dispatch
summary: One exchange, one fixed routing key, one durable queue that takes everything — the fan-in every event in the platform passes through on its way to the rules engine.
status: review
owner: sergio-bershadsky
style: bus
participants:
  - alias: sensor-container
    ref: /product/platform/component/st2sensorcontainer
    role: publisher
  - alias: timers-engine
    ref: /product/platform/component/st2timersengine
    role: publisher
  - alias: api
    ref: /product/platform/component/st2api
    role: publisher
  - alias: notifier
    ref: /product/platform/component/st2notifier
    role: publisher
  - alias: action-runner
    ref: /product/platform/component/st2actionrunner
    role: publisher
  - alias: rules-engine
    ref: /product/platform/component/st2rulesengine
    role: consumer
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
  - trigger
---

Everything that happens in StackStorm because something happened elsewhere goes
through this one exchange. A sensor that noticed a file, a timer that fired, a
webhook that arrived at the API, an inquiry that was answered, a notifier
reporting that an action finished — five processes publish the same wrapper
under the same fixed routing key, and one process consumes all of it through one
durable queue bound with the match-everything pattern.

It is the narrowest waist in the system, and the first AMQP surface any catalog
in this repository has described.

## What is on the wire, exactly

The exchange is declared `topic`. The publisher's routing key is a single
constant word, set in the dispatcher and never parameterised. The consumer's
queue is named for the rules engine and binds `#`, which under AMQP topic
semantics matches every routing key — so the topic exchange here is doing the
work of a direct exchange with one destination, and the wildcard is what makes it
a bus in name only. Nothing else binds this exchange in the shipped source.

The message is a
[trigger-dispatch-message](srn://stackstorm/datamodel/trigger-dispatch-message@1)
and **not** a trigger instance. The consumer creates the trigger instance record
from it, before acknowledging, which is why a message that cannot be turned into
a record stays on the queue instead of vanishing.

## Where the mini-spec ran out, on the simplest bus surface in the system

This is the one AMQP protocol here with a single exchange, so it is the one the
framework's `amqp` binding block comes closest to describing. It still cannot be
written in that block, and the reasons are worth having in the simplest case
before the harder ones arrive.

**The publisher's routing key has no field.** The block's surface list is called
`bindings`, and a binding entry is `routing-key` plus a required `queue` — that
is the *consumer* side. The key a publisher sends under is not a binding, and
there is nowhere in the block to put it. Here the two differ: publishers send
`trigger_instance`; the one queue binds `#`. Writing the binding alone would
describe half the conversation and would suggest that publishers send under `#`,
which is not a legal routing key to publish with.

**There is no field for the namespace.** Every exchange and queue name in this
system is derived from a configurable prefix, and the broker's virtual host is
part of the address. The `kafka` block has `cluster`; `http`, `grpc` and
`websocket` have `tls`; `amqp` has neither a broker label nor a vhost. So a
mini-spec file writing `st2.trigger_instances_dispatch` states a *default* as
though it were a fact.

**The encoding enum has no value for what this bus carries.** Every message on
every exchange described here is a serialized Python object graph: the publisher
passes that serializer by name, and the platform registers its own variant of it
under the content type `application/x-python-serialize`. The mini-spec's
`encoding` admits `json | avro | protobuf | msgpack | xml | text | binary`, and
the honest answer would be `binary` — which loses the fact that exactly one
language can read the bytes. The AsyncAPI dialect has no such enum, so
`defaultContentType` states the real content type; but the framework's own
encoding-to-content-type table has no row that produces it, so a document written
this way cannot be reached by the migration path the specification gives.

All five bus protocols in this product are therefore written in the AsyncAPI
dialect, and the choice is made once for the set rather than per file: four of
them cannot be written in the mini-spec at all, and a bus described in two
grammars is a bus nobody can read side by side.

## Why the broker is a participant

RabbitMQ is a component of this product and is named here as one, with the
`broker` role. That is a modelling choice with a consequence worth stating: the
workflow beneath this page draws two hops rather than one, because on a bus there
is no moment at which a publisher and a consumer are both present. A protocol
whose participants were only the five publishers and the one consumer would draw
arrows that never happen.

## The Arazzo description

`arazzo.yaml` re-describes this exchange as a publishing sensor drives it, in
the OpenAPI Initiative's [Arazzo](https://spec.openapis.org/arazzo/latest.html)
format, grounded in `transport.yaml` — the single publish that is the whole of
the initiator's side. The record the rules engine writes before acknowledging is
the consumer's, and the publisher is told none of it.

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
[`st2common/st2common/transport/reactor.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/transport/reactor.py),
[`st2common/st2common/transport/queues.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/transport/queues.py),
[`st2common/st2common/transport/publishers.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/transport/publishers.py),
[`st2reactor/st2reactor/rules/worker.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2reactor/st2reactor/rules/worker.py),
[`conf/st2.conf.sample`](https://github.com/StackStorm/st2/blob/v3.9.0/conf/st2.conf.sample).
