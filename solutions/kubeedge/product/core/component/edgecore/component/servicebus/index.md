---
name: servicebus
kind: component
version: 1
title: Service bus
summary: A loopback HTTP listener on the node that turns a message from the cloud into a call against a local service, and the reply back into a message.
status: review
owner: sergio-bershadsky
component-type: service
lifecycle: released
criticality: 3
relations:
  depends-on:
    - ../edgehub
tags:
  - http
  - messaging
x-deployment-unit: edgecore
---

The counterpart at the edge of the cloud runtime's message router. A rule an
operator declared says "requests arriving at this cloud endpoint go to that
service on that node"; the cloud half carries the request down the channel, and
this module is what performs the actual HTTP call at the node and carries the
response back.

## What makes it awkward to type

It listens, on a loopback address, which is why `service` rather than `job`. But
what it does with what it hears is call something else, which is what a `gateway`
does — and `gateway`'s discipline requires naming every fronted component with a
`depends-on` edge. The things this module fronts are **somebody else's HTTP
services running on this node**: not components of this solution, not entities in
this catalog, not knowable until an operator writes a rule.

So neither type is right, for a reason that keeps recurring in this catalog: the
set of things a component talks to is sometimes chosen at runtime, in a resource
an operator writes, and the ontology models what a component talks to as edges in
a tree. `service` is chosen here because the inbound surface is a fact and the
outbound set is not.

## Off by default, and small

It is shipped disabled, nothing depends on it, and a node without it simply has
no cloud-to-local-service path. `criticality: 3` reflects that: it carries
application traffic when it is on, and its absence degrades nothing in the
control plane.

## Why it is not the same thing as the node's Kubernetes API surface

Both listen on loopback and both are reached from outside the node, and they are
easy to confuse. The node's Kubernetes API surface answers *about* the node from
the local store; this module calls *out* to something the node happens to be
running. One is a read of the catalog's own data, the other is a proxy for
somebody else's application.
