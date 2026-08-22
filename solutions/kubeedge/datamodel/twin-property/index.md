---
name: twin-property
kind: datamodel
version: 1
title: Twin property
summary: One value of one device property, with the metadata a mapper attached to it — the unit the whole twin model is built out of.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - device
  - twin
---

The smallest thing the device abstraction moves: a single property value, as a
string, plus a free map of metadata. Everything a device reports and everything
an operator desires of it is expressed as a pair of these — the desired one
written into the device resource, the reported one written back by the mapper —
so this is the shape the whole twin mechanism reduces to.

## Every value is a string

There is no numeric branch and no typed union. A temperature, a boolean coil and
a byte array all arrive as `value`, and what to make of the characters is decided
by the `type` declared for that property on the
[device model](srn://kubeedge/datamodel/device-model@1) — `INT`, `FLOAT`,
`DOUBLE`, `STRING`, `BOOLEAN`, `BYTES` or `STREAM`.

The catalog cannot do better here without lying. A schema that typed `value` as a
number would reject every boolean device in existence; one that made it a union
would claim a discriminator the wire does not carry. The type is one indirection
away, in a different resource, and that indirection is the design.

`metadata` is where a mapper puts the things it knows and the model does not —
the timestamp of the read is the usual one. It is a map of string to string, and
neither key set nor semantics are stated anywhere in the source.

## Required, and the tag that says so oddly

`value` is required and `metadata` is not, which the shipped CRD states
explicitly: the twin property object in
`devices_v1beta1_devicestatus.yaml` carries `required: [value]`. The Go struct
agrees, by way of a JSON tag ending in a bare comma — an unusual spelling that
suppresses `omitempty` and makes an empty reading marshal as an empty string
rather than vanishing. An absent reading and a reading of `""` are therefore the
same bytes, which is a thing to know before writing an alarm on one.

Sources: [`devices_v1beta1_devicestatus.yaml`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/manifests/charts/cloudcore/crds/devices_v1beta1_devicestatus.yaml),
[`apis/devices/v1beta1/device_instance_types.go`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/staging/src/github.com/kubeedge/api/apis/devices/v1beta1/device_instance_types.go).
