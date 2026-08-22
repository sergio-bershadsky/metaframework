---
name: edge-workload
kind: actor
version: 2
title: Edge workload
summary: A pod scheduled onto an edge node — reads the node-local API surface, consumes device data, and must survive the link dropping.
status: review
owner: sergio-bershadsky
actor-type: system
goals:
  - Keep serving while the link to the cloud is down.
  - Read Kubernetes objects from the node it runs on rather than from the cloud API server.
  - Receive readings from devices attached to the same node without a round trip to the cloud.
relations:
  uses:
    - /product/core/component/edgecore/component/metamanager/component/metaserver
tags:
  - workload
  - autonomy
---

The tenant, not the platform. An edge workload is somebody else's container,
scheduled by the cloud control plane onto a node this solution manages, and this
catalog deliberately describes nothing of its insides — which is exactly the
actor test: it originates requests and receives outcomes, and we do not own its
description.

## Why it is an actor and not a component

It would be tempting to model "the workloads" as a component of the edge runtime,
because the runtime starts them, stops them, and gives them an API to read. But
the thing that makes an edge workload interesting to this description is a
property of *its* design, not of ours: whether it was written to tolerate a stale
read. The runtime offers node-local reads; whether a workload uses them, and what
it does when the answer is older than it would like, is the workload author's
decision. Describing that as a component would claim ownership of behaviour that
lives outside the project entirely.

## The autonomy contract, stated from this side

Three facts about the surrounding system are what this actor's goals rest on, and
each is a property of the edge runtime rather than a promise made to the
workload:

- The node-local store keeps the objects the node has already seen, so reads
  continue answering after the link drops.
- A workload the operator has labelled for offline autonomy is not evicted while
  the node is unreachable from the cloud; the label is applied by the operator,
  not by the workload.
- Reconciliation happens on reconnect, on the runtime's own schedule, and the
  workload sees the result as an ordinary watch event.

None of the three is an SLO and none is quantified here. The mechanisms that
implement them are described on
[metamanager](srn://kubeedge/product/core/component/edgecore/component/metamanager)
and on [edge-fleet](srn://kubeedge/environment/edge-fleet).

## What it does not have

No credential inventory of its own: a workload's identity is the Kubernetes
service account its pod spec names, issued by the cloud API server, and that is
outside this solution's ownership. The single `uses` edge above names the only
surface this catalog builds specifically for it.

No protocol either, which is why `W_ACTOR_ORPHAN` is raised against this page and
stays. The single `uses` edge states reach, not participation. What a workload
and
[metaserver](srn://kubeedge/product/core/component/edgecore/component/metamanager/component/metaserver)
exchange is the Kubernetes API, whose contract belongs to Kubernetes and not to
this project; writing it up as a kubeedge protocol would claim ownership of a
surface this solution only re-serves locally, on the same page that says this
catalog describes nothing of the tenant's insides.
