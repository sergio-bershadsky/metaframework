---
name: device
kind: datamodel
version: 1
title: Device
summary: One physical device as a Kubernetes resource — which model it is, which node reaches it, and what each of its properties is worth.
status: review
owner: sergio-bershadsky
usage: both
abstract: false
tags:
  - device
  - crd
  - finding
---

The resource that makes a Modbus register a Kubernetes object. It names a
[device model](srn://kubeedge/datamodel/device-model@1), names the node whose
mapper is expected to reach it, and carries one entry per property: the desired
value, how to visit it, how often to collect and report it, and — the branch
this catalog treats as a finding of its own — a
[push method](srn://kubeedge/datamodel/push-method@1) saying where the readings
go.

It is `usage: both` in the strongest sense available: the same object is stored
by the Kubernetes API server, replicated to the edge node's local database so it
survives a link outage, and exchanged over both
[cloud-edge](srn://kubeedge/product/core/protocol/cloud-edge-channel@1) and
[DMI](srn://kubeedge/protocol/dmi-downstream@1).

## One resource, two API versions, one schema

The Device CRD the project's Helm chart installs serves **two** versions at once:
`v1alpha2` (served, not the storage version) and `v1beta1` (served, and the
storage version). Both are live; the API server converts between them; the
`v1alpha2` schema in that file has properties the `v1beta1` one does not.

This framework's datamodel kind gives an entity one `schema.json` and one
integer `version`, and that integer is a *review* clock — it counts revisions of
the description and carries an additive-only obligation. It is not an API
version, and there is no second axis to put one on. Three modellings were
available and each loses something:

- **One entity at the storage version** (what this is) — describes what a new
  manifest should look like, and says nothing about the version half the tooling
  in the field still writes.
- **Two entities**, `device` and `device-v1alpha2` — makes two things out of one
  resource, and the SRN of the older one bakes an API version into an address
  that is supposed to outlive it.
- **A `oneOf` over both** — validates every legal manifest and describes no
  shape at all; the derived field table becomes untypeable.

The first is chosen and the cost is written here rather than hidden. It is the
same shape of gap as [device-model](srn://kubeedge/datamodel/device-model@1)'s
two encodings, and both are stated on the entity that has them rather than
collected into a complaint elsewhere.

## `node-name` is a placement, in a data model

A device names the node whose mapper will reach it. That single string is the
device abstraction's whole notion of location: there is no site, no gateway, no
topology — the node is the address, and a device unreachable from that node is a
device that reports nothing. It is worth noticing next to the edge fleet's own
placement problem, where the same absence of a site concept shows up one level
up in [edge-fleet](srn://kubeedge/environment/edge-fleet).

## What the schema deliberately does not say

- `protocol` is an inline object here rather than its own entity, because the
  shape is used once. Its sibling
  [visitor-config](srn://kubeedge/datamodel/visitor-config@1) has the identical
  two fields and *is* an entity, for the opposite reason: two models need it.
- Nothing constrains `desired` against the property's declared `type`. The type
  is in the model, the value is here, and JSON Schema cannot express the join
  across two documents that a validating admission webhook would have to do. The
  upstream project does not do it either.

Sources: [`apis/devices/v1beta1/device_instance_types.go`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/staging/src/github.com/kubeedge/api/apis/devices/v1beta1/device_instance_types.go),
[`devices_v1beta1_device.yaml`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/manifests/charts/cloudcore/crds/devices_v1beta1_device.yaml).
