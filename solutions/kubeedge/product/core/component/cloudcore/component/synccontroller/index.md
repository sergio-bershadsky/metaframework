---
name: synccontroller
kind: component
version: 1
title: Sync controller
summary: Compares what the cloud believes a node has against what it recorded sending, and re-sends the difference after an outage.
status: review
owner: sergio-bershadsky
component-type: job
lifecycle: released
criticality: 2
relations:
  depends-on:
    - /product/core/component/kubernetes-api-server
    - ../cloudhub
tags:
  - controller
  - reliability
x-deployment-unit: cloudcore
---

The module that exists because the link is unreliable. Every other controller
sends and moves on; this one is the reason a node that was unreachable for an
hour converges rather than staying an hour behind.

**Trigger.** Periodic reconciliation, plus the bookkeeping resources the cloud
runtime keeps for reliable delivery — one per object sent to a node, recording
which revision that node was last known to have.

**Effect.** Where the recorded revision and the cluster's current revision
disagree, it re-sends. Where an object no longer exists, it sends the deletion.

## Why this is a component and not an implementation detail

Because it is the difference between "the cloud pushes changes" and "the cloud
guarantees convergence", and those are different systems. A reader who does not
know this module exists will assume the first, and will be surprised by both the
bookkeeping resources in the cluster and the traffic that appears when a fleet
reconnects.

It is also the clearest single piece of evidence for why the whole architecture
puts a stateful multiplexer between the cluster and the nodes instead of pointing
nodes at the API server: a direct watch has no notion of a peer that was away,
and every mechanism for one would have to be built at each node.

## The nearest-fit type, again

`job` for the same reason as the other controllers — a periodically triggered
worker with no inbound surface — and the general argument for why none of these
modules fits any value cleanly is on
[cloudcore](srn://kubeedge/product/core/component/cloudcore).
