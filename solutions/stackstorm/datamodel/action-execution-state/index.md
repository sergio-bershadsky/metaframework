---
name: action-execution-state
kind: datamodel
version: 1
title: Action execution state
summary: The polling record for asynchronous runners — published to a durable, pre-declared, bound queue that no shipped process consumes.
status: review
owner: sergio-bershadsky
usage: both
abstract: false
tags:
  - execution
  - bus
  - dead-surface
---

Three fields and a finding. When a runner starts work that finishes somewhere
else, it writes one of these: the id of the execution to come back to, the name
of the module that knows how to ask whether it is done, and an opaque context
that module needs in order to ask. Saving it publishes it under the `create`
routing key on an exchange of its own.

## The queue on the other side has no consumer

At `v3.9.0` the exchange, the durable queue named for a results tracker, and the
binding between them all exist and are declared at service start-up — the queue
is in the list the platform pre-declares precisely so that messages are not lost
while no consumer is online. Nothing consumes it. Searched across the whole
source tree at that tag, the queue constant appears in the module that defines
it and the module that pre-declares it, and nowhere else; there is no results
tracker entry point beside the four the action services publish.

The reading is not that this is broken. It is that the platform kept a
publisher, an exchange, a durable queue and a binding after the service that
drained them stopped shipping, and the messages now accumulate in a queue with
no reader. That is a fact about a running system that only a catalog written from
the source would notice.

## What it costs the ontology

A protocol needs at least two participants. This conversation has a publisher, a
broker, a durable queue — and nobody at the far end. It is described as a channel
of
[execution-lifecycle](srn://stackstorm/product/platform/protocol/execution-lifecycle@1)
rather than as an entity of its own, because as an entity of its own it could not
be authored: `E_PROTO_PARTICIPANTS` would reject the honest participant list, and
adding a consumer to make the file legal would be inventing one.

## The fields

`query-module` names a Python module, not a queue and not a URL — the indirection
is in-process. `query-context` is whatever that module needs, and its shape is
therefore the module's; the record constrains it to a mapping.

Read at `v3.9.0`:
[`st2common/st2common/models/db/executionstate.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/models/db/executionstate.py),
[`st2common/st2common/transport/actionexecutionstate.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/transport/actionexecutionstate.py),
[`st2common/st2common/transport/bootstrap_utils.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/transport/bootstrap_utils.py).
