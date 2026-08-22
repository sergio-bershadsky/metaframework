---
name: st2timersengine
kind: component
version: 1
title: st2timersengine
summary: Fires the platform's clock triggers — and is the one component here whose replica count is a correctness constraint the contract cannot hold.
status: review
owner: sergio-bershadsky
component-type: job
lifecycle: released
criticality: 3
relations:
  uses:
    - /environment/single-box
    - /environment/ha-cluster
    - /environment/dev-compose
  exposes:
    - /product/platform/protocol/trigger-dispatch
  depends-on:
    - ../st2common
    - ../mongodb
    - ../rabbitmq
tags:
  - scheduling
  - singleton
x-runtime: python
x-replica-constraint: exactly-one
---

**Trigger:** a clock. This is the one process in the platform whose input is not
a message but the passage of time: interval, date and cron-style timers, each
firing a trigger instance when it comes due.

**Effect:** it publishes trigger instances onto the dispatch exchange, from
where they are indistinguishable from an event a sensor or a webhook produced.
That is how "every night at two" becomes an ordinary rule match.

## The constraint, and the hole it exposes

The project states this process cannot run active-active, and its own Helm chart
pins it to a single replica. Two instances would fire every timer twice: two
executions, two remediations, two of whatever the automation does. Unlike the
coordination-backed concurrency policies elsewhere in this platform, there is no
lock that makes a second instance safe — the correct number is one.

**The component contract has no field for that, and the finding is the shape of
the gap rather than the missing field.** `x-replica-constraint` above is the
escape hatch, which means it is invisible to every check. Placement and scale
are the environment kind's business, and an environment's `topology.yaml`
carries `replicas: {min, max}` — a *claim about a deployment*, per-environment,
which a reviewer reads. So the fact is expressible three times over as "here we
run one" and not once as "one is the only correct number, everywhere, forever".

The difference matters because the two statements fail differently. A placement
claim that disagrees with reality is drift, and the framework already warns
about drift. A correctness constraint that a deployment violates is an incident,
and nothing in the catalog can tell the two apart. This is a modelling gap, not
an authoring mistake, and it belongs to the topology lane rather than to the
component kind — which is exactly why it is recorded here, on the entity that
has it, rather than argued in the abstract.

## Why criticality 3 and not 1

Losing this process stops scheduled automation and touches nothing else: rules
still fire on events, actions still run, and every surface stays up. Running two
of it is far worse than running none, and that asymmetry is not something
`criticality` can express either.
