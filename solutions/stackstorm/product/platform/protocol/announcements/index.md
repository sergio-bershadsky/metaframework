---
name: announcements
kind: protocol
version: 2
title: Announcements
summary: The one exchange whose address space belongs to the person writing the automation — and whose only subscriber binds a pattern that half of the documented address space cannot match.
status: review
owner: sergio-bershadsky
style: bus
participants:
  - alias: action-runner
    ref: /product/platform/component/st2actionrunner
    role: publisher
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
  - streaming
---

An automation that wants to tell the outside world something runs an action whose
runner does nothing but publish. The action's parameters become the payload, one
of its runner parameters becomes the routing key, and the message goes onto an
exchange whose only subscriber is the event stream. Nothing stores it and nothing
acts on it: an announcement is a message to whoever happens to be listening.

The runner refuses to run without an explicit acknowledgement parameter that the
mechanism is experimental, so every message on this exchange was published by an
automation whose author said so in the action's own parameters.

## The address space is authored by the pack, and the subscriber does not match it

This is the only exchange in the platform whose routing keys are not decided by
the platform. Everywhere else a key is a status or one of create, update, delete.
Here it is whatever the action passed, defaulting to a single word.

The runner's own parameter documentation says the value may be several words
separated by dots. The one consumer binds the single-word wildcard. Under AMQP
0-9-1 topic semantics that pattern matches exactly one word, so a dotted route —
the documented multi-word form — is published successfully and matches no queue.
The catalog states this as what the two ends declare, not as an observed
failure: it is the kind of disagreement a description finds and a runtime does
not report.

## One route is a de facto standard

The address space is open, and one address in it is load-bearing anyway: the
ChatOps bridge listens, through the event stream, for the event built from this
exchange and the route `chatops`. An automation that wants to reach a chat room
publishes with that route, and the bridge's listener is a literal string in a
different repository.

Nothing in this platform declares that convention. It is a shared constant with
no home — not in a configuration file, not in a schema, and not in any artifact
this framework offers. The catalog can only write it down where somebody will
read it, which is here and on
[event-stream](srn://stackstorm/protocol/event-stream@1).

## What the transport document cannot say

The publish address is chosen at runtime, so the channel that carries it has
`address: null` — AsyncAPI's own spelling for an address generated at runtime.
The parameter's default value is recorded in an extension beside it, because a
default is not an address.

The mini-spec has no equivalent move. Its `bindings[].routing-key` is a required
string, and the only true string here is a pattern with a hole in it.

## A protocol with three participants and no correlation

There is no reply, no acknowledgement to the publisher, and no way for an
automation to learn whether anybody heard it. `style: bus` is exactly right, and
the entity is a good demonstration of why the coarse value is enough: everything
interesting is one level down, in a routing key nobody in the platform controls.

## The Arazzo description

`arazzo.yaml` re-describes this exchange as the announcing automation drives it,
in the OpenAPI Initiative's
[Arazzo](https://spec.openapis.org/arazzo/latest.html) format, grounded in
`transport.yaml` — one publish, with no criterion and no timeout, because
nothing comes back that either could read — which is the same thing this page
says in prose, in the format's own terms.

An Arazzo Description has a single executor, so it describes one participant's
path and never the whole exchange: `workflows/` stays the authoritative
choreography, and the sequence diagrams on this page derive from it alone. The
file is unvalidated — snapshotted with the entity, served as authored, and
judged by nothing: the framework states no rule about its contents. The portal
reads it to draw a step graph of each workflow, which checks nothing.

## Sources

Read at `v3.9.0`:
[`st2common/st2common/transport/announcement.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/transport/announcement.py),
[`contrib/runners/announcement_runner/announcement_runner/runner.yaml`](https://github.com/StackStorm/st2/blob/v3.9.0/contrib/runners/announcement_runner/announcement_runner/runner.yaml),
[`contrib/runners/announcement_runner/announcement_runner/announcement_runner.py`](https://github.com/StackStorm/st2/blob/v3.9.0/contrib/runners/announcement_runner/announcement_runner/announcement_runner.py),
[`st2common/st2common/transport/queues.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/transport/queues.py),
[`st2common/st2common/stream/listener.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/stream/listener.py).
