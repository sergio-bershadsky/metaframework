---
name: metamanager
kind: component
version: 1
title: Meta manager
summary: Owns the node-local object store — the durable copy of everything the cloud has told this node, and the reason the node survives losing the cloud.
status: review
owner: sergio-bershadsky
component-type: service
lifecycle: released
criticality: 1
relations:
  depends-on:
    - ../edgehub
tags:
  - storage
  - autonomy
x-deployment-unit: edgecore
---

If this catalog had to point at one component and say "this is why KubeEdge is
not just Kubernetes with a long cable", it would point here. Everything the cloud
sends this node is written down locally before anything acts on it, and
everything that reads afterwards reads the local copy.

## The store, and why it has no component of its own

It is an embedded database: a file on the node, opened by this process through an
object-relational mapper that replaced an older one in the release train this
survey covers
(<https://github.com/kubeedge/kubeedge/blob/v1.23.1/CHANGELOG/CHANGELOG-1.23.md>).

There is no `component-type: datastore` entity for it, and the reason is a
contract gap rather than an oversight. That type means a holder of persistent
state **addressed as infrastructure** — something deployed, something reachable,
something a `depends-on` points at across a network. This one is a file inside a
process. Modelling it as a datastore would put a component in the graph that
nobody deploys and that no environment hosts; leaving it out of the description
entirely would lose the mechanism the whole autonomy story rests on. Prose is the
only place left, which is a real gap in the kind: an embedded database is a
perfectly ordinary thing for a component to have, and the ontology can describe
it only by refusing to.

There is a symmetry worth noting with an earlier catalog in this repository,
which declined to invent a datastore component for state that lived in a process
memory map. Here the datastore genuinely exists, is genuinely durable, and is
still unmodellable. Different reason, same silence.

## Reads, writes and the interval

**Writes** arrive from the cloud through
[edgehub](srn://kubeedge/product/core/component/edgecore/component/edgehub) and
are persisted before being handed on.

**Reads** come from other modules on this node and, through the local API
surface, from workloads. They are answered from the store — not from the cloud —
which is what makes them work at all while disconnected and what makes them fast
when connected.

**Reconciliation** runs on an interval after a reconnection rather than
continuously, so the node's convergence is a schedule rather than an event. The
release this survey covers moved a further class of read to the local store
specifically to cut how much a large fleet asks of the cloud, which is the sort
of change that only makes sense once a store is load-bearing.

## The surface on top of it

[metaserver](srn://kubeedge/product/core/component/edgecore/component/metamanager/component/metaserver)
is a sub-component rather than a paragraph here, because it is a real HTTP
surface with its own address, its own authentication and its own handler set,
consumed by things outside this process. It is off by default.
