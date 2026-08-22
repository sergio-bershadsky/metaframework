---
name: iptables-manager
kind: component
version: 1
title: iptables manager
summary: Keeps the packet-redirection rules that send edge-node kubelet traffic into the cloud tunnel, as a DaemonSet on the cluster's non-edge nodes.
status: review
owner: sergio-bershadsky
component-type: job
lifecycle: released
criticality: 3
relations:
  uses:
    - /environment/cloud
  depends-on:
    - /product/core/component/cloudcore/component/cloudstream
tags:
  - networking
  - daemonset
---

A separate binary from the same repository, deployed as a DaemonSet with
elevated network capabilities, and the least glamorous component in the catalog:
it writes firewall rules and it does nothing else.

**Trigger.** Runs continuously and reconciles; there is no request that starts
it.

**Effect.** Ensures the rules that redirect traffic destined for an edge node's
kubelet into the cloud tunnel's stream port, so that `kubectl logs` and
`kubectl exec` reach a node the cluster cannot route to.

## Why it is a `job` and not a `service`

It has no inbound surface of any kind — nothing calls it, nothing connects to it,
and it exposes nothing. That is the definition of `job` in this framework, and
the fact that it never terminates does not change it. Reading it as a `service`
would put a node in every derived diagram with an edge pointing at it that does
not exist.

## Why it exists as a separate workload at all

The cloud runtime can write these rules itself, in-process, and the chart's own
default is to switch that off and run this DaemonSet instead. The reason is
placement: the rules have to exist on **every** non-edge node that might carry
the traffic, and the cloud runtime is one pod on one node.

That is also what makes its topology entry a small demonstration of a format
limit. A DaemonSet's real count is one per matching node — a function of the
cluster, not a range — so its entry in the cloud environment's `topology.yaml`
carries no `replicas` at all and says why, because `{ min: 1, max: 1 }` would be
false on any cluster with more than one node and there is no way to write the
true statement.

## Blast radius

`criticality: 3`. Nothing in the control plane touches it and no workload depends
on it; when it is wrong, interactive access to edge nodes stops working and
nothing else does.
