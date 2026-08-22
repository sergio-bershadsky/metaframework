---
name: policycontroller
kind: component
version: 1
title: Policy controller
summary: Resolves a service account's effective cluster permissions into one object and ships it to the node, so an edge node can authorise locally.
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
  - authorization
x-deployment-unit: cloudcore
---

The module that makes offline authorisation possible. Everything else in the edge
autonomy story is about data; this one is about *permission*, which is the part
that cannot be answered by a stale copy of a workload spec.

**Trigger.** Watches service accounts and the role bindings that grant them
anything.

**Effect.** Flattens the effective permission set of a service account into a
single resource and sends it to the nodes that need it, so a node can answer "may
this caller do this?" without asking the cluster.

## Why flattening, and what it costs

A Kubernetes authorisation decision normally requires walking roles and bindings
in the API server. An edge node cannot do that while disconnected, and shipping
the whole RBAC graph to every node would be both large and a disclosure. The
resolved-per-account object is the compromise: small, node-scoped, and stale
exactly as long as the link is down.

The cost is that "stale exactly as long as the link is down" applies to
*revocations* too. Removing a binding in the cluster does not remove the
permission at a disconnected node until the node reconnects. That is inherent to
the design rather than a defect in it, and it belongs on a component page because
nobody reading a data model would find it.

## Where it stops

It resolves permissions; it does not enforce them. Enforcement happens at the
node, in the local API surface that answers edge requests. Nothing about this
module is on the request path.
