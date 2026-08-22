---
name: device-model
kind: datamodel
version: 1
title: Device model
summary: The class of a physical device — its properties, their types and access modes, and how each is reached over the southbound protocol.
status: review
owner: sergio-bershadsky
usage: both
abstract: false
tags:
  - device
  - crd
---

A device model is the type declaration of a piece of hardware: a thermometer has
a temperature property that is a `FLOAT`, is read-only, has a unit and a range,
and is reached by reading a particular register. Instances of the model —
[devices](srn://kubeedge/datamodel/device@1) — then only have to name the model
and say where they are.

It is `usage: both` and both halves are real: the resource is persisted by the
Kubernetes API server on the cloud side and by the edge runtime's local database
on the edge side, and it is exchanged over the
[cloud-edge channel](srn://kubeedge/product/core/protocol/cloud-edge-channel@1)
and over [dmi-downstream](srn://kubeedge/protocol/dmi-downstream@1) on its way to
the mapper that implements it.

## Two encodings that are not the same shape

The schema below describes the Kubernetes resource. The device management
interface carries a message of the same name that is **not** structurally
identical to it:

| Field                 | Kubernetes resource | DMI message |
| --------------------- | ------------------- | ----------- |
| `properties[]`        | present             | present     |
| `protocol`            | present             | absent      |
| `protocol-config-data`| present             | absent      |
| `commands[]`          | absent              | present     |
| property `visitors`   | present             | absent      |

So the model an operator writes and the model a mapper receives disagree about
which fields exist, in both directions. That is a fact about KubeEdge, and it is
also a place this framework has no vocabulary: a datamodel entity owns exactly
one `schema.json`, and there is no way to say "this model has two encodings whose
field sets differ". The alternatives are two entities that are obviously one
thing, or one entity that is silently wrong about one of its wires. This
description takes the third option — one entity, the resource shape, and this
table.

The related but distinct case of *one resource served at two API versions* is
recorded on [device](srn://kubeedge/datamodel/device@1), which has the same
problem in a sharper form.

## The enums are closed, and the framework's version rule likes that

`type` is one of `INT`, `FLOAT`, `DOUBLE`, `STRING`, `BOOLEAN`, `BYTES`,
`STREAM`; `access-mode` is `ReadWrite` or `ReadOnly`. Both are declared as Go
string constants and both reach the shipped CRD, so a device model naming
anything else is rejected at admission rather than at read time. Adding a member
later is additive under this framework's evolution rule; removing one is a swap —
which is exactly the shape of the upstream project's own compatibility promise
here.

Sources: [`apis/devices/v1beta1/device_model_types.go`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/staging/src/github.com/kubeedge/api/apis/devices/v1beta1/device_model_types.go),
[`devices_v1beta1_devicemodel.yaml`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/manifests/charts/cloudcore/crds/devices_v1beta1_devicemodel.yaml),
[`apis/dmi/v1beta1/api.proto`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/staging/src/github.com/kubeedge/api/apis/dmi/v1beta1/api.proto).
