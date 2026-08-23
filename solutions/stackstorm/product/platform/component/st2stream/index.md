---
name: st2stream
kind: component
version: 2
title: st2stream
summary: The server-sent-events endpoint — an open HTTP response that keeps emitting bus traffic as it happens, and the surface the ontology has no shape for.
status: review
owner: sergio-bershadsky
component-type: service
lifecycle: released
criticality: 3
relations:
  uses:
    - /environment/single-box
    - /environment/ha-cluster
    - /environment/dev-compose
    - /product/platform/protocol/execution-lifecycle
    - /product/platform/protocol/announcements
    - /product/platform/protocol/execution-updates
    - /product/platform/protocol/registration-events
  exposes:
    - /protocol/event-stream
  depends-on:
    - ../st2common
    - ../mongodb
    - ../rabbitmq
tags:
  - streaming
  - sse
x-runtime: python
x-listen-port: 9102
---

The only process that turns bus traffic back into HTTP. A client opens a
connection and the response never ends: execution updates, output as it is
produced, announcements and alias changes arrive as server-sent events until the
client goes away. It listens on the port recorded above, read from the
`[stream]` section of the sample configuration on `master`.

Two endpoint families exist and they behave differently: a general stream
filtered by event name, and a per-execution output stream that first replays the
output produced before the client connected and then continues live, closing
with an explicit end marker. The second one exists because the first forced
clients to reconnect and re-derive what they had missed.

## Why this process binds queues nobody named

Every other consumer in the platform binds a **durable, named** queue and shares
it with its peers — that is how work is distributed. This one binds
**anonymous, exclusive, auto-deleting** queues, one per exchange it follows, and
lets the broker generate the names at connection time. It has to: a stream
client is not a worker, and two stream processes must each receive *every*
event rather than half of them each.

That is the fact that breaks the framework's own transport mini-spec, and it
breaks it in the required-field sense rather than the awkward-wording sense.

## The two ontology findings that land here

**The `queue` field is required and these queues have no name.** The mini-spec's
`amqp` binding block requires a `queue` string per binding. There is nothing
true to write in it for a queue the broker names at runtime. The same block also
carries `durable` once, per transport, while this process's exchanges carry both
a durable worker queue and these non-durable ones — one boolean cannot state
both. The framework's other permitted dialect for `amqp` can express both cases
per channel, which makes the proprietary mini-spec strictly the weaker of the
two dialects exactly where the first real system arrives.

**`kind: http` is literally true and the operation object is the wrong shape.**
Server-sent events *are* HTTP, so the enum value is not the problem here. The
`http` binding's operation object names one `request` datamodel and one
`response` datamodel; the response on this surface is an unbounded sequence of
differently-typed events drawn from several exchanges. Two other catalogs in
this repository reached for `websocket` when they needed a long-lived
server-push surface. Server-sent events get neither that value nor a shape that
fits, and this is a *different* failure from the enum being closed — the value
is right and the surface list cannot describe it.

## Why criticality 3 and not 1

Nothing depends on this process to run automation. If it stops, the web UI stops
updating by itself and a human presses reload; rules still fire, actions still
run, and the audit trail is still written. It is the one service here whose loss
is a degraded experience rather than an outage.
