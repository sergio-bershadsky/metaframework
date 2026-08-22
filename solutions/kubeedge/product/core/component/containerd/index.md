---
name: containerd
kind: component
version: 1
title: containerd
summary: The container runtime on an edge node — reached over the container runtime interface at a local socket whose path form differs by operating system.
status: review
owner: sergio-bershadsky
component-type: external
lifecycle: released
criticality: 1
relations:
  exposes:
    - /product/core/protocol/cri
  uses:
    - /environment/edge-fleet
    - /environment/single-machine
tags:
  - runtime
  - external
---

Not ours, and named by default. The edge runtime's kubelet half reaches a
container runtime over the container runtime interface, and the endpoint it
reaches by default is containerd's.

## Why it is a component and not an actor

Same mechanical reason as everything else at a seam here:
[edged](srn://kubeedge/product/core/component/edgecore/component/edged) has to
declare `depends-on` toward it, and no forward edge in this framework accepts an
actor. It is also the right answer on the substance — this is a named system that
a specific component requires by name, which is the opposite of
[physical-device](srn://kubeedge/actor/physical-device), where the abstraction
exists so that no component ever names one.

## The endpoint, and the gap it demonstrates

Configurable, and defaulted per operating system: a Unix socket path on Linux and
a named pipe on Windows. The interface is identical; only the address form
changes.

That is worth recording on an `external` component's page because it is the
clearest possible statement of a contract gap this catalog hit three times. The
seam is gRPC. The framework's gRPC binding block can say which package and which
service, and can say whether transport security is on. It cannot say that there
is no host, that the endpoint is a filesystem path, or that the path's form
depends on the operating system. An enum of network technologies has no row for
"the process next door".

## What is deliberately not described

Its version, its configuration, its storage driver, its snapshotter. An operator
installs it before enrolling a node and the project's own documentation says how
to check it is there; none of that is this catalog's to state. The two
environment edges say which of this catalog's targets contain one, which is what
`external` environment edges are for.
