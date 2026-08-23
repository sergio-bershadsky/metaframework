---
name: st2workflowengine
kind: component
version: 2
title: st2workflowengine
summary: Drives multi-step workflows — advances the graph when a task finishes, and requests the next tasks as ordinary executions.
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
    - /product/platform/protocol/coordination
    - /product/platform/protocol/execution-updates
    - /product/platform/protocol/workflow-dispatch
  exposes:
    - /product/platform/protocol/execution-lifecycle
  depends-on:
    - ../st2common
    - ../orquesta
    - ../mongodb
    - ../rabbitmq
    - ../redis
tags:
  - workflow
  - worker
x-runtime: python
---

The process that turns a workflow definition into a sequence of ordinary
executions. It is the only component here whose behaviour is mostly somebody
else's library: the graph semantics — task order, transition conditions, data
passing — belong to
[orquesta](srn://stackstorm/product/platform/component/orquesta), and this
process is the part that connects that library to the bus and the store.

**Trigger:** two durable named queues on the workflow-state exchange, one for a
requested workflow and one for a resumed one, plus a queue on the execution
exchange that tells it a task it started has finished.

**Effect:** it asks the engine what comes next and requests those tasks as
executions, which then go through exactly the same scheduling and running path
as any other action.

## Why the recursion is worth stating

A workflow task is an execution, and an execution may itself be a workflow. The
platform has no separate machinery for nesting: the same queues, the same
scheduler, the same runners. That is an elegant property and also the reason a
runaway workflow is a capacity problem rather than a crash — the ontology has no
way to express "this component's load is a function of its own output", and this
page saying so is the only record of it.

## Coordination

Workflow-level concurrency policies are cluster-wide claims, so this process
takes locks from the coordination backend for the same reason
[st2scheduler](srn://stackstorm/product/platform/component/st2scheduler) does,
and inherits the same difference between a single-host and a clustered
deployment.

## Where the state machine is, and why this catalog does not draw one

Both a workflow and the executions under it move through named states, and those
transitions are real. They are not written down as a machine anywhere in the
source: the code validates that a state is a member of a set, and the ordering
lives implicitly in which state routes to which queue. Reconstructing a state
chart from that would be this reviewer's inference presented as a transcription,
so the catalog states the fact and declines to draw the diagram.
