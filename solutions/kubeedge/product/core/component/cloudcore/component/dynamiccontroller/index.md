---
name: dynamiccontroller
kind: component
version: 1
title: Dynamic controller
summary: Fronts the Kubernetes API for edge clients — serves the list-watch traffic an edge node's local API surface needs, over the cloud-edge channel.
status: review
owner: sergio-bershadsky
component-type: gateway
lifecycle: released
criticality: 2
relations:
  depends-on:
    - /product/core/component/kubernetes-api-server
    - ../cloudhub
tags:
  - list-watch
  - api
x-deployment-unit: cloudcore
---

What it fronts is named in its `depends-on`: the Kubernetes API server. That is
the whole of it — an edge client wants to list or watch a resource, cannot reach
the API server, and this module performs the request on its behalf and streams
the result back down the channel.

## Why it is a gateway and not a controller

The name in the source is misleading for this catalog's vocabulary. Every other
module ending in "controller" here watches a resource and acts; this one holds no
desired state, reconciles nothing, and decides nothing. It receives a request,
translates it into a request against the API server, and returns the answer. That
is `gateway`'s definition — fronts, routes or adapts others rather than owning
behaviour — and typing it `job` alongside the real controllers would put a
request-path component in the same bucket as five reconcilers.

## What depends on it, and what happens when it is off

It is shipped disabled. Nothing in the default cloud runtime needs it, because
the ordinary workload path is push-based: the controllers send a node what it
should run and the node never asks.

It becomes necessary the moment an edge node runs a **local Kubernetes API
surface** for workloads to read — which is the mechanism the whole autonomy story
rests on. That surface answers from a node-local store while offline, and refills
that store through this module while online. So the switch is really "may edge
workloads use the Kubernetes API at all", and it is off by default because the
cost is real: every edge client's watch becomes a watch this module holds against
the cluster.

## Authorisation

When the cloud runtime's authorisation feature is on, requests arriving here are
performed against the API server as the requesting edge client rather than as the
cloud runtime's own identity. That impersonation is the reason
[cloudcore-service-account](srn://kubeedge/actor/cloudcore-service-account) is
worth its own entity: it is the privilege that makes this module safe, and the
one that would be worth stealing.
