---
name: remediate-an-alert
kind: journey
version: 1
title: Remediate an alert
summary: An alert arrives from a monitoring system, an action changes a machine, and the operator finds out what happened — a path with a long stretch in the middle that no actor walks.
status: review
owner: sergio-bershadsky
actor: /actor/automation-operator
relations:
  uses:
    - /environment/ha-cluster
tags:
  - remediation
  - cross-product
---

The path the product is bought for. Something breaks, a monitoring system says
so, and a machine gets fixed without anybody being woken up. The operator's part
of it begins after the fact: they find out that it happened, watch it if they are
awake, and read the record afterwards.

## Outcome

A machine has been changed by a run that somebody can point at afterwards, and
the operator can answer what ran, why it ran, and what it printed — without
logging in to the machine.

## The steps this path cannot contain, which is the finding

Between the alert arriving and the action landing, the platform does the work
that the whole
[trigger-dispatch](srn://stackstorm/product/platform/protocol/trigger-dispatch@1)
and
[execution-lifecycle](srn://stackstorm/product/platform/protocol/execution-lifecycle@1)
protocols describe: a trigger instance is created, a rule matches, a live action
is requested, a scheduler admits it, a runner picks it up. Five processes, four
exchanges, and **not one of those steps has an actor**.

The journey kind requires an `actor` on every step, and it is right to: a field
that defaults is a field that hides its exceptions. But the requirement assumes
that a path is made of somebody's moves, and the defining property of an
event-driven automation platform is that the interesting stretch is nobody's.
Attributing those steps to the operator would be false — they are asleep — and
attributing them to the monitoring system would be worse.

So the path below jumps: `steps[0]` is the alert arriving, and `steps[1]` is a
person opening a browser some time later. Everything between them is in the
protocol entities, where it belongs, and the journey is silent about the part of
the story a reader most wants a picture of.

This is the first catalog in this repository to describe a system whose centre is
unattended, and it is the first to hit this. A step-level actor of
`none` — the same shape the `protocol` field already has three states for —
would express it exactly.

## The step where the actor is the object

`steps[3]` names [managed-host](srn://stackstorm/actor/managed-host) as the actor
of the hop that reaches it. That is backwards and the format cannot say so: the
runner opens the connection, the host answers. Every other step in every journey
in this repository has an actor who initiates; this one has an actor who is
acted upon.

Writing the runner as the actor was not available — a component is not an actor —
and omitting the step would have removed the only appearance in any journey of
the thing the product exists to do.

## Preconditions

A rule exists that matches this alert and names an action. Writing that rule is
[install-a-pack](srn://stackstorm/journey/install-a-pack@1) plus an authoring
step this catalog does not have a journey for.

## Out of scope

Whether the remediation worked. The platform records what the action returned;
whether the alert clears is the monitoring system's opinion, and nothing in this
solution asks it.
