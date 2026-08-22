---
name: edgemesh-gateway
kind: component
version: 1
title: EdgeMesh gateway
summary: The optional way into a site's mesh from outside it — a second binary, a second chart, and a Deployment whose manifest asks the operator to name the node by hand.
status: review
owner: sergio-bershadsky
component-type: gateway
lifecycle: released
criticality: 3
relations:
  uses:
    - /environment/edge-fleet
  depends-on:
    - ../edgemesh-agent
tags:
  - mesh
  - ingress
x-runtime: go
---

Traffic that starts outside the mesh and needs to reach a service inside it. The
[agent](srn://kubeedge/product/networking/component/edgemesh-agent) connects
nodes to each other; this connects the outside world to that set of nodes, at one
chosen node, for the deployments that want such a door.

## How thin this description is, and why it is here anyway

Every other component in this catalog was surveyed before it was written. This
one was not: the survey that produced this solution established the agent as the
product's component and named the gateway only as something the repository also
builds. What follows is therefore read directly from the repository at the
surveyed tag and from the project's own feature table, and it deliberately stops
where that reading stops.

What is measured: it is a separate command in the repository's `cmd/` tree with
its own package under `pkg/`, its own image, its own Helm chart alongside the
agent's, and its own manifest set with a separate service account and
configuration
(<https://github.com/kubeedge/edgemesh/tree/v1.17.0/build/gateway>). The project
lists an edge gateway feature with external access and multi-network-interface
monitoring
(<https://github.com/kubeedge/edgemesh/blob/v1.17.0/README.md>). What is **not**
described here: its routing model, how a service is exposed through it, or what
its configuration accepts. None of that was read, so none of it is stated.

## What it fronts

The `gateway` type requires naming what is fronted, and here that is answerable
in one edge: the mesh itself, reached through the agent on the node it runs on.
Traffic entering through this component leaves it through the same tunnel and
proxy machinery every agent has, so it fronts a network rather than a service —
and the workloads eventually reached are other people's, exactly as on the
agent's page.

That is a thinner reading of "fronts" than the type's examples assume, and it is
the same shape of stretch that
[mapper](srn://kubeedge/product/device-integration/component/mapper) records more
sharply.

## Placement, and the placeholder in the shipped manifest

A Deployment rather than a DaemonSet — one instance, not one per node — on the
host network, in a privileged container, with the same pre-shared-key ConfigMap
arrangement the agent has.

The detail worth recording is that the shipped manifest carries a literal
placeholder where the node name goes
(<https://github.com/kubeedge/edgemesh/blob/v1.17.0/build/gateway/resources/05-deployment.yaml>).
It is not scheduled; it is pinned, by hand, to a node the operator picks — the
one with a route from wherever the outside traffic comes from. That is a real
deployment fact and it is exactly what
[edge-fleet](srn://kubeedge/environment/edge-fleet)'s `topology.yaml` cannot say:
the format has regions, replica ranges and a sentence about scaling, and no way
to express "one instance, on a node the operator names at install time, at each
site that wants one".

Its replica range in that file is `{min: 0, max: 1}`, and the floor is the honest
one: the default is not to install it.

## Why it is a separate component and not a mode of the agent

Because the project ships it as a separate binary, image, chart and manifest set,
and because it is optional in a way the agent is not. The opposite move happened
once already in this product — the relay server folded into the agent at v1.12.0
— and this one did not fold. Modelling it as a flag on the agent would hide a
deployable that an operator installs, upgrades and can forget to secure
separately.
