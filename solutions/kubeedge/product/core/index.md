---
name: core
kind: product
version: 1
title: Core
summary: The cloud runtime, the edge runtime, the installer and the staged libraries — everything that ships on the main repository's release train.
status: review
owner: sergio-bershadsky
lifecycle: active
primary-actors:
  - /actor/cluster-operator
  - /actor/edge-workload
tags:
  - runtime
  - installer
---

Everything released together from `github.com/kubeedge/kubeedge`. If a change to
it goes out, it goes out under one tag, reviewed by one maintainer group, tested
by one workflow — and that, rather than the cloud-versus-edge picture the
project's architecture pages draw, is what makes this a product.

## Why the boundary is the release train

The obvious split would follow the documentation: a cloud product and an edge
product. It is the wrong line here, and it is worth saying why, because the same
temptation will come up in every future survey of an open-source system.

Cloud and edge in KubeEdge are two halves of one shipped thing. They are built
from one repository, versioned with one tag, tested against each other in one
end-to-end job, and released by one group of people. Splitting them would create
two products with one owner, one budget and one release — which is two ownership
lines for something that has one — and would then force an arbitrary answer for
the installer, which serves both, and for the libraries, which both compile.

Release train is the only boundary an open-source project actually publishes, so
it is the one the products follow. The other three products in this catalog have
their own repositories and their own tags, and each is at a different tag from
this one.

## `lifecycle: active`, and what the evidence for it is

The specification stages a product as a funded position in a portfolio, moved by
whoever decides investment. There is no investment ledger to read here. What
there is: a release published a few weeks before this survey, a repository pushed
within days of it, and the three staged libraries all pinned to the same minor
version as the runtimes. That is what `active` is claimed on, and naming the
evidence is the point — an open-source `lifecycle` is an inference from activity,
and a reader deserves to know which activity.

## What is inside

Two runtimes, each a single process hosting a set of pluggable modules:

- [cloudcore](srn://kubeedge/product/core/component/cloudcore) — the cluster-side
  process. Watches Kubernetes, owns the edge-facing endpoints, and pushes to
  nodes.
- [edgecore](srn://kubeedge/product/core/component/edgecore) — the node-side
  process. A kubelet, a local store, a device twin and a message bus in one
  binary.

Their sub-components are the modules inside them, and modelling those is where
this catalog strains hardest against the `component-type` enum; both parent pages
carry the argument.

Around them: [keadm](srn://kubeedge/product/core/component/keadm), the installer,
which is the catalog's first `component-type: application`; three optional
cluster workloads built as separate binaries from the same repository —
[admission-controller](srn://kubeedge/product/core/component/admission-controller),
[controller-manager](srn://kubeedge/product/core/component/controller-manager)
and
[iptables-manager](srn://kubeedge/product/core/component/iptables-manager) —
plus [csi-driver](srn://kubeedge/product/core/component/csi-driver); and the
three libraries the repository stages and publishes to their own repositories,
[beehive](srn://kubeedge/product/core/component/beehive),
[api](srn://kubeedge/product/core/component/api) and
[viaduct](srn://kubeedge/product/core/component/viaduct).

Three systems the project depends on and does not own are described here as
`external` components, because the framework's forward edges accept components
and never actors, so anything a `depends-on` must name has to be one:
[kubernetes-api-server](srn://kubeedge/product/core/component/kubernetes-api-server),
[containerd](srn://kubeedge/product/core/component/containerd) and
[mosquitto](srn://kubeedge/product/core/component/mosquitto).

## What is deliberately not modelled

The repository also builds an edge-node simulator used for scale testing and a
combined edge-site binary. Both were seen in the tree at the surveyed tag and
neither is described as a component: they are test and packaging artifacts rather
than parts of a deployment, and inventing entities for them would put things in
the component graph that nobody deploys. The same reasoning keeps the project's
in-Kind tooling out — it is named on
[single-machine](srn://kubeedge/environment/single-machine) as the thing that
produces that target, and nowhere else.
