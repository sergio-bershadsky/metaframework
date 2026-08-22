---
name: device-status
kind: datamodel
version: 1
title: Device status
summary: What a device is currently worth and whether it is reachable — split out of the device resource into a CRD of its own in v1.23.0.
status: review
owner: sergio-bershadsky
usage: both
abstract: false
tags:
  - device
  - crd
---

The reported half of the device abstraction: one twin per property, each pairing
what the mapper last read with what the operator last asked for, plus the
device's own reachability state and when it was last seen.

Until v1.23.0 this lived inside the [device](srn://kubeedge/datamodel/device@1)
resource. In v1.23.0 it became a resource of its own, and the project's release
notes state the consequence plainly: reads of device status have to be made
against the new resource. Old manifests keep applying — the split preserved
write compatibility — but a reader that kept looking in the old place now finds
nothing.

That is worth pausing on, because this framework would classify the same change
differently depending on which end you stand at. Moving a field out of a shape is
a **narrowing** of that shape, which the additive-only rule forbids in place and
which needs a swap; arriving as a new shape is an ordinary `version: 1`. The
upstream project did both halves at once and called it backward compatible,
which is true of the writer and false of the reader — the distinction the
framework draws between a contract surface and its producers and consumers,
observed in the wild.

## An empty spec

`DeviceStatus` is a Kubernetes resource whose `spec` is an empty struct: nothing
is desired of it, everything is reported. It carries the shape anyway because the
generated CRD and the client machinery expect a spec, and the schema below keeps
it for the same reason — describing the resource means describing the empty
field a manifest is allowed to write.

Like the other two device resources, this one is served at `v1alpha2` and
`v1beta1` simultaneously, with `v1beta1` as the storage version; the general
problem that raises for a kind with one schema per entity is recorded on
[device](srn://kubeedge/datamodel/device@1).

## `extensions` is where the anomaly framework writes

A free map, added alongside the anomaly-detection work in the same release. The
detection logic runs in the mapper and its output has no declared shape, so this
is a second free bag beside
[customized-value](srn://kubeedge/datamodel/customized-value@1) — different
producer, same absence of a schema, and deliberately not modelled as the same
entity because they are not the same fact.

Sources: [`apis/devices/v1beta1/device_status_types.go`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/staging/src/github.com/kubeedge/api/apis/devices/v1beta1/device_status_types.go),
[`devices_v1beta1_devicestatus.yaml`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/manifests/charts/cloudcore/crds/devices_v1beta1_devicestatus.yaml),
[CHANGELOG-1.23.md](https://github.com/kubeedge/kubeedge/blob/master/CHANGELOG/CHANGELOG-1.23.md).
