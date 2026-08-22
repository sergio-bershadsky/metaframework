---
name: router
kind: component
version: 1
title: Router
summary: Moves application messages between declared endpoints — a cloud REST caller, an edge MQTT topic, an edge HTTP service — with no knowledge of what is in them.
status: review
owner: sergio-bershadsky
component-type: service
lifecycle: released
criticality: 3
relations:
  depends-on:
    - ../cloudhub
tags:
  - messaging
  - rules
x-deployment-unit: cloudcore
---

The only part of the cloud runtime that carries somebody else's payload. Every
other module moves control-plane objects; this one moves application data between
a cloud caller and something at the edge, according to rules an operator
declares.

## The shape of a rule

An operator declares endpoints and then rules joining a source endpoint to a
target one. The endpoint kinds are a small closed set — a REST surface in the
cloud, a message topic at the edge, an HTTP service at the edge — and a rule
names one of each plus the resource within it.

Two things about that are worth recording where a reader will find them. The
first is that this module owns an inbound HTTP surface of its own, disabled by
default, which is what the cloud-side REST endpoint kind means: when it is on,
this module is listening. The second is a modelling observation rather than a
system one — the source and target descriptors on a rule are untyped string maps
whose legal keys depend on which endpoint kind was named, so the resource is a
discriminated union written as free-form maps, and no schema in the project
constrains it.

## Why `service` and why it is still a nearest fit

It has an inbound surface, so `service` beats `job`. `gateway` was considered and
is arguably closer to the truth — it fronts, routes and adapts rather than owning
behaviour, which is nearly the definition of this module — but the gateway
discipline requires naming every fronted component with a `depends-on` edge, and
what this module fronts is not components. It is endpoints an operator declared
at runtime, most of which are things outside this catalog entirely: somebody's
HTTP service on an edge node, somebody's MQTT topic. A gateway that cannot name
what it fronts is not the type's meaning.

That is the same shape of problem the device data path has, and it is the
deepest one this survey found: the set of things a component talks to is
sometimes a value in a resource an operator writes at runtime, not a fact in the
catalog's tree.

## Blast radius

`criticality: 3`. It is disabled by default, nothing in the control plane depends
on it, and a cluster without it simply has no application message routing. When
it is on, however, it is on the data path for whatever traffic it was given, and
it is the one module here where a failure loses somebody's message rather than
delaying a reconciliation.
