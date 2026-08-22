---
name: st2rulesengine
kind: component
version: 1
title: st2rulesengine
summary: Matches every dispatched trigger instance against every enabled rule and requests the actions the matches call for.
status: review
owner: sergio-bershadsky
component-type: job
lifecycle: released
criticality: 2
relations:
  uses:
    - /environment/single-box
    - /environment/ha-cluster
    - /environment/dev-compose
    - /product/platform/protocol/trigger-dispatch
  exposes:
    - /product/platform/protocol/execution-lifecycle
  depends-on:
    - ../st2common
    - ../mongodb
    - ../rabbitmq
tags:
  - rules
  - worker
x-runtime: python
---

The middle of the loop. Something outside emitted an event, a sensor or a
webhook turned it into a trigger instance, and this process decides whether
anybody asked for anything to happen about it.

**Trigger:** a message on the trigger-instance dispatch exchange. It binds a
durable named queue with the catch-all routing key, so it sees every dispatched
instance regardless of trigger type.

**Effect:** for each rule whose criteria match, it applies the rule's mapping
from trigger payload to action parameters and requests an execution — which,
like everything else here, means writing a record and publishing it, not running
anything.

## Why this is a `job` and the classification is not a preference

It has no listener. Nothing can call it; it is not reachable; it has no port and
no route table. The `job` discipline's test — no inbound surface is the
definition — answers itself, and it answers the same way for seven of this
process's siblings. That is why this product's component set is shaped unlike
any other in the repository.

The discipline's other requirement, that a job name its trigger and its effect,
is met by the two bold lines above, and they are the two sentences that actually
distinguish this process from its neighbours.

## Where the rule language is, and is not

The criteria language, the operators it supports, and the payload-mapping
template syntax are the rule *format*, and the format is a datamodel rather than
a property of this process. This page describes the process that evaluates it.

## Scaling

The project documents this process as active-active: several may run, each
taking work off the same queue. That is competing consumers on a shared durable
queue and it is the ordinary pattern for six of the eight jobs here. The two
exceptions — a singleton and a periodic cleaner — say so on their own pages.
