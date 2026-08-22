---
name: action-execution-output
kind: datamodel
version: 1
title: Action execution output
summary: One chunk of stdout or stderr from a running action, stored and published on its own exchange so an operator can watch a run before it finishes.
status: review
owner: sergio-bershadsky
usage: both
abstract: false
tags:
  - execution
  - streaming
---

The reason an operator can watch a long action rather than wait for it. While a
runner is working, it writes chunks of the process's output as records of this
shape; each one is persisted and published on an exchange of its own, and the
stream service turns them into server-sent events for the CLI's tail command and
the web UI's console.

This is the only payload in the platform whose lifetime is measured in
milliseconds and whose consumers are all transient. The queue that carries it is
unnamed, exclusive and auto-deleted — it belongs to one stream connection and
dies with it — which is the shape the framework's `amqp` binding block has no
field for; see
[execution-updates](srn://stackstorm/product/platform/protocol/execution-updates@1).

## `data` is characters, and the type is the split

`output-type` names which stream the characters came from — the runner writes
standard output and standard error separately — and `data` carries the chunk. No
sequence number, no offset: order is the order records were written, and a
consumer that reconnects re-reads what is already stored and then follows the
live tail. The record's own timestamp is the only ordering the shape carries.

## `delay` is a rate-limiting hint, not a duration

The field exists so a producer can tell a consumer to pace itself when output
arrives faster than it can be forwarded. It says nothing about how long the
action ran.

## Why the routing key is `create` and never `update`

An output chunk is only ever created. There is no edit and no delete in the
normal path, so the one binding that matters on this exchange is the create key,
and the stream service's queue binds exactly that.

Read at `v3.9.0`:
[`st2common/st2common/models/api/execution.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/models/api/execution.py),
[`st2common/st2common/transport/execution.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/transport/execution.py),
[`st2common/st2common/transport/queues.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/transport/queues.py).
