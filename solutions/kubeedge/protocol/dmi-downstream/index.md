---
name: dmi-downstream
kind: protocol
version: 1
title: DMI downstream
summary: The seven calls the edge runtime makes into a mapper to create, update, query and retire the devices that mapper drives.
status: review
owner: sergio-bershadsky
style: request-response
participants:
  - alias: devicetwin
    ref: /product/core/component/edgecore/component/devicetwin
    role: client
  - alias: mapper
    ref: /product/device-integration/component/mapper
    role: server
  - alias: physical-device
    ref: /actor/physical-device
    role: subject
conforms-to:
  - standard: Device Management Interface
    version: v1beta1
    url: https://kubeedge.io/docs/developer/dmi/
tags:
  - grpc
  - device
  - dmi
---

The same interface as [dmi-upstream](srn://kubeedge/protocol/dmi-upstream@1),
with the roles inverted: here the edge runtime is the client and the mapper is
the server. Seven unary calls push device models and device instances down to
the process that knows how to talk to the hardware, and pull one back.

## One interface description, two services, and a file that cannot be shared

Both DMI protocols are declared in **one** protobuf file, as two services whose
client and server sides are mirror images. This catalog splits them into two
protocol entities because the framework requires it — `grpc.service` is a single
string, and `exposes`/`uses` invert between the two — and the split has a cost
that is worth naming precisely:

- The two entities describe **one** wire artifact. A reader who wants the whole
  interface has to open both pages and know they are halves.
- Neither can link the file. `spec.file` must point inside the entity directory,
  so sharing one description between two entities would mean copying it — and it
  may not be copied here at all, for the licensing reason
  [dmi-upstream](srn://kubeedge/protocol/dmi-upstream@1) states.
- The framework's own anti-duplication rule (`spec` XOR a surface list) is what
  makes this survivable: with no spec to link, both entities write their surface
  by hand, and neither is the authority the other diverges from.

What the rule gets right is the direction: these genuinely are two conversations.
The mapper cannot answer a `RegisterDevice` on the socket it registered over, and
the runtime cannot answer a `MapperRegister` on the socket it dials. Two servers,
two sockets, two entities — and one file the catalog cannot hold.

## The address comes from the payload of the other protocol

The runtime dials the local address the mapper stated in its
[registration](srn://kubeedge/datamodel/mapper-info@1) — with an insecure
credential and a Unix-network dialer — and it keeps one client per mapper,
keyed by protocol name. So the endpoint of this protocol is a *field of a message
of another protocol*, decided at runtime, and no artifact in this entity can say
where the calls go. The `grpc` binding block has no endpoint field to disappoint
here; what it lacks is a way to say the endpoint is discovered.

## What crosses, and what does not

`RegisterDevice`, `UpdateDevice` and `GetDevice` carry a whole
[device](srn://kubeedge/datamodel/device@1); `CreateDeviceModel` and
`UpdateDeviceModel` carry a [device model](srn://kubeedge/datamodel/device-model@1).
The two removals carry names only. Every reply is either empty or an echo of the
names, except `GetDevice`, which returns the device.

The device shape that crosses here is **not** byte-identical to the Kubernetes
resource of the same name: the interface's own message set differs in both
directions, as recorded on
[device-model](srn://kubeedge/datamodel/device-model@1). The catalog names one
model on both wires because it is one model, and says so on the datamodel rather
than pretending on the transport.

## The physical device is a participant and takes no call

[physical-device](srn://kubeedge/actor/physical-device) is listed as a
participant because the workflow needs a lifeline for it: the point of
`RegisterDevice` is that the mapper afterwards opens a Modbus, OPC-UA or BLE
conversation that no entity in this catalog describes. Modelling that
conversation as a protocol would require describing the insides of something we
know nothing about — it is exactly what the actor kind is for. Actors need no
back-edge, so nothing on that side is unlinked.

Sources: [`apis/dmi/v1beta1/api.proto`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/staging/src/github.com/kubeedge/api/apis/dmi/v1beta1/api.proto),
[`edge/pkg/devicetwin/dmiclient/client.go`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/edge/pkg/devicetwin/dmiclient/client.go).
