---
name: coordination
kind: protocol
version: 1
title: Coordination
summary: Distributed locks and group membership over a pluggable backend — a real protocol between four processes and a store, and one the transport enum has no value for at all.
status: review
owner: sergio-bershadsky
style: request-response
participants:
  - alias: api
    ref: /product/platform/component/st2api
    role: client
  - alias: action-runner
    ref: /product/platform/component/st2actionrunner
    role: client
  - alias: scheduler
    ref: /product/platform/component/st2scheduler
    role: client
  - alias: workflow-engine
    ref: /product/platform/component/st2workflowengine
    role: client
  - alias: notifier
    ref: /product/platform/component/st2notifier
    role: client
  - alias: coordination-backend
    ref: /product/platform/component/redis
    role: server
tags:
  - coordination
  - locking
  - ontology-strain
---

The conversation that makes several copies of the same process safe to run. Five
of the platform's processes take named locks before doing things that must not
happen twice: admitting an execution whose action carries a policy, applying that
policy, advancing a workflow task, writing a datastore key, running the
notifier's auxiliary scheduling pass. They also join named groups, which is how
the platform's own service registry knows who is alive.

It is a real protocol by every test this framework applies — named participants,
a request that contracts a reply, a wire between separate processes — and it has
**no `transport.yaml`**, because there is no value of `transport.kind` that is
true of it.

## Why no transport artifact exists

The client library is an abstraction over several backends, and the URL scheme
picks one at deployment time. The documented examples in the source span a
key-value store, a coordination service, a relational database, an in-memory
implementation for tests, and a *directory on the local filesystem*.

That is the shape of the problem. The enum — `http`, `grpc`, `amqp`, `kafka`,
`websocket`, `in-process` — is a list of wire technologies, and this protocol's
wire is a deployment choice that ranges from a network round-trip to a lock file
on one host. Writing any one of the six would be a claim about a deployment; the
framework's own rule that a transport is a property of the protocol rather than
of the environment is exactly what cannot hold here.

This is the third catalog in this repository to land in the same place from a
different direction. The `brass` catalog forced stdio into `in-process` with a
note; the uncommitted `kubeedge` catalog has no value for MQTT and none for a
Unix socket; this one has a protocol whose wire is chosen after the description
is written. The pattern is now about the enum rather than about any catalog: the
six values describe *how bytes travel between two named processes*, and real
systems keep having seams where that is either unknown or not the interesting
fact.

## The default deployment turns the protocol off

With no backend URL configured, the platform substitutes a no-op implementation:
every lock is granted immediately, every group operation succeeds, and the
service logs a warning that says race conditions are possible. That is the
shipped default, and it is what a single-box installation runs.

So this protocol is the one described here whose *presence* depends on the
environment, and the catalog has nowhere to say that either. A component's
`uses` edge to an environment states where it runs, and a `topology.yaml` states
what is placed where; neither can express "this conversation does not happen in
that target". It is recorded here, in prose, and on
[redis](srn://stackstorm/product/platform/component/redis).

## What the participants do with it, precisely

- The **scheduler** takes a lock before admitting an execution whose action has
  policies that require one — and, when no backend is configured, logs that
  policy enforcement is now best effort and admits it anyway.
- The **action runner** takes a lock per policy evaluation, which is what makes a
  concurrency policy mean anything when several runners are alive.
- The **workflow engine** takes one per graph it advances, so two engines cannot
  drive the same workflow into two different next tasks.
- The **API** takes one around a datastore write, and one keyed on an
  execution's own id when it updates that execution's record.
- The **notifier** needs one for its auxiliary scheduling pass, which is the
  documented reason a multi-instance deployment must configure a real backend.

Each of those is a lock name, and none of them is enumerable from a transport
artifact this catalog is able to write.

## Sources

Read at `v3.9.0`:
[`st2common/st2common/services/coordination.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/services/coordination.py),
[`st2common/st2common/policies/concurrency.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/policies/concurrency.py),
[`st2actions/st2actions/worker.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2actions/st2actions/worker.py),
[`st2actions/st2actions/workflows/workflows.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2actions/st2actions/workflows/workflows.py),
[`conf/st2.conf.sample`](https://github.com/StackStorm/st2/blob/v3.9.0/conf/st2.conf.sample),
and the project's own high-availability reference
(<https://docs.stackstorm.com/reference/ha.html>).
