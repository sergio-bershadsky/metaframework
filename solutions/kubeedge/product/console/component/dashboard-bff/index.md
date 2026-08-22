---
name: dashboard-bff
kind: component
version: 1
title: Dashboard backend
summary: The console's backend-for-frontend — a Go process that fronts the Kubernetes API server for the browser and adds nothing of its own except a cluster-in-a-container helper.
status: review
owner: sergio-bershadsky
component-type: gateway
lifecycle: in-development
criticality: 4
relations:
  uses:
    - /environment/single-machine
  depends-on:
    - /product/core/component/kubernetes-api-server
tags:
  - console
  - bff
x-runtime: go
---

New at `v0.2.0`, and the reason this product looks different from the way it
looked a release earlier. The console used to reach the cluster from the browser;
now a process in between does it, and the browser talks to that.

## What it fronts, which is the whole of it

One thing: the Kubernetes API server. Its request tree covers the ordinary
cluster objects a console needs — namespaces, nodes, pods, deployments,
services, config maps, secrets, service accounts and the four RBAC kinds — and
the KubeEdge custom resources beside them: device models, devices, node groups,
edge applications, routing rules and rule endpoints, plus a route for custom
resource definitions themselves
(<https://github.com/kubeedge/dashboard/tree/v0.2.0/modules/api/pkg/handler>).

That list is the type discipline satisfied and also the type's warning heeded: a
`gateway` owns no behaviour, and this one owns none. Every route is a shape
change over a call it makes on behalf of the browser. The single exception is
described below and it is not domain logic either.

## How it is reached and what it assumes

It binds plain HTTP on the loopback address, on a default port, with no transport
security on the path it actually serves; the source declares a constant for a
secure port and does not use it in the address it listens on
(<https://github.com/kubeedge/dashboard/blob/v0.2.0/modules/api/pkg/args/args.go>).
Its cluster credentials come from one of three places, chosen by flags: an
explicitly named API server endpoint, a kubeconfig file, or in-cluster discovery
when neither is given — and it will skip certificate verification on request.

None of that is a criticism of a console at `v0.x`; it is the reason this
component and its front end declare
[single-machine](srn://kubeedge/environment/single-machine) and nothing else. A
loopback-bound, optionally-unverified proxy in front of a cluster's whole API is
a developer's tool until somebody puts a real ingress in front of it, and the
repository ships nothing that does.

## The one route that is not a proxy

Beside the resource tree it serves a second handler for the project's
cluster-in-a-container tooling — the same tooling
[single-machine](srn://kubeedge/environment/single-machine) names as one of the
two things that produce that target. A console backend that can stand up a
throwaway KubeEdge cluster is an unusual capability, and it is a further reason
the environment edge above is the local one: this route has no meaning against a
cluster somebody else operates.

It is also the one place where "owns no behaviour" is arguable. The reading taken
here is that driving an external tool is still adaptation rather than domain
logic — nothing about devices, nodes or rules is decided in this process — but a
reviewer who disagreed would have a case, and recording that is better than
letting the type sit unexamined.

## Why `gateway` and not `service`

Both would validate. `service` is what it looks like from the outside: an
independently deployed process with an inbound HTTP surface. `gateway` is what it
is: a component whose entire content is fronting and adapting another component
for a particular client. The type's own definition — fronts, routes or adapts
others rather than owning behaviour — describes this exactly, and the
`depends-on` edge that the type requires is the same single edge that is the
honest description of the whole component.
