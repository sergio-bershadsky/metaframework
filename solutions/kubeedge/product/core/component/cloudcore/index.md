---
name: cloudcore
kind: component
version: 1
title: CloudCore
summary: The cluster-side process — one binary hosting the modules that watch Kubernetes, hold the edge-facing endpoints, and push work to nodes.
status: review
owner: sergio-bershadsky
component-type: service
lifecycle: released
criticality: 1
relations:
  uses:
    - /environment/cloud
    - /environment/single-machine
  depends-on:
    - /product/core/component/beehive
    - /product/core/component/api
    - /product/core/component/viaduct
    - /product/core/component/kubernetes-api-server
tags:
  - runtime
  - cloud
x-runtime: go
---

One process, one Deployment, one place every edge node connects to. It is the
only component in the catalog that both watches the Kubernetes API and terminates
connections from outside the cluster, and it is `criticality: 1` for the obvious
reason: while it is down, no node receives an update and no node's status is
recorded.

## What is inside it, and why that is modelled as sub-components

The binary starts a fixed set of **modules**, registered by name at start-up and
communicating through an in-process message bus rather than by calling each other
(<https://github.com/kubeedge/kubeedge/blob/v1.23.1/cloud/cmd/cloudcore/app/server.go>).
Each has a name, an enable flag, its own configuration block, and a
well-defined responsibility; several can be switched off without affecting the
rest.

They are modelled here as sub-components because they are the architecture — a
description of this process that did not name them would be a description of a
box. But the modelling is a nearest fit, and the mismatch is the same one three
catalogs in this repository have now hit from three different directions:

> A module here has a runtime, does not deploy independently, and mostly exposes
> nothing. `service` means an independently deployed process with an inbound
> surface. `library` means a build-time artifact with no runtime of its own, and
> is forbidden from declaring an environment because it has nowhere to run. The
> module is neither, and there is no third value.

The upstream project reaches for the missing word too: the library that carries
the bus describes itself as a framework for in-process microservices. Every
module below therefore carries `x-deployment-unit: cloudcore`, which names the
fact the kind cannot — *which unit of deployment this component is inside* — and
is this catalog's escape hatch for a hole two other catalogs already patched with
their own.

The consequence is deliberate and visible: none of the modules declares an
environment, so each raises `W_COMP_NO_ENVIRONMENT`. The alternative is to repeat
this component's own two environment edges on every module, which is bookkeeping
that will drift the first time a placement changes and would state something
false anyway — a module is not deployed anywhere, its process is. The warnings
are the honest reading, and the cheap additive fix would be to exempt a component
whose ancestor declares an environment.

## The modules

Grouped by what they actually do, which the registration order does not show:

- **The edge-facing endpoint.**
  [cloudhub](srn://kubeedge/product/core/component/cloudcore/component/cloudhub)
  is the only module with an inbound surface, and everything else reaches an edge
  node through it.
- **The controllers.**
  [edgecontroller](srn://kubeedge/product/core/component/cloudcore/component/edgecontroller),
  [devicecontroller](srn://kubeedge/product/core/component/cloudcore/component/devicecontroller),
  [synccontroller](srn://kubeedge/product/core/component/cloudcore/component/synccontroller),
  [taskmanager](srn://kubeedge/product/core/component/cloudcore/component/taskmanager)
  and
  [policycontroller](srn://kubeedge/product/core/component/cloudcore/component/policycontroller)
  each watch a slice of the cluster and translate it into messages for nodes.
- **The pass-throughs.**
  [dynamiccontroller](srn://kubeedge/product/core/component/cloudcore/component/dynamiccontroller)
  serves edge list-watch traffic against the Kubernetes API;
  [router](srn://kubeedge/product/core/component/cloudcore/component/router)
  moves messages between declared endpoints; and
  [cloudstream](srn://kubeedge/product/core/component/cloudcore/component/cloudstream)
  terminates the tunnel that carries interactive kubectl traffic.

One further piece of behaviour is not a module at all and so has no entity here: a
certificate-approval controller that runs as a goroutine when the authorisation
feature gate is on. It is named in this paragraph rather than modelled, because
giving it a component page would imply a switchable unit that the process does
not have.

## How it is placed

A Deployment with the chart's replica count fixed at one, on the host network,
with node affinity that keeps it away from any node labelled as an edge node, and
CPU and memory limits set in the chart's values. Its edge-facing ports are
published through a NodePort service. Details are in
[cloud](srn://kubeedge/environment/cloud)'s `topology.yaml`; what matters here is
that nothing scales it and nothing shards it, so a fleet's whole upstream is one
process unless an operator deliberately runs more.

## Identity and dependencies

Its cluster identity is
[cloudcore-service-account](srn://kubeedge/actor/cloudcore-service-account),
which is a separate entity because a credential is audited separately from the
runtime that holds it. Its `depends-on` set is the honest one: the in-process bus
and the transport library it is built from, the shared API types it compiles, and
the Kubernetes API server it cannot function without.
