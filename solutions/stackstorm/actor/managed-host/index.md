---
name: managed-host
kind: actor
version: 1
title: Managed host
summary: The machine an action reaches over SSH or WinRM — the object of the automation, and the one counterpart that appears in no dependency edge.
status: review
owner: sergio-bershadsky
actor-type: external-system
goals:
  - Be changed only by a run somebody can point at afterwards.
  - Accept a command from a known key or account, and nothing else.
tags:
  - outbound
  - target
---

The machines the whole product exists to act on. Five of the shipped action
runners reach another computer: two over SSH and three over WinRM. That outbound
half is not an integration StackStorm has — it is what StackStorm is for.

## Why the object of the automation is an actor

An actor is normally something that *pushes on* the system. This one is pushed
on, and it is still an actor rather than an `external` component for the reason
the boundary test gives: no component in this solution needs to name a managed
host in an edge. A managed host is not a system the platform depends on; it is a
value at the end of an action's parameters, different for every execution,
enumerated nowhere.

Modelling it as an `external` component would mean claiming there is one of it,
which is false, and would put a node in the component graph for a population.
Modelling it as nothing at all would lose the fact that the product's entire
outbound surface has a counterpart.

## The enum has no value for the wires that reach it

This is the sharpest ontology finding on the outbound half, and it belongs on
this entity because this is the counterpart at the far end of it.

`transport.kind` is a closed set: `http`, `grpc`, `amqp`, `kafka`, `websocket`,
`in-process`. SSH is none of them, and WinRM — a SOAP dialect over HTTP, with
its own session, shell and authentication model — is `http` only in the sense
that everything is. The nearest neighbour is genuinely nothing: this is not a
request/response API, not an RPC framework, not a broker, and emphatically not
in-process.

The pattern is now established well enough to be a finding about the enum rather
than about any one catalog. [brass](srn://brass) took `in-process` for
line-delimited JSON-RPC over standard input and output and recorded the strain
in an `x-` field; a sibling survey in this repository hit the same wall with
MQTT on several entities; this one hits it with SSH and WinRM. Three catalogs,
three different wires, one closed enum, and in every case the honest answer was
prose rather than a value.

## What is deliberately not described

What runs on a managed host, what state it holds, and whether it is a server, a
switch or a laptop. The platform does not know either. It knows a hostname, a
credential, and a command it was told to run.
