---
name: registration-events
kind: protocol
version: 1
title: Registration events
summary: Three exchanges telling long-running processes that the content they were configured from has changed — and the third kind of queue name in this system, invented by the client at connect time.
status: review
owner: sergio-bershadsky
style: bus
participants:
  - alias: api
    ref: /product/platform/component/st2api
    role: publisher
  - alias: sensor-container
    ref: /product/platform/component/st2sensorcontainer
    role: consumer
  - alias: timers-engine
    ref: /product/platform/component/st2timersengine
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
  - content
---

The quiet conversation that makes runtime-installed content work. When a pack is
installed, a rule is written, or an alias is edited, the records change in the
document store — and several processes are already running with the old picture
in memory. A sensor process is watching for one set of triggers; the timers
engine is holding a set of timers; the stream service is holding the alias list
it hands to chat clients. Each of them subscribes to the create, update and
delete events for the records it cares about, and re-reads.

Three exchanges carry it, one per record kind, and they are one protocol entity
because they are one mechanism used by one set of processes for one purpose.

## The third kind of queue name

This protocol is where the framework's `queue` field runs out for the third time,
in a way neither of the other two shows. The queues here are **named by the
client at connect time**: a fixed base, a suffix naming the process or the
watching class, and a random hexadecimal tail so that two processes watching the
same thing do not collide. They are exclusive to the connection that made them.

So the three kinds of queue name in this system are:

- fixed constants, which the mini-spec's required `queue` string can hold —
  eleven of them;
- broker-generated, where the field must be left empty and AsyncAPI's
  `address: null` is the truthful spelling;
- client-generated at runtime from a template, where the *pattern* is the fact
  and neither dialect has a field for a pattern.

A catalog can write the pattern in prose, which is what this one does. What it
cannot do is put it where a reader of the transport artifact will find it, and
the difference matters because the pattern is what an operator sees in the
broker's management console when they wonder what all these queues are.

## `st2.preinit`, a queue that exists so that a rule is not lost

At start-up the platform pre-declares its queues so that messages published
before a consumer is online are still routed. Two of the entries in that list are
a queue literally named for the pre-initialisation step, declared twice against
two different exchanges with the routing key `init` — a placeholder whose purpose
is to make the *exchange-to-queue* topology exist before any watcher has
connected.

It is the only place in this system where one queue name is declared against two
exchanges. Neither dialect can say that: the mini-spec has one exchange per
transport, and an AsyncAPI channel carries either an exchange or a queue and
never the edge between them.

## No payload is named on these channels

The channels below carry the changed record itself, and this catalog does not
model the three record kinds they carry. That is a scope decision rather than an
omission: a trigger, a sensor registration and a chat alias are things an
operator *authors*, whose shapes belong to the REST API surface and to the pack
format, while the datamodels here are the platform's own work items. The message
that matters on this protocol is "the set you were configured from has changed",
and the consumer's response to all three is the same — re-read from the store.

Leaving the payload unnamed is the same convention the
[kubeedge](srn://kubeedge) catalog adopted for wrapper messages, and it has the
same cost: the message-by-datamodel matrix on this page is empty, and a reader
has to take the prose's word for what is on the wire.

## What is not here

The rules engine does not appear. Rules are matched from the document store on
each trigger instance rather than held in memory, so a rule change needs no
event. That asymmetry — sensors and timers need telling, rules do not — is the
kind of thing a catalog is for.

## Sources

Read at `v3.9.0`:
[`st2common/st2common/transport/reactor.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/transport/reactor.py),
[`st2common/st2common/transport/actionalias.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/transport/actionalias.py),
[`st2common/st2common/services/triggerwatcher.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/services/triggerwatcher.py),
[`st2common/st2common/services/sensor_watcher.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/services/sensor_watcher.py),
[`st2common/st2common/util/queues.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/util/queues.py),
[`st2common/st2common/transport/bootstrap_utils.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/transport/bootstrap_utils.py),
[`st2reactor/st2reactor/container/sensor_wrapper.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2reactor/st2reactor/container/sensor_wrapper.py).
