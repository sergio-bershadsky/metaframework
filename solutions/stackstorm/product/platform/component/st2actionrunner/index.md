---
name: st2actionrunner
kind: component
version: 1
title: st2actionrunner
summary: Runs the actions — locally, or on another machine over SSH or WinRM — and is where every automation this platform performs actually happens.
status: review
owner: sergio-bershadsky
component-type: job
lifecycle: released
criticality: 1
relations:
  uses:
    - /environment/single-box
    - /environment/ha-cluster
    - /environment/dev-compose
    - /product/platform/protocol/execution-lifecycle
  exposes:
    - /product/platform/protocol/trigger-dispatch
  depends-on:
    - ../st2common
    - ../mongodb
    - ../rabbitmq
    - ../redis
tags:
  - execution
  - ssh
  - winrm
x-runtime: python
---

The process the whole product is built around. Everything else routes, decides,
records or displays; this one does the thing.

**Trigger:** messages on durable named queues bound to the execution-state
exchange, one queue per state it reacts to — a scheduled execution to start, and
separately a cancel, a pause and a resume for one already running.

**Effect:** it selects the runner type the action declares, executes it, streams
output as it is produced, and publishes the terminal state. For a Python action
or a sensor from a pack, "executes" means importing somebody else's code into a
process this repository owns, inside the virtual environment the pack was
installed with.

## The outbound half, and the wire the enum cannot name

Several of the shipped runner types reach another computer: two over SSH and
three over WinRM. This is not a peripheral integration — it is the reason
organisations deploy StackStorm at all, and it is the outbound counterpart to
every inbound event the rules engine matched.

Neither wire has a value in `transport.kind`, and neither has a nearest
neighbour worth taking. The argument is on
[managed-host](srn://stackstorm/actor/managed-host), the counterpart at the far
end, because that is where the pattern across three catalogs is visible at once.

## Competing consumers, and why that is the honest reading

The project documents this process as active-active, and the mechanism is
exactly the durable shared queue: several runners bind the same queue, the
broker hands each message to one of them, and the work spreads. It is the
clearest instance in this catalog of the bus doing load distribution rather than
notification, and it is worth naming because the same broker carries both
patterns and the mini-spec's single `durable` boolean cannot tell them apart.

## Why criticality 1

If this process stops, nothing runs. Rules still match and executions still
queue — the platform looks alive from every surface — and not one of them
progresses. That combination, a silent stop with a healthy-looking front end, is
the blast radius the field is for.
