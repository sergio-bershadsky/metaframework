---
name: workflow-dispatch
kind: protocol
version: 2
title: Workflow dispatch
summary: Two routing keys and two durable queues that hand a workflow graph to whichever engine is free — beside an exchange that is declared, pre-declared, and never published to.
status: review
owner: sergio-bershadsky
style: bus
participants:
  - alias: action-runner
    ref: /product/platform/component/st2actionrunner
    role: publisher
  - alias: workflow-engine
    ref: /product/platform/component/st2workflowengine
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
  - workflow
---

A workflow is an action like any other until the runner that picks it up realises
it is a graph. At that point the runner does not execute anything: it writes a
[workflow-execution](srn://stackstorm/datamodel/workflow-execution@1) record and
publishes its status, and a different process — the workflow engine — takes it
from the queue bound to that status and starts asking the conductor what to run
next.

Two keys carry the whole handover. One says *a graph is waiting*; the other says
*a held graph may go on*. Everything else the engine needs arrives on
[execution-updates](srn://stackstorm/product/platform/protocol/execution-updates@1),
whose `update` key tells it that a task finished.

## An exchange that nothing has ever published to

The platform declares two workflow exchanges and pre-declares both at start-up:
a status exchange and a record exchange. The status exchange is the one described
here. The record exchange has a publisher class, a declaration, and — measured
across the shipped source at `v3.9.0` — **no publish call**: every write of a
workflow execution record passes publishing explicitly off, and the one call site
that takes the flag as a parameter defaults it off and is never given anything
else.

So the catalog is describing a wire with an address, a topology and no traffic.
There is no honest way to write that as a channel, because a Channel Object
asserts that somebody is at one end of it; it is recorded in an extension at the
document root instead, next to the same problem's other instance in
[execution-lifecycle](srn://stackstorm/product/platform/protocol/execution-lifecycle@1),
where a durable queue has a publisher and no consumer.

Two dormant surfaces in one product, of opposite kinds — one with nobody
listening, one with nobody speaking — is the observation this catalog would not
have made from documentation. It is also a shape the ontology has no vocabulary
for at all: `status: deprecated` is about a *document*, and `lifecycle` belongs to
components, so there is no way for a protocol entity to say "this address is
still declared and no longer used".

## Why the participant list is three

The publisher is the action runner, because the orquesta runner runs inside it;
the consumer is the workflow engine; the broker is between them. The API does not
appear even though an operator can pause and resume a workflow, because the
API's part of that conversation is an HTTP request to
[rest-api](srn://stackstorm/protocol/rest-api@1) which becomes a *live action*
status change — the workflow's own pause and resume are published by the runner
that hosts the workflow's runner plugin.

Getting that wrong would have been easy and the catalog would not have caught it:
nothing checks that a participant is really on the wire.

## The Arazzo description

`arazzo.yaml` re-describes this exchange as the action runner drives it, in the
OpenAPI Initiative's [Arazzo](https://spec.openapis.org/arazzo/latest.html)
format, grounded in `transport.yaml` — handing a graph over, and letting a held
one go again — two workflows, because the second is a separate occasion rather
than a continuation of the first.

An Arazzo Description has a single executor, so it describes one participant's
path and never the whole exchange: `workflows/` stays the authoritative
choreography, and the sequence diagrams on this page derive from it alone. The
file is unvalidated — snapshotted with the entity, served as authored, and
judged by nothing: the framework states no rule about its contents. The portal
reads it to draw a step graph of each workflow, which checks nothing.

## Sources

Read at `v3.9.0`:
[`st2common/st2common/transport/workflow.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/transport/workflow.py),
[`st2common/st2common/transport/queues.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/transport/queues.py),
[`st2common/st2common/services/workflows.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/services/workflows.py),
[`st2common/st2common/persistence/workflow.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/persistence/workflow.py),
[`st2actions/st2actions/workflows/workflows.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2actions/st2actions/workflows/workflows.py),
[`contrib/runners/orquesta_runner/orquesta_runner/orquesta_runner.py`](https://github.com/StackStorm/st2/blob/v3.9.0/contrib/runners/orquesta_runner/orquesta_runner/orquesta_runner.py).
