---
name: mapper
kind: component
version: 1
title: Mapper
summary: The process at the end of the device abstraction — device-management interface on one side, a fieldbus on the other, and nothing of its own in between.
status: review
owner: sergio-bershadsky
component-type: gateway
lifecycle: released
criticality: 2
relations:
  uses:
    - /environment/edge-fleet
    - /protocol/dmi-upstream
  exposes:
    - /protocol/dmi-downstream
  depends-on:
    - ../mapper-framework
tags:
  - devices
  - grpc
  - fieldbus
x-runtime: go
---

One process per protocol family, on a node with devices wired to it. It registers
itself with the edge runtime, receives the devices it is responsible for, opens
whatever serial line or industrial session those devices need, and turns readings
into values the declared device properties can carry. That is the entire job, and
the fact that it has no other job is why this page argues for the type it does.

## The awkward entity in this catalog

Every other component here is something the project builds. This one is not:
KubeEdge ships a
[generator](srn://kubeedge/product/device-integration/component/mapper-framework)
and an interface, and a mapper is what somebody else produces from them and
deploys. The catalog describes the **role**, because leaving it out would delete
one half of every conversation on the device path and would leave two protocol
entities with one participant each.

That has a visible cost in three required fields, and it is better to name it
than to let the values look confident:

- **`lifecycle: released`** is the nearest true value and it is answering a
  question about a class rather than an artifact. Nothing in this repository
  builds a mapper, so "shipped at least once" is a statement about the generator
  and the interface, both of which are shipped and both of which produce running
  mappers today. `planned` would be false and `in-development` would be false;
  there is no value meaning "this shape of process exists and is built
  elsewhere".
- **`criticality: 2`** is a per-deployment fact stated globally. A site whose
  mapper is down has devices that neither report nor accept a setpoint, while the
  rest of the node keeps working — serious, contained, and different at every
  installation.
- **`x-runtime: go`** describes what the generator emits, not what the interface
  requires. The device-management interface is gRPC, so a mapper could be written
  in any language with a gRPC implementation; every one this project has shipped
  or generated is Go.

## Why `gateway`, and where the type does not reach

The type is defined as fronting, routing or adapting others rather than owning
behaviour, and the *behaviour* half fits perfectly. A mapper decides nothing. It
does not choose what to read, when to read it, or what a value means: the device
resource says which properties exist, how often to collect and report them, and
where to push them, and the mapper executes that. A mapper that started making
decisions would be a review finding on any reading of this type.

The *fronting* half is where it strains, and the strain is precise. The
discipline says a gateway MUST name what it fronts, with a `depends-on` edge to
every fronted component. What this component fronts is a
[physical-device](srn://kubeedge/actor/physical-device) — an **actor**, and no
forward edge in this framework accepts an actor target. So the requirement cannot
be satisfied as written, and the `depends-on` edge above points at the generator
it is built from instead, which is a build-time fact and not a fronting one.

The alternative would be to promote devices to `external` components, which is
what the boundary test does for
[containerd](srn://kubeedge/product/core/component/containerd) and
[mosquitto](srn://kubeedge/product/core/component/mosquitto). It is the wrong
answer here for a reason that is the whole point of this product: those are named
systems a specific component requires by name, and a device is deliberately not
named by anything. The abstraction exists so the number and kind of devices can
change without a single edge in this catalog moving. Promoting them would produce
one component per device model per deployment — an unbounded set, none of whose
members this catalog could describe.

So the honest summary is that `gateway` is right about what this component does
and its discipline is unsatisfiable at this particular seam, because the
framework has gateways that front components and this one fronts the outside
world.

## The two protocol edges, and why they point in opposite directions

This is the only component in the catalog that is a server on one protocol and a
client on the other, over the same interface description and often the same
socket. It **exposes**
[dmi-downstream](srn://kubeedge/protocol/dmi-downstream) — the edge runtime calls
in to push device models and device instances down and to query one back — and it
**uses** [dmi-upstream](srn://kubeedge/protocol/dmi-upstream), calling out to
register itself and to report readings and device states.

Two entities for one interface is a consequence of the framework's rules rather
than a fact about the system: a protocol carries one `grpc.service` string, and
`exposes` and `uses` invert between the two directions, so there is no way to
model it as one. The protocol pages carry the argument; the component side of it
is simply that this entity's contract panel shows the same interface twice, once
in each column.

## How it is deployed, and why the topology entry says so little

By whoever owns the devices, once per fieldbus family they have, onto the nodes
those devices are physically attached to. There is no chart in any KubeEdge
repository that places one — the generator emits a container definition and the
project's instructions stop at "build the image and deploy it". That is why
[edge-fleet](srn://kubeedge/environment/edge-fleet)'s `topology.yaml` gives this
component no replica range and no region detail beyond the placeholder every
entry there shares, and puts the only true sentence available in its `scaling`
line.

The environment edge above is nonetheless real and it is load-bearing: it is what
makes the three credential keys in that environment's `config.yaml` scoped
configuration rather than orphans, and those three keys are the only place in
this entire system where the framework's flat configuration contract describes
the reality exactly.
