---
name: cloudstream
kind: component
version: 1
title: Cloud stream
summary: Terminates the tunnel that carries interactive kubectl traffic — logs, exec, attach, metrics — to a node the API server cannot reach.
status: review
owner: sergio-bershadsky
component-type: service
lifecycle: released
criticality: 3
relations:
  depends-on:
    - ../cloudhub
tags:
  - tunnel
  - kubectl
x-deployment-unit: cloudcore
---

Stock `kubectl logs` and `kubectl exec` work by having the API server open a
connection *to* the kubelet. At the edge that is exactly the connection that
cannot exist: the node is behind a router the cluster has no route through. This
module is the inversion — the node dials in, and the tunnel it establishes is
what the API server's request is then carried over.

## Two sockets, two audiences

It listens on a stream port for requests coming from the Kubernetes API server's
direction, and on a tunnel port for the edge side dialling in
(<https://github.com/kubeedge/api/blob/v1.23.0/apis/componentconfig/cloudcore/v1alpha1/default.go>).
A session is the join of the two, and the module's real job is holding that join
open and routing frames across it.

Its counterpart at the other end is
[edgestream](srn://kubeedge/product/core/component/edgecore/component/edgestream);
neither is useful without the other, and both are shipped disabled on the edge
side, so interactive access to an edge node is something an operator switches on
rather than something that works out of the box.

## Why the iptables workload exists because of this module

Traffic for an edge node's kubelet has to be redirected to this module's stream
port instead of going to the node directly, and that redirection is iptables
rules on the cluster's non-edge nodes. The cloud runtime can install them itself,
in-process; the chart's default is instead to run
[iptables-manager](srn://kubeedge/product/core/component/iptables-manager) as a
separate DaemonSet. That is the only reason a rule-writing workload exists in
this product at all, and it is why the two components are read together.

## `service` for the surface, not for the deployment

It has inbound sockets, which is why `service` and not `job`. It is not
independently deployed — it starts and stops with the cloud runtime — and the
general shape of that mismatch is argued on
[cloudcore](srn://kubeedge/product/core/component/cloudcore).
