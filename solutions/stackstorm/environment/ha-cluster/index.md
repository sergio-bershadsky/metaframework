---
name: ha-cluster
kind: environment
version: 1
title: HA cluster
summary: The clustered target the project's Helm chart produces — replicated stateless processes, a replica-set store, a broker cluster, and a real coordination backend.
status: review
owner: sergio-bershadsky
environment-type: production
tags:
  - kubernetes
  - clustered
  - helm
---

Everything the single-host shape is not. The processes that can run active-active
do; the store is a replica set; the broker is a cluster; the coordination backend
is deployed and actually configured, so the concurrency limits an operator sets
are cluster-wide claims rather than per-process ones. The edge is a Kubernetes
Ingress rather than a reverse proxy this solution deploys.

The target is defined by
[stackstorm-k8s](srn://stackstorm/product/platform/component/stackstorm-k8s), and
that is the unusual thing about this entity: the deployment is not an
organisation's arrangement that somebody wrote down, it is an artifact the
project publishes. Every placement claim in the sibling `topology.yaml` is
therefore a **default in a chart**, not a measurement of anyone's cluster, and
those defaults were read from the chart's published values on 2026-08-22.

## The same `environment-type` as a target it shares nothing with

[single-box](srn://stackstorm/environment/single-box) carries
`environment-type: production` and so does this. On the ladder the enum encodes
— data reality and blast radius — that is right twice: both hold real data and
serve real users.

Every fact a component would actually design against differs:

- **Instance count.** There, one of everything. Here, several of most things,
  competing for messages on shared durable queues.
- **Coordination.** There, an unset URL and a no-op driver whose locks always
  succeed and enforce nothing. Here, a deployed backend and locks that mean what
  they say. A concurrency policy is a *guarantee* on one target and a *hint* on
  the other, and no field distinguishes them.
- **Failure domains.** There, none. Here, a replica set and a broker cluster,
  with the failure modes that come with them.
- **The edge.** There, a reverse proxy this catalog describes as a component.
  Here, an ingress resource matched to a controller the cluster already runs and
  that this catalog does not describe.

That is the finding this pair of entities exists to demonstrate: the enum is a
ladder of data reality, the thing that constrains a component is topology, and
the two are orthogonal. The specification already argues that `edge` is a shape
rather than a rung and must be visible before anything opens `topology.yaml`.
Single-host versus clustered is a second shape, it changes a component's
correctness rather than its convenience, and there is nowhere to put it.

## The constraint that the chart honours and the catalog cannot state

The chart pins
[st2timersengine](srn://stackstorm/product/platform/component/st2timersengine)
to a single replica, and the project states plainly that the process cannot run
active-active. The sibling `topology.yaml` records the pin — which is a
*placement claim about this deployment*, reviewable, and drift-warnable.

What it cannot record is that the number is a **correctness constraint** rather
than a sizing decision. Raising it here would not degrade throughput; it would
fire every timer twice. A reader of that entry sees the same shape of statement
as every other replica range on the page.

## Why there is no `config.yaml`

The same reason as on the single-host target, plus one specific to this shape.
The platform's configuration is an INI file with sections and lowercase keys,
which the environment kind's key grammar cannot express; the chart's own
configuration surface is a values document with nested maps, which the same
grammar cannot express either. Both would have to be renamed into a shape the
software does not read.

## Guarantees, stated at their real strength

- **No availability objective exists.** Replication is a capability the chart
  offers, not a promise anybody makes. This catalog states none.
- **The three infrastructure systems are clustered here and are still
  `external`.** The chart deploys them; the project does not write them.
- **Secrets exist and are not declared.** A datastore encryption key, an SSH
  key, and the store and broker credentials are all real, and all of them live
  in the chart's own secret machinery — which this catalog can name and cannot
  model, for the reason above.

## Placement

The sibling `topology.yaml` carries the chart's defaults. Membership is derived
from each component's `uses` edges and appears nowhere in that file.
