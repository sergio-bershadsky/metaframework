---
name: edgecontroller
kind: component
version: 1
title: Edge controller
summary: Watches the workload objects an edge node needs and pushes them down the channel; writes node and pod status back up.
status: review
owner: sergio-bershadsky
component-type: job
lifecycle: released
criticality: 1
relations:
  depends-on:
    - /product/core/component/kubernetes-api-server
    - ../cloudhub
tags:
  - controller
x-deployment-unit: cloudcore
---

The bridge between the Kubernetes object model and the edge. Without it a node is
connected and has nothing to run.

**Trigger.** Watches against the Kubernetes API server: pods scheduled to edge
nodes, and the config maps, secrets, services and endpoints those pods reference.

**Effect.** Sends the resulting objects to the node they belong to, through
[cloudhub](srn://kubeedge/product/core/component/cloudcore/component/cloudhub),
and applies the status the node reports back to the corresponding cluster object.

## Why `job` and not `service`

Because the type set has no better answer and this one is closer than it looks. A
`job` is defined as a scheduled or event-triggered worker with no inbound
surface, and that is exactly a Kubernetes controller: it is woken by a watch
event, it does work, it has nothing to call it. The word reads oddly for
something that never terminates, and the alternative reads worse — `service`
requires an inbound surface this module does not have, and choosing it would
misdescribe the component to every derived view that shapes nodes by type.

The type discipline for `job` asks for the trigger and the effect in prose. Both
are above, and stating them is more useful than the enum value either way.

## Direction, and why it matters here

Traffic in both directions crosses one connection per node, multiplexed, and that
connection is the fleet's whole upstream. The design consequence — that a node's
view of its own workloads is delivered rather than polled — is what makes the
edge's local store possible at all: a node that stops receiving simply keeps
what it last had, which is the autonomy story described on
[edge-fleet](srn://kubeedge/environment/edge-fleet).
