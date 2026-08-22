---
name: edgestream
kind: component
version: 1
title: Edge stream
summary: Dials the cloud tunnel that carries interactive kubectl traffic into a node the cluster has no route to.
status: review
owner: sergio-bershadsky
component-type: gateway
lifecycle: released
criticality: 3
relations:
  depends-on:
    - /product/core/component/cloudcore/component/cloudstream
    - ../edged
tags:
  - tunnel
  - kubectl
x-deployment-unit: edgecore
---

What it fronts is named in its `depends-on`: the node's own kubelet surface, made
reachable to a cluster that cannot route to it. It establishes the tunnel — the
node dials, as everything at the edge must — and frames arriving over it are
served locally.

## Why the inversion is necessary and not clever

`kubectl logs` and `kubectl exec` are implemented in stock Kubernetes as the API
server connecting to the kubelet. There is no version of that which works when
the kubelet is behind a router at a factory. Rather than invent a new mechanism,
the project keeps the semantics and reverses the connection: the node opens a
tunnel to
[cloudstream](srn://kubeedge/product/core/component/cloudcore/component/cloudstream),
the cluster's traffic is redirected into that module, and the two ends are joined
into a session.

The redirection at the cluster end is iptables rules, which is the entire reason
[iptables-manager](srn://kubeedge/product/core/component/iptables-manager) exists
as a separate workload.

## Off by default, at both ends

Shipped disabled here. An operator switching it on is deciding that interactive
access to edge nodes is worth a permanent outbound connection per node and a set
of rules on every cluster node — which is a real decision, and one this catalog
should not present as a default.

## Blast radius

`criticality: 3`. No workload depends on it, no control-plane path uses it, and a
node without it runs exactly as well; what is lost is the operator's ability to
look inside a running container from their desk.
