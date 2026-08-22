---
name: metaserver
kind: component
version: 1
title: Meta server
summary: A Kubernetes-shaped HTTP API on the node itself, answered from the local store — what an offline workload and the installer's inspection commands actually call.
status: review
owner: sergio-bershadsky
component-type: gateway
lifecycle: released
criticality: 2
relations:
  depends-on:
    - /product/core/component/edgecore/component/metamanager
tags:
  - api
  - autonomy
x-deployment-unit: edgecore
---

What it fronts is named in its `depends-on`: the node-local store. It puts a
Kubernetes-API-shaped surface on top of that store, bound to a loopback address
on the node, so that anything which knows how to talk to a Kubernetes API server
can talk to *this node* without the cloud being involved.

## Why that is more than a convenience

It is the difference between "the node keeps running" and "the node can be
worked with". A workload that wants to read a config map, a controller-shaped
program that wants to watch something, an operator running the installer's
inspection subcommands against a disconnected node — all of them speak the
Kubernetes API, and none of them can reach one. This surface is the answer, and
it is why the installer grew a subcommand group for getting, describing,
inspecting and restarting things on the node.

## Standard and extended handlers

The handler set has two halves and the split is informative. One half is the
ordinary Kubernetes verbs — read, write, and a pass-through for the requests it
does not answer itself. The other half is **extensions**: node-local operations
that no Kubernetes API server has, such as executing in a container, fetching
logs, restarting a pod, or confirming an upgrade the operator started.

That second half is the point at which the surface stops being a Kubernetes API
and becomes this project's own. It is also the reason typing this component is
awkward: `gateway` says it fronts something and owns no behaviour, which is right
for the first half and slightly generous about the second.

## Off by default, and what turns it on

Shipped disabled. Switching it on is a decision with a cost at the other end of
the system: reads that miss the local store become requests carried to the cloud
and served by
[dynamiccontroller](srn://kubeedge/product/core/component/cloudcore/component/dynamiccontroller),
so enabling a node-local API also enables a cloud-side watch on the fleet's
behalf.

One side effect is worth knowing because it looks like a bug: enabling this
surface also suppresses the edge runtime's refusal to start alongside a kubelet.

## Authentication

It has its own, separate from the node's cloud credential — a client and a
certificate request path of its own. A local API that answered everything on
loopback without asking who was calling would be a privilege escalation for every
workload on the node, so the surface authenticates even though it never leaves
the machine.
