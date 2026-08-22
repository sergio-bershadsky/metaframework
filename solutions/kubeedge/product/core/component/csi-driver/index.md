---
name: csi-driver
kind: component
version: 1
title: CSI driver
summary: A container storage interface driver that terminates volume calls in the cloud and forwards them to the edge node that has to mount the volume.
status: review
owner: sergio-bershadsky
component-type: service
lifecycle: released
criticality: 4
relations:
  uses:
    - /environment/cloud
  depends-on:
    - /product/core/component/cloudcore/component/cloudhub
tags:
  - storage
  - grpc
---

A separate binary from the same repository, implementing the identity and
controller halves of the container storage interface. It is the storage
counterpart of the pattern the whole system is built on: a Kubernetes-standard
interface terminated in the cloud, with the work forwarded to a node the caller
cannot reach.

## The second local-socket gRPC surface in this product

The container storage interface is a gRPC contract, and, as gRPC contracts in
this domain usually are, it is served over a **local socket** rather than a
network address — the calling side is a sidecar in the same pod.

That makes it the third seam in this catalog with the same shape as the
device-management interface and the container runtime interface: gRPC, no host,
an endpoint that is a filesystem path. Three sightings in one product is why the
survey behind this catalog treats "the transport enum is a list of networks and
local inter-process communication is not one" as a finding rather than an
inconvenience.

## What it is not

It is not a storage system, and it holds no data. It translates a volume request
into a message for the node and a node's answer back into a response, and every
actual mount happens at the edge.

## Why `criticality: 4` and why it is described thinly

It is optional, it is not installed by the cloud chart, and no other component in
this catalog depends on it. This description states what the binary is and what
interface it implements, and deliberately stops there: the survey behind this
catalog covered it at the level of "it exists, it is a separate binary, it speaks
this interface over that kind of endpoint", and writing more would be inferring a
component's behaviour from its directory names.
