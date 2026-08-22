---
name: beehive-message
kind: datamodel
version: 1
title: Beehive message
summary: The envelope every module in both runtimes exchanges, and the only thing that ever crosses the cloud-edge channel.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - transport
  - framework-shape
  - finding
---

One envelope, used for everything. Modules inside CloudCore and inside EdgeCore
send these to each other through the in-process message bus, and the
[cloud-edge channel](srn://kubeedge/product/core/protocol/cloud-edge-channel@1)
carries the same shape between the two processes. A pod update, a device twin
change, a certificate signing request and an operator's exec are all instances of
this and differ only in the routing fields and in the opaque payload.

## The payload is a hole, and that is the finding

`content` is `interface{}` in the in-process form and a bare byte string in the
wire form. Nothing in the envelope says what is inside it: the receiving module
infers the shape from `route.resource` and `route.operation`, which are strings
assembled by convention — a slash-joined path naming a node, a namespace, a
resource type and a name.

For this framework that means the message × datamodel matrix of the cloud-edge
channel bottoms out at exactly one entity: this one. Every payload reference on
that protocol points here, and the thing a reviewer wants — "what shapes cross
this link" — is not expressible, because the producer does not declare it either.
It is the honest answer and it is a thin one. Compare
[device](srn://kubeedge/datamodel/device@1), which genuinely crosses this link,
and whose relationship to this envelope no artifact in the catalog can state.

## Two headers for one message

The in-process Go form and the protobuf form of the header are not the same set
of fields: the Go header carries a resource-version string that the protobuf
header has no field for. So a message that has crossed the wire is missing a
header field a local one has, and the framing description and the in-process
struct disagree about what a header is. The schema below describes the wire form
and marks the extra field as local-only.

The protobuf description also misspells the route's resource field — a typo
preserved across releases because renaming it would be a wire break. Names on a
wire are load-bearing whether or not they are correct, which is the same reason
this framework refuses to rename anything in place.

## 32 MiB, since v1.23.1

The framing code allocated a buffer from an attacker-declared length with no
upper bound; an authenticated edge node could exhaust CloudCore's memory with
crafted headers. v1.23.1 enforces a 32 MiB payload limit
([CVE-2026-62370](https://github.com/kubeedge/kubeedge/security/advisories/GHSA-gfw4-49f9-cp25)).
The number is a property of the envelope rather than of any one protocol, so it
is recorded here.

## `sync` and `parent-id` are why the channel's style is a compromise

Both are header fields, and both are optional. A message with `sync` set expects
a correlated reply carrying its id as `parent-id`; the great majority of traffic
sets neither and is a one-way push. One channel therefore carries two interaction
styles, and the protocol kind's `style` field admits one value —
the consequence is argued on
[cloud-edge-channel](srn://kubeedge/product/core/protocol/cloud-edge-channel@1)
rather than repeated here.

Sources: [`beehive/pkg/core/model/message.go`](https://github.com/kubeedge/beehive/blob/v1.23.0/pkg/core/model/message.go),
[`pkg/viaduct/pkg/protos/message/message.proto`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/pkg/viaduct/pkg/protos/message/message.proto),
[CHANGELOG-1.23.md](https://github.com/kubeedge/kubeedge/blob/master/CHANGELOG/CHANGELOG-1.23.md).
