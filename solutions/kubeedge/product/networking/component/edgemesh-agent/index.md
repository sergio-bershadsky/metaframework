---
name: edgemesh-agent
kind: component
version: 1
title: EdgeMesh agent
summary: One process per node standing in for cluster DNS, kube-proxy and the CNI at once, with a peer-to-peer tunnel that reaches sites the cluster network cannot.
status: review
owner: sergio-bershadsky
component-type: service
lifecycle: released
criticality: 2
relations:
  uses:
    - /environment/cloud
    - /environment/edge-fleet
  depends-on:
    - /product/core/component/edgecore
    - /product/core/component/kubernetes-api-server
tags:
  - mesh
  - libp2p
  - dns
x-runtime: go
---

The only thing this product deploys, and there is exactly one of it per node. A
workload on an edge site resolves a service name, gets an address, and connects;
the agent is what makes all three steps work when the two ends of that connection
are behind different routers on different carriers with no route between them.

## What it replaces, and why replacement rather than extension

Stock Kubernetes service networking rests on three assumptions the edge breaks:
that a cluster DNS service is reachable, that kube-proxy's rules point at
addresses the node can route to, and that the CNI has given every pod an address
in one flat network. At a site behind NAT, none of the three holds.

The agent's own components, as the project names them, are a proxier that puts
the kernel's rules in place and intercepts the traffic, a node-local DNS
resolver, a load balancer, a controller that fetches the cluster metadata, and a
tunnel (<https://github.com/kubeedge/edgemesh/blob/v1.17.0/README.md>). That is
one process holding the responsibilities of three cluster services, which is why
this is a replacement rather than a plugin: none of the three has a seam the
agent could hook into on a node that cannot reach the cluster.

## The tunnel, and the deployable that stopped existing

Cross-network reachability is peer-to-peer rather than cluster networking. The
tunnel is built on libp2p and uses three mechanisms in order of preference:
direct connection inside a LAN with mDNS discovery, hole punching between LANs,
and relaying through an agent both ends can reach when punching fails.

The relay is the interesting part historically. It used to be a separate
deployable — an EdgeMesh server — and from v1.12.0 its capability moved into
every agent's tunnel module, so any agent configured with relay capability
becomes one. The project states the merge itself in its architecture notes. That
is a component that ceased to exist upstream, and this catalog never described
it: there is no entity for it and no `supersedes` edge, because nothing in this
repository ever pointed at one and inventing a predecessor in order to deprecate
it would be describing a swap that this catalog did not make.

## Where the metadata comes from, and why that matters

The controller reads services, endpoints and pods either from the Kubernetes API
server or from KubeEdge, and on an edge node it is the second: metadata arrives
over the cloud-edge tunnel that
[edgecore](srn://kubeedge/product/core/component/edgecore) already maintains,
rather than over a second connection to the cloud API server. Both `depends-on`
edges above are therefore real and they are not alternatives — a cloud-side agent
reads the API server directly, an edge-side agent reads what the edge runtime has
locally.

The consequence is the one that matters for this catalog's `edge` argument:
service discovery keeps answering on a node that has lost the cloud, because the
answer was never coming from the cloud in the first place.

## How it is placed, and the two things the manifest gives away

A DaemonSet, on the host network, in a privileged container, with **no node
affinity** — so it lands on cloud nodes as well as edge nodes, which is correct
and is why it is declared in both environments above: cloud-to-edge traffic needs
an agent at each end.

Two details in the shipped manifest are worth naming because a reader would
otherwise have to guess at them
(<https://github.com/kubeedge/edgemesh/blob/v1.17.0/build/agent/resources/05-daemonset.yaml>):

- Its two environment variables — the node's own name and its namespace — come
  from the Kubernetes downward API rather than from anything an operator sets.
  That is the case [edge-fleet](srn://kubeedge/environment/edge-fleet)'s
  `config.yaml` records as unexpressible: a config entry means "this target
  provides this key, and here is where the value comes from", and there is no
  way to mark a key as filled in by the platform's own introspection.
- The tunnel's pre-shared key ships as a literal in a ConfigMap, with a comment
  in the file telling the operator not to use that value. Shipping a working
  default and a warning next to it is a real posture and not an oversight, but it
  means a deployment that skips the step has a mesh whose membership secret is
  published in a public repository.

## Type, and the one thing it is not

`service`: an independently deployed process with an inbound surface — several,
in fact, since it terminates DNS, intercepted proxy traffic and tunnel
connections. It is not a `gateway` even though it fronts other workloads'
traffic, because a gateway is defined as fronting things this catalog also
describes, and what this agent fronts is other people's pods.

It exposes no protocol entity here. Its surfaces are ordinary DNS and TCP/UDP
proxying for workloads whose contracts are not ours, and its peer-to-peer tunnel
carries whatever those workloads sent — none of which is a conversation this
catalog has participants for. The absence is deliberate and it is the honest
reading of a data-plane component.
