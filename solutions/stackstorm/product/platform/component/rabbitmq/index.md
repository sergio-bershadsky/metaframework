---
name: rabbitmq
kind: component
version: 2
title: RabbitMQ
summary: The bus every process here talks over — topic exchanges, durable worker queues, broker-named stream queues — and the component that settles why the store types are not interchangeable.
status: review
owner: sergio-bershadsky
component-type: external
lifecycle: released
criticality: 1
relations:
  uses:
    - /environment/single-box
    - /environment/ha-cluster
    - /environment/dev-compose
  exposes:
    - /product/platform/protocol/trigger-dispatch
    - /product/platform/protocol/execution-lifecycle
    - /product/platform/protocol/announcements
    - /product/platform/protocol/execution-updates
    - /product/platform/protocol/registration-events
    - /product/platform/protocol/workflow-dispatch
tags:
  - messaging
  - amqp
  - infrastructure
---

The centre of the architecture. Almost every handoff in this platform — a
trigger instance reaching the rules engine, an execution reaching a runner, a
workflow advancing, output reaching the stream — is a message on a topic
exchange here. The processes are, from the broker's point of view, a set of
publishers and a set of consumers that never address each other.

## The seam

An AMQP 0-9-1 connection, configured from the `[messaging]` section: a URL
carrying credentials, host, port and virtual host, plus the prefix from which
every exchange and queue name in the system is derived. Everything above that
line — which exchanges exist, what type they are, which queues bind with which
routing keys — is declared in constants inside
[st2common](srn://stackstorm/product/platform/component/st2common) and is
described on the protocol entities, not here.

Two shapes of binding coexist on this broker and the difference is load-bearing:
**durable named queues** shared by competing consumers, which is how work is
distributed, and **anonymous exclusive auto-deleting queues** created per
connection, which is how
[st2stream](srn://stackstorm/product/platform/component/st2stream) gets every
event rather than a share of them.

## Why `datastore` would be actively false here

This is the case that settles the type question for all three infrastructure
components in this product. RabbitMQ holds no state of record: a message here is
in flight, and the record of what happened is written to
[mongodb](srn://stackstorm/product/platform/component/mongodb). Calling it a
"holder of persistent state addressed as infrastructure" would be wrong rather
than merely imprecise.

`external` is the only surviving value, and it says nothing at all about what
the thing does. That is the finding: for the single most architecturally
significant piece of infrastructure in this solution, the component type carries
no information beyond "not ours". A reader learns what this component is from
the prose, and a machine learns nothing.

## Criticality 1, and what it means here

If the broker is unavailable, nothing moves. Executions are not dispatched,
trigger instances are not routed, workflows do not advance, and the API keeps
answering — writing records that will never be acted on. The failure mode is
again a healthy-looking front end with a stopped middle, which is the same shape
[st2actionrunner](srn://stackstorm/product/platform/component/st2actionrunner)
has and the reason both carry the top tier.
