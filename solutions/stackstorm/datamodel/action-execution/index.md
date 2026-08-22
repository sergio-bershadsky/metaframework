---
name: action-execution
kind: datamodel
version: 1
title: Action execution
summary: The audit record of one run — the live action plus copies of everything that caused it, published on create, update and delete and consumed by three services.
status: review
owner: sergio-bershadsky
usage: both
abstract: false
tags:
  - execution
  - audit
  - bus
---

The record an operator actually reads. Where
[live-action](srn://stackstorm/datamodel/live-action@1) is the work item that the
scheduler and the runner pass between them, an action execution is the *history*
of that work: the same status, the same result, plus embedded copies of the
action, the runner type, the rule, the trigger, the trigger type and the trigger
instance that led to it.

It is published on the general execution exchange under `create`, `update` and
`delete`, and three consumers care: the notifier waits on `update` to fire
notifications, the workflow engine waits on `update` to advance a workflow whose
task has finished, and the event stream forwards everything to whoever is
listening over HTTP.

## Embedded copies, not references

The six related resources are stored **by value**. An execution written last year
still contains the rule as it was when it fired, not the rule as it is now. That
is deliberate in an audit record and it is why this schema does not `$ref` them:
a reference would claim the current shape of a resource that the record has
deliberately frozen, and the framework's `$ref` addresses the current schema by
construction.

The catalog therefore describes them as open objects, with the trigger side left
whole rather than half-modelled. This is a place where the schema is honestly
less precise than the system, and the reason is worth more than the precision.

## `log` is the transition history the state machine is not

Each entry pairs a timestamp with a status, appended as the execution moves. It
is the closest thing the platform has to a recorded state machine — an
observation of the path taken, written after the fact, rather than a declaration
of the paths that exist.

## `result-size` exists because results get large

Results are stored whole and can be very large; the size is recorded separately
so that a list view can decide whether to fetch one. A related field, the output
of a still-running execution, is not here at all — it streams as
[action-execution-output](srn://stackstorm/datamodel/action-execution-output@1)
on its own exchange.

Read at `v3.9.0`:
[`st2common/st2common/models/api/execution.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/models/api/execution.py),
[`st2common/st2common/transport/execution.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/transport/execution.py).
