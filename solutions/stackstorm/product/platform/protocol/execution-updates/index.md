---
name: execution-updates
kind: protocol
version: 2
title: Execution updates
summary: The audit record and the live output, fanned out to a notifier, a workflow engine and every open stream connection — one routing key, five queues, three of them with no name.
status: review
owner: sergio-bershadsky
style: bus
participants:
  - alias: api
    ref: /product/platform/component/st2api
    role: publisher
  - alias: action-runner
    ref: /product/platform/component/st2actionrunner
    role: publisher
  - alias: notifier
    ref: /product/platform/component/st2notifier
    role: consumer
  - alias: workflow-engine
    ref: /product/platform/component/st2workflowengine
    role: consumer
  - alias: stream
    ref: /product/platform/component/st2stream
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
  - execution
  - streaming
---

What happens *after* a status change: the audit record is written and published,
and three different kinds of consumer take it for three unrelated reasons. The
notifier decides whether a human should be told. The workflow engine decides
whether the next task in a graph can start. The stream service forwards it to
whoever has an HTTP connection open. None of the three knows about the others.

Beside it runs a second exchange carrying the output of a still-running action,
chunk by chunk, which is what makes a long-running execution watchable.

## One routing key, five queues, three kinds of durability

The `update` key on the record exchange is the busiest address in the platform.
Bound to it are:

- the notifier's durable queue, one per installation, shared by every notifier
  process;
- the workflow engine's durable queue, named in the workflow namespace while
  bound to the *execution* exchange — the queues in this system are named for
  their consumer rather than for what they carry, and reading a broker's queue
  list therefore tells an operator who is listening and not what is on the wire;
- one unnamed, exclusive, auto-deleted queue per open output-stream connection.

And bound to the wildcard on the same exchange, one unnamed exclusive queue per
open general-stream connection, which therefore receives creates, updates and
deletes.

A description that can hold that is a description with per-queue properties. The
framework's `amqp` binding block has one `durable` boolean for the whole
transport and a required `queue` name for every binding, so it can express
neither the per-connection queues nor the difference between them and the two
that survive a restart.

## The exchange with the shortest life and the loudest traffic

Action output goes to its own exchange under the `create` key. Two consumers bind
it, both unnamed and both belonging to one HTTP request: the general stream and
the per-execution output stream. Nothing durable subscribes at all, so output
that nobody is watching is published and dropped — which is correct, since the
same chunks are also written to the document store and can be read back.

## The event names on the far side are made of the addresses

The stream service turns each message into a server-sent event whose name is the
exchange and the routing key joined by a double underscore. So the addresses in
this transport document are not internal detail: they are the vocabulary the
[event-stream](srn://stackstorm/protocol/event-stream@1) protocol publishes to
clients, and its default filter is a list of those joined names. That is a
direct, mechanical dependency of one protocol entity's surface on another's
addresses, and the framework has no way to express it — a protocol's
`relations.uses` may not point at another protocol's transport artifact, and even
if it could, the fact is a naming rule rather than a reference.

The service also renames the prefix back when an installation has configured a
custom one, so that the event names stay stable while the exchange names move.
The catalog therefore documents an address space that exists in two spellings, of
which the artifact can hold only one.

## The Arazzo description

`arazzo.yaml` re-describes this exchange as an action runner drives it, in the
OpenAPI Initiative's [Arazzo](https://spec.openapis.org/arazzo/latest.html)
format, grounded in `transport.yaml` — the two publishes it makes and nothing
else — the fan-out onto three queues is the broker's, and Arazzo models no
delivery confirmation, so it has no carrier here by construction rather than by
omission.

An Arazzo Description has a single executor, so it describes one participant's
path and never the whole exchange: `workflows/` stays the authoritative
choreography, and the sequence diagrams on this page derive from it alone. The
file is unvalidated — snapshotted with the entity, served as authored, and
judged by nothing: the framework states no rule about its contents. The portal
reads it to draw a step graph of each workflow, which checks nothing.

## Sources

Read at `v3.9.0`:
[`st2common/st2common/transport/execution.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/transport/execution.py),
[`st2common/st2common/transport/queues.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/transport/queues.py),
[`st2common/st2common/stream/listener.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/stream/listener.py),
[`st2actions/st2actions/notifier/notifier.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2actions/st2actions/notifier/notifier.py),
[`st2actions/st2actions/workflows/workflows.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2actions/st2actions/workflows/workflows.py).
