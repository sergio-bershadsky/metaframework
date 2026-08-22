---
name: console
kind: product
version: 1
title: Console
summary: The Dashboard — a web console for the cluster's KubeEdge resources, still pre-1.0 and the only product here whose lifecycle is not active.
status: review
owner: sergio-bershadsky
lifecycle: incubating
primary-actors:
  - /actor/cluster-operator
tags:
  - ui
  - console
---

A browser front end for the parts of a cluster that belong to KubeEdge: nodes,
device models, devices, rules, and the node groups and edge applications the
optional controller owns. It is the only surface in this catalog a person points
at rather than types into.

## Why `incubating` and not `active`

This is the product where the evidence rule this catalog uses for open-source
lifecycles gives a different answer from the others, and it gives it clearly.

The Dashboard's own version number is below 1.0
(<https://github.com/kubeedge/dashboard>), which is a statement the project makes
about itself: contracts are still moving. The release that introduced the layout
described here also introduced a backend tier and a first internationalisation
pass — both structural additions rather than features, which is what a product
still finding its shape does. And its release train is unrelated to the runtimes'
and much shorter.

`incubating` means being built, contracts still moving. That is the accurate
reading, and it is a different claim from `status: review` on this document,
which is about whether anybody has reviewed the description.

## The split inside

Two deployables, and the split is younger than the product:

- [dashboard-ui](srn://kubeedge/product/console/component/dashboard-ui) — the
  browser application.
- [dashboard-bff](srn://kubeedge/product/console/component/dashboard-bff) — a
  backend written in a different language, sitting between the browser and the
  cluster.

The interesting part is that the second one is new. An earlier Dashboard was the
front end alone, talking to the cluster directly from the browser; the backend
tier was introduced to move data processing off the client. That is a
recognisable moment in a console's life and it is why this product is the one
carrying a `gateway` component.

## Its relationship to everything else

The console reads and writes the same custom resources the
[cluster-operator](srn://kubeedge/actor/cluster-operator) would reach with
`kubectl`, through the same Kubernetes API server. It has no privileged path into
either runtime and no component in `core` knows it exists, which is why the
dependency runs only one way and why the console can be at a completely different
version from the cluster it is pointed at.
