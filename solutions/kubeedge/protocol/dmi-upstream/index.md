---
name: dmi-upstream
kind: protocol
version: 1
title: DMI upstream
summary: The three calls a device mapper makes into the edge runtime — register yourself, report a reading, report a device's state.
status: review
owner: sergio-bershadsky
style: request-response
participants:
  - alias: mapper
    ref: /product/device-integration/component/mapper
    role: client
  - alias: devicetwin
    ref: /product/core/component/edgecore/component/devicetwin
    role: server
conforms-to:
  - standard: Device Management Interface
    version: v1beta1
    url: https://kubeedge.io/docs/developer/dmi/
  - standard: gRPC over Unix domain sockets
    url: https://grpc.io/docs/guides/custom-name-resolution/
tags:
  - grpc
  - device
  - dmi
---

The northbound half of the Device Management Interface: a mapper calls in, the
edge runtime answers. Three unary calls, no streaming, no TLS, over a socket in
the node's filesystem. It is the first gRPC surface any catalog in this
repository has described, and the first protocol entity whose transport carries a
`grpc` binding block.

## Why it sits at the solution root

The component participants are
[devicetwin](srn://kubeedge/product/core/component/edgecore/component/devicetwin),
a module inside the edge runtime, and
[mapper](srn://kubeedge/product/device-integration/component/mapper), a process
built from a different product's scaffold and released on a different train.
Their pair chains share nothing — `product/core` against
`product/device-integration` — so the nearest common ancestor is the solution and
the protocol is filed here.

That placement is worth reading as evidence rather than as bookkeeping. This
protocol is the seam between the two halves of the project that ship separately,
which is precisely why it is the one the project calls a standard.

## Three calls, and what each of them really is

`MapperRegister` is the only call a mapper makes uninvited, and it is a
handshake in both directions: the mapper sends its
[identity](srn://kubeedge/datamodel/mapper-info@1) — name, version, interface
version, the protocol it serves, and the local address it is *about to listen on*
— and, if it asks for it, receives back every device model and device instance
the runtime believes belongs to it. Everything the
[downstream half](srn://kubeedge/protocol/dmi-downstream@1) does afterwards is
possible only because of the address in that message.

`ReportDeviceStatus` carries a reading: one device's twins, each pairing what was
read with what was desired. `ReportDeviceStates` carries a single string saying
whether the device is reachable at all.

## Where the framework's `grpc` binding did not fit

Four things this protocol does have no field in the binding table, and each is
recorded here rather than smoothed over.

**There is nowhere to put the endpoint.** The block carries `package`, `service`,
`tls` and a method list, and no host, port, path or socket field. This server
binds a Unix domain socket derived from a configured directory — by default the
runtime's own configuration directory, with the file named for the interface —
and on Windows, since v1.23.0, the same interface runs over a **named pipe**
instead, because Windows has no Unix sockets. So the endpoint is a filesystem
path whose *form* changes with the operating system, and the transport artifact
can say none of it. `tls: false` is expressible and is the smaller half of the
truth.

This is the second time this catalog family has hit the same hole: ADR 0013 in
the metaframework solution records `brass` forcing stdio JSON-RPC into
`in-process` with an `x-wire` key. Two catalogs, two local-IPC transports, no
field. The enum is a list of *networks*, and local IPC is not one.

**`package` is documented as dot-separated and this one is a bare word.** The
interface's protobuf package is a single segment naming the interface version.
The value is written as it is, because a transport artifact that improved it
would stop matching the file it describes.

**`request` and `response` name one datamodel each, and a protobuf request is a
struct.** `MapperRegister` sends a boolean *and* an identity; its reply carries
two lists, of two different shapes. Only one of the four could be named. The
convention this catalog adopts, and states here once for both DMI protocols: a
method's `request`/`response` names the model when the message body *is* that
model, and is left unset when the message is a wrapper carrying several things —
with the summary saying what the wrapper adds. The alternative, minting a
catalog entity for each of the twenty wrapper messages, would double the
datamodel count with entities that describe plumbing.

**The `.proto` cannot be linked.** `spec.file` requires a file in the entity
directory, and vendoring an Apache-2.0 interface description into a
PolyForm-Noncommercial repository is a licensing decision nobody has taken. So
the surface list is written by hand instead — which is the branch of
`E_PROTO_TRANSPORT_SPEC_CONFLICT` that says *either* a spec *or* a list, taken
deliberately for a reason the rule did not anticipate.

## The rate limiter is part of the contract

A registration that arrives when the limiter is exhausted is refused with an
error naming the mapper, and so is one whose protocol field is empty. Both are
modelled in `workflows/register-a-mapper.yaml` as error steps, because a caller
has to handle them, which makes them contract rather than implementation. The
server also registers gRPC reflection, so the surface is discoverable at runtime
by any client that can reach the socket — worth stating next to `tls: false`.

Sources: [`apis/dmi/v1beta1/api.proto`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/staging/src/github.com/kubeedge/api/apis/dmi/v1beta1/api.proto),
[`edge/pkg/devicetwin/dmiserver/server.go`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/edge/pkg/devicetwin/dmiserver/server.go),
[`edge/pkg/common/util/network_unix.go`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/edge/pkg/common/util/network_unix.go) and
[`network_windows.go`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/edge/pkg/common/util/network_windows.go).
