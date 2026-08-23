---
name: st2sensorcontainer
kind: component
version: 2
title: st2sensorcontainer
summary: Supervises the sensors installed packs bring — third-party processes it starts, restarts and feeds — and is the job whose real character the type set cannot say.
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
    - /product/platform/protocol/registration-events
  exposes:
    - /product/platform/protocol/trigger-dispatch
  depends-on:
    - ../st2common
    - ../mongodb
    - ../rabbitmq
    - ../redis
tags:
  - sensors
  - supervisor
x-runtime: python
x-hosts-third-party-code: true
---

The inbound edge of the platform. A **sensor** is a plugin that watches
something outside — a queue, a filesystem, an API it polls, a socket it listens
on — and emits trigger instances when it sees an event. Sensors arrive inside
packs, which means the code this process runs is written by
[pack-author](srn://stackstorm/actor/pack-author) and not by this project.

**Trigger:** startup, plus changes to the set of registered sensors. It also
consumes sensor lifecycle messages so that installing or disabling a pack takes
effect without a restart.

**Effect:** it starts each enabled sensor as a child process, keeps it alive,
and publishes whatever trigger instances the sensor produces onto the dispatch
exchange, from where the rules engine sees them.

## The strain: a `job` that hosts other people's code

The `job` discipline's tests are answerable here — the trigger is stated, the
effect is stated, there is no inbound surface — and passing those tests still
leaves the interesting sentence unsaid. This component is a **supervisor of
arbitrary third-party subprocesses**, and that character changes everything a
reviewer would want to know about it: its blast radius is not its own code's,
its memory profile is not its own, a fault inside it is usually somebody else's
fault, and its dependency set is unbounded and unknowable from this repository.

No `component-type` says that. `job` is right about the shape and silent about
the substance, and the escape hatch above (`x-hosts-third-party-code`) is
invisible to every check the framework runs. A sibling survey in this repository
recorded an adjacent strain from the opposite direction — a runtime whose
*modules* have no deployment of their own — which suggests the missing axis is
"what is the relationship between this component and the code inside it", and
the type set does not have one.

## Partitioning, and why this is not simply active-active

Several instances may run, but not the way the runners do. The runners share a
queue and the broker splits the work; sensors cannot be split that way, because
two containers running the same sensor would both see the same external event
and emit it twice. The project's answer is **partitioning**: each container is
configured or coordinated to own a subset of the sensors. That is a different
scaling mechanism from every other job here, and it is why the coordination
backend appears in this component's dependencies.

## Why criticality 2

Losing it stops one whole class of automation — everything event-driven that
does not arrive over a webhook — while leaving scheduled and manually started
work untouched.
