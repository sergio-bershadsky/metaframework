---
name: customized-value
kind: datamodel
version: 1
title: Customized value
summary: The unschema'd bag of protocol-specific settings that every device shape hangs its driver configuration off.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - device
  - dmi
  - free-form
---

A map from string to anything, carried inside three other device shapes and
schema'd by nobody. It exists as its own entity because it is the exact point
where the device abstraction stops abstracting: everything above it is a
Kubernetes resource with a generated OpenAPI schema, and everything a Modbus
register or an OPC-UA node actually needs to be read is in here, in whatever
shape the mapper that reads it decided on.

## Why the schema below is almost empty

Because the source is. In the CRD Go types the value is a struct with one field,
a `map[string]interface{}`, and in the Device Management Interface's protobuf
description it is a `map<string, Any>`. Neither says what the keys are. The CRD
that ships in the project's Helm chart marks the surrounding property
`x-kubernetes-preserve-unknown-fields`, which is Kubernetes' way of saying the
API server must store what it cannot validate.

Writing properties here would therefore be inventing them. The schema states the
one thing that is true — this is an object, and its members are free — and the
description carries the rest.

## One shape, two encodings, and a wrapper that disappears

The Go type wraps the map in a field named `data`, and then defines its own
`MarshalJSON` that emits the map alone. So the wrapper exists in the type system
and not on the wire: a device manifest writes the settings directly, with no
intervening `data` key. The protobuf form has no such wrapper to hide.

That is a small instance of a pattern this catalog hits repeatedly with KubeEdge
shapes — see [device](srn://kubeedge/datamodel/device@1), where the divergence is
larger and is a genuine finding rather than a marshalling detail.

Sources: [`apis/devices/v1beta1/device_instance_types.go`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/staging/src/github.com/kubeedge/api/apis/devices/v1beta1/device_instance_types.go),
[`apis/dmi/v1beta1/api.proto`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/staging/src/github.com/kubeedge/api/apis/dmi/v1beta1/api.proto).
