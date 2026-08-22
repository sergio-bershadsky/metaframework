---
name: networking
kind: product
version: 1
title: Networking
summary: EdgeMesh — service discovery and traffic proxying between edge nodes that are not on the same network, on its own release train.
status: review
owner: sergio-bershadsky
lifecycle: active
primary-actors:
  - /actor/edge-workload
  - /actor/cluster-operator
tags:
  - mesh
  - networking
---

The data plane. Stock Kubernetes networking assumes every node can reach every
other node; at the edge that is routinely false — sites sit behind different
routers, on different carriers, often behind NAT with no inbound path at all.
EdgeMesh is the project's answer, and it is a separate product because it is a
separate repository with its own tags, its own images and its own Helm charts
(<https://github.com/kubeedge/edgemesh>).

The release-train boundary this catalog splits products on is unusually
interesting here, because the project **states** one relationship and the
repositories **show** another. The repository's own front page says EdgeMesh is
released with the main repository and that its cadence follows it. Measured on
2026-08-22: EdgeMesh's most recent tag is `v1.17.0` while the runtimes are at
`v1.23.1` — six minors apart — its most recent push is dated 2026-04-10 against
the main repository's 2026-08-18, and the surveyed release's published assets
carry the installer, the runtimes and the combined edge-site binary and no mesh
artifact at all. So the trains have separated in fact whatever the intent is, and
that separation is exactly what the product boundary is drawn on.

## What it replaces

A workload on an edge node cannot rely on the cluster's DNS, its kube-proxy rules
or its CNI, because all three assume reachability the site does not have. The
mesh agent stands in for all three at once, per node, and resolves and proxies
service traffic locally.

The transport underneath is peer-to-peer rather than cluster networking: agents
find each other, attempt a direct path where the networks allow one, punch
through where they can, and fall back to relaying through an agent that both ends
can reach. The metadata that drives it — services, endpoints, pods — is read
from the Kubernetes API server on a cloud node and from what the edge runtime
already holds locally on an edge node, so on the side where it matters service
discovery never depended on the cloud and keeps answering after the link drops.

## `lifecycle: active`, on the same evidence rule as the rest

`active` is the weakest lifecycle claim in this catalog and it is worth being
honest about the margin. The evidence for it: a tag stream reaching `v1.17.0`,
whose most recent entry and most recent push both land 134 days before this
survey rather than years before it; and an architectural change — the agent
absorbing what used to be a separate server deployable — that a coasting project
does not make.

The evidence against `maintenance` is simply that four months is a gap and not a
stop, and that the feature set is still growing at the edges (a CNI plugin
arrived and is marked beta rather than removed). If the next survey of this
solution finds the same tag, `maintenance` becomes the accurate value, and it
will be a real change rather than a re-reading — which is the point of naming the
measurement.

## What is described here and what is not

[edgemesh-agent](srn://kubeedge/product/networking/component/edgemesh-agent) is
the component the survey established, and it is the one every deployment has.
[edgemesh-gateway](srn://kubeedge/product/networking/component/edgemesh-gateway)
is described more thinly and says so on its own page: what is stated about it was
read from the repository tree, its own build and chart directories and the
project's own feature table, and the description deliberately stops there.

The repository also builds a CNI plugin at the surveyed tag — a third command, a
third build directory, and a feature the project's own table marks beta. It is
not described as a component here: the survey did not cover it, and a beta
component whose responsibilities would have to be inferred from a directory name
is the one thing a catalog must never write down.

## Where it sits relative to core

`networking` depends on `core` and is not part of it. The agent is a client of
the cloud-edge channel, not a participant in its design, and nothing in `core`
knows the mesh exists. That is reuse by reference in the ordinary sense: the
dependency is an edge on the agent's page, and no component moves.
