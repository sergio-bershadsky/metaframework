---
name: mapper-info
kind: datamodel
version: 1
title: Mapper info
summary: What a device mapper says about itself when it registers — the identity the edge runtime stores and routes device calls by.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - dmi
  - device
---

The self-description a mapper sends on the one call it makes without being asked:
its name, its version, the interface version it was built against, the southbound
protocol it serves, the local address the edge runtime should dial back on, and a
state string.

It is the only place in the device model where a *process* rather than a device
is described, and it is the pivot of the whole downstream direction: the
`protocol` field is what a device's
[visitor config](srn://kubeedge/datamodel/visitor-config@1) is matched against,
and `address` is where
[dmi-downstream](srn://kubeedge/protocol/dmi-downstream@1) dials.

## `address` is bytes, and it is a socket path

Declared in the interface description as a byte string rather than a string,
which is worth knowing before writing a client: what it carries is a local
endpoint — a Unix domain socket path on Linux, a named pipe on Windows — and the
edge runtime dials it with a Unix-network dialer. This catalog types it as a
string with the encoding named in the description, because the schema language has
no byte type and a base64 note is more use to a reader than `type: string` alone.

The direction inversion here is the thing to notice: a *registration* message
carries the address of a *server*, because the registering party is about to
become one. Both DMI protocols are consequences of this one field.

## Stored, not just exchanged

The edge runtime writes the received record into its local database keyed under a
device-mapper resource type, so a mapper that has registered once is still known
after a restart of either side. That is what makes the interface usable across a
link outage: the edge half does not need the cloud to remember which mappers
exist.

Sources: [`apis/dmi/v1beta1/api.proto`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/staging/src/github.com/kubeedge/api/apis/dmi/v1beta1/api.proto),
[`edge/pkg/devicetwin/dmiserver/server.go`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/edge/pkg/devicetwin/dmiserver/server.go).
