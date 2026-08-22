---
name: device-integration
kind: product
version: 1
title: Device integration
summary: The mapper framework a developer scaffolds a fieldbus driver from, the collection it superseded, and the mapper process that results.
status: review
owner: sergio-bershadsky
lifecycle: active
primary-actors:
  - /actor/mapper-developer
  - /actor/cluster-operator
tags:
  - devices
  - mappers
---

Everything on the far side of the device abstraction. The runtimes turn a device
into a custom resource; this product is how the resource gets connected to a
piece of hardware that has never heard of one.

## The product and the strain in one paragraph

A **mapper** is a process that speaks the device-management interface to the edge
runtime on one side and a fieldbus on the other. The project ships no mappers as
products — it ships a **framework** that scaffolds one, leaving the driver files
for a [mapper-developer](srn://kubeedge/actor/mapper-developer) to fill in. So
the thing this product delivers is a generator, and the thing that runs is
whatever the generator produced, deployed by somebody else. Both are described,
which is the only honest arrangement and also the source of the awkwardness on
[mapper](srn://kubeedge/product/device-integration/component/mapper)'s page.

## Two generations, and the lifecycle evidence for calling one of them over

- [mapper-framework](srn://kubeedge/product/device-integration/component/mapper-framework)
  is current. It is one of the three modules staged inside the main repository
  and synced out to its own, so it moves with the runtimes' release train while
  carrying its own tags.
- [mappers-go](srn://kubeedge/product/device-integration/component/mappers-go) is
  the older collection of hand-written mappers, one per protocol family, plus an
  SDK for writing another. It is `lifecycle: sunset`, and the evidence is the
  strongest available for an open-source component. Measured on 2026-08-22: its
  repository's last push is dated 2024-10-31, six hundred and sixty days —
  twenty-one months — earlier, while its successor's is 163 days earlier; and the
  successor's own front page opens by describing itself as a way to make writing
  mappers easier, linking to this repository for the word "mappers"
  (<https://github.com/kubeedge/mappers-go>).

That is the kind of claim `lifecycle` on an open-source component has to be made
of. Nobody published a deprecation notice; a repository stopped moving and
another one started. The catalog says which, and says how it knows.

The product as a whole is `active` because the current half is.

## Why this is a product and not a component of `core`

Because the release train says so, and because the audience does. It is a
different repository with different tags, and its user is a developer writing a
driver rather than an operator running a cluster. The runtime side of the
interface — the part inside the edge process that a mapper talks to — stays in
`core`, on
[devicetwin](srn://kubeedge/product/core/component/edgecore/component/devicetwin),
which is why the conversation between them is one of the few in this catalog
whose participants span two products.
