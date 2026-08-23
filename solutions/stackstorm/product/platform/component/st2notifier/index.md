---
name: st2notifier
kind: component
version: 2
title: st2notifier
summary: Emits the notification triggers a finished execution asked for — and doubles as a backup scheduler for executions that got stuck.
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
    - /product/platform/protocol/coordination
    - /product/platform/protocol/execution-updates
  exposes:
    - /product/platform/protocol/trigger-dispatch
  depends-on:
    - ../st2common
    - ../mongodb
    - ../rabbitmq
    - ../redis
tags:
  - notification
  - worker
x-runtime: python
---

**Trigger:** a durable named queue on the execution exchange, bound to the
update routing key, so it sees executions as they change.

**Effect:** where the action declared notification rules, it emits the
corresponding triggers back into the platform — which means a finished execution
can be the event that starts another rule. Notification here is not an outbound
integration; it is a loop back to the beginning.

## The second job, and why it makes this component awkward

This process is also a periodic rescuer. Executions can end up in a requested
state with nothing having picked them up, and a timed pass in this process
re-drives them. That is a scheduler's job living inside a notifier, and it is
not an accident of naming: it is why this process needs the coordination backend
at all, since two instances both rescuing the same execution would start it
twice.

The project offers two ways out of that in a replicated deployment — a shared
coordination backend, or turning the rescue pass off everywhere except one
instance — and the second is a *per-instance* configuration difference between
components that this catalog models as one component. Two of these processes
running the same image with one feature disabled in all but one of them is not a
composition the component kind can express.

The component contract also has no way to say "this component has two unrelated
responsibilities, one of which constrains how many of it may run". The
`component-type` names its character once, `criticality` names its blast radius
once, and the second responsibility is a paragraph. Splitting the process into
two components would be describing a decomposition the code does not have.

## Why criticality 3

Its loss degrades rather than stops: notifications go missing, and the rescue
pass stops running, which matters only for executions that were already stuck.
Nothing that is working stops working.
