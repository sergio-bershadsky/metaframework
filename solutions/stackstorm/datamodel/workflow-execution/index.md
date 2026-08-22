---
name: workflow-execution
kind: datamodel
version: 1
title: Workflow execution
summary: One run of a workflow graph — the compiled spec, the conductor's state, and the action execution that stands for it in the audit trail.
status: review
owner: sergio-bershadsky
usage: both
abstract: false
tags:
  - workflow
  - bus
---

What the workflow engine keeps while a workflow is in flight. It exists beside
the [action-execution](srn://stackstorm/datamodel/action-execution@1) that an
operator sees: the execution is the row in the history, this is the machine
behind it, and the link is the one required reference below.

Like a live action, its status is published as a routing key — on a separate
exchange, with two durable queues bound to two of the values — which is how a
workflow that was paused gets resumed by whichever engine instance is free.

## Three fields that are all the same kind of thing, and are not

`spec` is the workflow definition as compiled from the pack's own YAML. `graph`
is the task graph derived from that spec. `state` is where the conductor
currently is inside that graph. All three are stored as opaque mappings whose
shapes belong to the workflow engine, which ships from a different repository on
a different release train — so this catalog states the frames and points at that
component rather than inventing three schemas it would have to keep in step with
somebody else's library.

## `errors` is dynamic, and that is the model's word

The field is declared with the store's dynamic type, meaning the shape is
whatever was put there. In practice it holds the failures the conductor
collected; in the schema it holds anything, because nothing constrains it.

## Why `status` is not enumerated here

A live action's fourteen statuses are declared in one constants module and can be
transcribed. The workflow statuses come from the conductor library, and this
catalog does not describe that library's internals; stating a subset would claim
a closed set the surveyed source does not close. The field is a required string.

Read at `v3.9.0`:
[`st2common/st2common/models/db/workflow.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/models/db/workflow.py),
[`st2common/st2common/transport/workflow.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/transport/workflow.py).
