---
name: kubernetes-api-server
kind: component
version: 1
title: Kubernetes API server
summary: The cluster's own API server — the source of truth this whole solution extends, described locally because edges cannot point at anything outside the solution.
status: review
owner: sergio-bershadsky
component-type: external
lifecycle: released
criticality: 1
relations:
  uses:
    - /environment/cloud
    - /environment/single-machine
tags:
  - kubernetes
  - external
---

Not ours, and described here anyway. The solution boundary forbids referencing
anything outside it, and the relation edges accept components and never actors,
so the moment a component needs to say `depends-on` toward the cluster's API
server, that API server has to be an `external` component inside this catalog.

This is the third catalog in this repository to reach that conclusion by the same
mechanical route, which makes it a property of the framework's edge table rather
than a judgement call.

## The boundary at this seam

What crosses it: watches and writes against Kubernetes resources, from the cloud
runtime's controller modules, from the admission webhook, from the node-group
controller, and from the console's backend. All of it is ordinary Kubernetes API
traffic — no KubeEdge-specific contract exists at this seam, which is the point:
the project extends Kubernetes rather than replacing it, and an operator's
`kubectl` reaches the same server the controllers do.

What does not cross it: anything from an edge node. An edge node never talks to
this component, ever, in any deployment. Requests that would have gone here are
served either from the node's own store or, when the optional path is enabled,
forwarded by
[dynamiccontroller](srn://kubeedge/product/core/component/cloudcore/component/dynamiccontroller).
That single asymmetry is most of the architecture.

## What is deliberately not described

Its version, its topology, its availability, its storage. The main repository
vendors a Kubernetes release and its end-to-end suite runs against a range of
minor versions, so the compatibility surface is real — but which server an
operator points the chart at is theirs, and this catalog would be inventing a
claim by naming one. `lifecycle: released` here describes the relationship, not a
release of somebody else's software.

## Type discipline

`external` components contain no child components, declare no delivery
obligation, and are never flagged for missing tests or coverage. The two
environment edges above are the exception the type explicitly allows: they say
which of this catalog's targets contain one, which is a genuinely useful fact and
not a claim about the vendor.
