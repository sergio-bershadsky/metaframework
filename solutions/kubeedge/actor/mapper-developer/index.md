---
name: mapper-developer
kind: actor
version: 2
title: Mapper developer
summary: Writes the driver half of a device mapper against the framework's scaffolding and the device-management interface it generates against.
status: review
owner: sergio-bershadsky
actor-type: human
goals:
  - Get a working mapper skeleton without implementing the edge-side protocol by hand.
  - Write only the part that knows the fieldbus, and nothing about Kubernetes.
  - Ship the result as a container image the cluster operator can deploy.
relations:
  uses:
    - /product/device-integration/component/mapper-framework
tags:
  - developer
  - device
---

A different person from the [cluster
operator](srn://kubeedge/actor/cluster-operator), with a different tool and no
need for cluster credentials. The mapper developer's whole job is the driver
layer: the code that opens a serial port or an OPC-UA session and turns a raw
reading into a value the declared device property can carry.

## Why the role exists as an entity

Because it is the consumer that justifies
[mapper-framework](srn://kubeedge/product/device-integration/component/mapper-framework)
being a separate product from the runtime. A code-generation framework with no
named audience is just a directory; naming the audience is what makes it
possible to ask whether the framework serves them. The framework's own scaffold
generates the process, the device layer, the data-publishing layer and the
interface plumbing, and leaves the driver files marked as the part a human
fills in — that division *is* this actor's contract.

## What the framework asks of them, and what it does not

It does not ask them to learn the cloud-edge channel, the twin model, or the
custom resources. It does ask them to describe their device's properties in the
device model resource, because the generated code reads its configuration from
there. The asymmetry is deliberate on the project's part and worth recording:
the schema author and the driver author are the same person, and the framework's
scaffolding assumes it.

## Boundaries

This actor never appears in a running system. Their output is an image; once it
is deployed, the running thing is a
[mapper](srn://kubeedge/product/device-integration/component/mapper) and the
developer is out of the picture. That is why the only `uses` edge is to the
framework, and why no environment ever hosts anything on this actor's behalf.

It is also why `W_ACTOR_ORPHAN` is raised here and correct. A protocol is a
conversation between things that are running at the same time; this role's output
is an image, and by the time anything in this catalog is speaking, the developer
is gone. There is no participant list that could honestly name them, and the
absence of one is the finding rather than a gap to fill.
