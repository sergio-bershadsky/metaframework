---
name: push-method
kind: datamodel
version: 1
title: Push method
summary: The per-property choice of where a mapper sends a device reading — seven destinations, selected at runtime inside a custom resource.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - device
  - dmi
  - finding
---

Where the readings go. Each property of each device may name one of these, and
the choice selects a wire: an HTTP endpoint, an MQTT broker, an OTLP collector,
or one of four databases — InfluxDB 2, Redis, TDengine, MySQL. A fifth member,
`anomaly-detection`, is not a destination at all but a configuration blob the
mapper interprets itself; it arrived in v1.23.0 together with the framework that
runs it.

This is the most interesting shape in the KubeEdge survey, and the interest is
not in the fields. It is in what the fields do to the description of the system.

## The set of wires a deployment speaks is a value in a schema

Everywhere else in this catalog — and everywhere else in this framework — a wire
is an entity. A [protocol](srn://kubeedge/protocol/dmi-upstream@1) has a
directory, a placement computed from its participants, a version, a transport
artifact and a review history. That model assumes the set of conversations a
system has is a fact about the system, knowable by reading it.

Here it is not. The device data plane's wire is chosen **per property, per device
instance, by an operator writing a custom resource**, after everything is built
and deployed. A cluster with three devices may speak MQTT, Redis and OTLP; the
same code with three different manifests speaks none of them. No repository read
at any commit tells you which.

Both available modellings are wrong, and this entity is the record of choosing
neither:

- **A protocol entity per destination** — `device-data-push-mqtt`,
  `device-data-push-influxdb2`, and five more — would put seven wires in the
  catalog, each with participants, each addressable, most of which no deployment
  has ever configured. Their `transport.yaml` files would describe endpoints that
  exist in no environment. That is a catalog asserting seven conversations from a
  single `oneOf`.
- **Omitting them** hides the entire southbound data plane: the thing the device
  abstraction exists to produce goes undescribed, and a reader concludes readings
  stop at the mapper.

So the wires are described **as data**, here, where the source puts them, and no
`device-data-push` protocol entity exists in this catalog. The cost is real and
worth stating: the message × datamodel matrix will never show these
destinations, no diagram draws them, and a reviewer asking "what does an edge
node talk to" gets an answer that is complete only if they open this page.

## The MQTT branch, and why it has no protocol entity either

`mqtt` here is a second, independent MQTT surface — a mapper publishing straight
to a broker of the operator's choosing, unrelated to the
[device-mqtt-bus](srn://kubeedge/product/core/protocol/device-mqtt-bus@1) that
EdgeCore's own eventbus module speaks. That protocol entity exists and carries no
`transport.yaml` at all, because `transport.kind` has no `mqtt` member. This one
does not exist as an entity for the different reason above. Two MQTT surfaces,
two different reasons the framework cannot hold them.

## Field notes

`db-method` is a second `oneOf` inside the first: four database branches, exactly
one of which is set. Its TDengine member is spelled `TDEngine` in the Kubernetes
resource and `tdengine` in the DMI protobuf description — the same field, two
spellings, in two files of the same repository. The catalog writes it once,
kebab-cased like every other property here, and names both wire spellings in the
description.

`anomaly-detection` is structurally identical to a
[customized value](srn://kubeedge/datamodel/customized-value@1) — a free map with
the same custom marshalling — and references it, because inventing a second
name for one shape is how a catalog grows two of everything.

Sources: [`apis/devices/v1beta1/device_instance_types.go`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/staging/src/github.com/kubeedge/api/apis/devices/v1beta1/device_instance_types.go),
[`apis/dmi/v1beta1/api.proto`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/staging/src/github.com/kubeedge/api/apis/dmi/v1beta1/api.proto),
[CHANGELOG-1.23.md](https://github.com/kubeedge/kubeedge/blob/master/CHANGELOG/CHANGELOG-1.23.md).
