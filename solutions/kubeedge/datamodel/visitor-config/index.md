---
name: visitor-config
kind: datamodel
version: 1
title: Visitor config
summary: How to reach one property on one physical device — the protocol name plus an opaque blob only that protocol's mapper understands.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - device
  - dmi
---

A visitor is the instruction for getting at a single property of a physical
device: which register, which node id, which characteristic. This shape carries
two fields — the name of the protocol, and the settings, as a
[customized value](srn://kubeedge/datamodel/customized-value@1) nobody schemas.

It is its own entity rather than a local shape because two other models need it:
a property on the [device model](srn://kubeedge/datamodel/device-model@1) carries
one, and so does a property on the [device](srn://kubeedge/datamodel/device@1)
instance. That is the promotion trigger the framework names first, and it applies
literally here.

## The protocol name is the join, and it joins nothing checkable

`protocol-name` is what decides which mapper is expected to be running: the value
is matched against the protocol a mapper declares when it registers itself over
the [upstream half of DMI](srn://kubeedge/protocol/dmi-upstream). Nothing
validates the string on the way in. A device manifest naming a protocol no mapper
serves is a legal Kubernetes resource that will simply never be visited, and the
error surfaces — if it surfaces — as an absence of readings.

The catalog can say this and cannot check it either: the value is a free string
whose legal set is the set of running processes, which is not a fact any schema
holds.

Source: [`apis/devices/v1beta1/device_instance_types.go`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/staging/src/github.com/kubeedge/api/apis/devices/v1beta1/device_instance_types.go).
