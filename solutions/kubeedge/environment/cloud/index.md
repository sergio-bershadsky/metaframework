---
name: cloud
kind: environment
version: 1
title: Cloud
summary: The Kubernetes cluster the project's own Helm chart installs into — the control-plane half, holding the API of record for every edge node.
status: review
owner: sergio-bershadsky
environment-type: production
tags:
  - kubernetes
  - control-plane
---

The cluster side. Every object an edge node ever sees originates here, and every
object an edge node reports converges here, so this is the only target in the
catalog that holds data of record. It is typed `production` for that reason and
not because anybody promised anything about it.

## What kind of thing this entity is

This is a **deployment shape the project ships**, not an instance anybody in this
catalog operates. KubeEdge publishes a Helm chart and an installer; what those
produce is a cluster with a known set of workloads in it, and that is what is
described here. Nobody named in this catalog runs one.

That distinction matters more than it first looks, because it decides what the
environment may claim. It may claim what the chart places, what the chart's
defaults are, and what a component may assume about the target's connectivity and
data reality. It may not claim availability, latency, retention, change windows
or residency, because those are decisions of whoever installs the chart, and this
description would be inventing them. All three environments in this catalog are
read that way.

## Guarantees, at their real strength

- **Real data.** The custom resources describing every node, device and rule live
  here, in the cluster's etcd, and nothing else in the system holds the
  authoritative copy.
- **Synchronous reach is assumed.** Everything hosted here can call the
  Kubernetes API server whenever it wants. That assumption is precisely what
  [edge-fleet](srn://kubeedge/environment/edge-fleet) breaks, and it is why the
  two are separate entities rather than two regions of one.
- **No availability objective exists.** The project publishes none, this
  description does not invent one, and none of the hosted components declares a
  metric against one.
- **Two of the hosted workloads are off by default.** The admission webhook and
  the node-group controller are shipped disabled in the chart's values, so a
  default install of the cloud half runs neither. They are hosted here in the
  sense that this is where they go when they are switched on, which is the honest
  reading of a chart-installed optional workload.

## Which components run here

Derived from the components' own `uses` edges, not listed here. The sibling
`topology.yaml` annotates the ones the chart actually places with replica counts
and scaling notes; anything with no entry there has its placement recorded as
unknown rather than as "everywhere".

Two entries are worth reading for what they say about the format. The
iptables-rule daemon and the mesh agent are both DaemonSets, so their real count
is "one per node" — a function of the cluster, not a range this file can state.
Their entries carry no `replicas` and say so in their notes, because a fixed
`{min: 1, max: 1}` would be a false claim on a cluster with more than one node
and there is no way to write the true one.

## There is no `config.yaml` here, and that is the finding

An environment declares which configuration keys it provides. This one provides
none, and the reason is the sharpest thing this catalog found about the
framework's configuration contract.

The configuration surface of the cloud runtime is a versioned Kubernetes
component-config document — an API object with its own group and version, nested
several levels deep, delivered as a ConfigMap and mirrored into the chart's
values file. It is not a flat map of environment-variable names to scalars.
Reading the whole main repository for `os.Getenv` outside vendored dependencies
finds a handful of call sites, every one of them either in generated mapper
template code, in a test helper, or a single skip-the-preflight-check switch on
the edge side. The cloud half reads none.

The framework's `usage: config` contract requires exactly that flat shape:
`SCREAMING_SNAKE_CASE` property names, scalar values, no nesting. Its stated
premise is that an instance of the contract is "the configuration one process
actually sees: one flat map of key to value, which is what a process environment
is". For this class of software the premise is simply false, and it is a large
class: nested component config with its own API version is the Kubernetes norm.

So this environment provides no keys, and writing a `config.yaml` full of
invented flattened names — `MODULES_CLOUDHUB_WEBSOCKET_PORT` and the like — would
manufacture a key space that no process reads and that nothing in the project
would ever agree with. The absence is the accurate description. The two
environments that do carry a `config.yaml` carry a very short one, for the same
reason from the other side.
