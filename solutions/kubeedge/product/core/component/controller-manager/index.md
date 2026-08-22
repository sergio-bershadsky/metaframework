---
name: controller-manager
kind: component
version: 1
title: Controller manager
summary: An optional cluster workload owning the two resources that describe fleets rather than nodes — node groups, and applications spread across them.
status: review
owner: sergio-bershadsky
component-type: service
lifecycle: released
criticality: 3
relations:
  uses:
    - /environment/cloud
  depends-on:
    - /product/core/component/kubernetes-api-server
    - /product/core/component/api
tags:
  - controller
  - fleet
---

A separate binary and a separate Deployment from the cloud runtime, shipped
**disabled** in the chart's values, and the only component in this product that
thinks in terms of *groups* of nodes rather than one node at a time.

## The two resources it owns

A **node group** names a set of edge nodes as one addressable unit — a region, a
site, a class of hardware. An **edge application** describes one workload
deployed across such a group with per-group differences, so that the same
application can run at fifty sites with fifty different config maps without fifty
manifests.

Both are custom resources, both are installed by the cloud chart's definitions
regardless of whether this controller is running, and neither does anything
without it.

## Why it is separate from the cloud runtime at all

This is the question a reader will actually have, because everything else that
watches resources and acts on them lives inside one process. The split is a
delivery decision rather than an architectural one: these two resources are a
newer, opt-in layer, they are the only part of the product whose subject is a
fleet, and separating them means a cluster that does not want them runs nothing
extra.

The consequence for this catalog is that `service` fits here without the strain
it carries inside the runtimes — this genuinely is an independently deployed
process — while the modules doing structurally similar work inside the cloud
runtime cannot claim the same type honestly. Two components doing the same kind
of work, one of which the ontology describes cleanly and one of which it does
not, purely because of how they were packaged.

## Blast radius

`criticality: 3`. Off by default, nothing depends on it, and its absence means
the two resources it owns sit inert.
