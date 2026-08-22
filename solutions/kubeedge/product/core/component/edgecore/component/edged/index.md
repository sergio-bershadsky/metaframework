---
name: edged
kind: component
version: 1
title: Edged
summary: The kubelet half — keeps the declared pods running on this host through the container runtime interface, and reports what it sees.
status: review
owner: sergio-bershadsky
component-type: service
lifecycle: released
criticality: 1
relations:
  uses:
    - /product/core/protocol/cri
  depends-on:
    - /product/core/component/containerd
    - ../metamanager
tags:
  - kubelet
  - workloads
x-deployment-unit: edgecore
---

The module that actually runs somebody's container. It is a kubelet, embedded in
the edge runtime and reading its instructions from the in-process bus rather than
from an API server.

## The one seam that is a real network protocol

It speaks the **container runtime interface** to a container runtime, which is
one of the few conversations in this catalog that is neither invented by this
project nor internal to it: the interface is a Kubernetes standard, the runtime
implementing it is
[containerd](srn://kubeedge/product/core/component/containerd) by default, and
the endpoint is a local socket rather than a network address.

That endpoint is where a contract gap shows up. The default is a Unix socket path
on Linux and a named pipe on Windows — the same interface, two path forms,
neither of them a host and port. It is worth noting on this page because the
device-management interface has exactly the same shape at the other end of the
node, and two independent sightings of the same gap in one component tree is
evidence rather than an anecdote.

## Where its instructions come from

Not from a watch. The cloud pushes the pods this node should run, they land in
the node-local store owned by
[metamanager](srn://kubeedge/product/core/component/edgecore/component/metamanager),
and this module works from that. The `depends-on` edge above is therefore not a
convenience: without the store this module has no desired state at all, and with
it, a node that has been offline for a week still knows exactly what it is
supposed to be running.

## What it does not do

It does not schedule. Scheduling is the cluster's, and an edge node is an
ordinary node in the cluster's eyes for that purpose. It also does not evict on
its own initiative when the cloud is unreachable — the decision to keep a
workload alive through an outage is expressed as a label the operator puts on the
workload, not as a policy this module holds.
