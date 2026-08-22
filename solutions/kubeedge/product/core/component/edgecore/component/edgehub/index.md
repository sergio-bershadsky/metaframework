---
name: edgehub
kind: component
version: 1
title: EdgeHub
summary: The node's single client connection to the cloud — dials out, authenticates with the certificate enrolment minted, and multiplexes everything.
status: review
owner: sergio-bershadsky
component-type: gateway
lifecycle: released
criticality: 1
relations:
  uses:
    - /product/core/protocol/cloud-edge-channel
    - /product/core/protocol/node-enrollment
  depends-on:
    - /product/core/component/viaduct
    - /product/core/component/cloudcore/component/cloudhub
tags:
  - transport
  - edge
x-deployment-unit: edgecore
---

What it fronts is named in its `depends-on`: the cloud runtime's edge-facing
endpoint. Every other module on this node reaches the cloud by handing a message
to this one, and none of them holds a connection of its own.

## Why the direction matters more than anything else about it

It **dials out**. There is no inbound path to an edge node, by design and by
network reality — sites sit behind routers with no port forwarding and no static
address. The consequence runs through the entire architecture: certificate
enrolment is a request the node makes, interactive kubectl access needs a tunnel
the node establishes, and a cloud that wants to reach a node can only put a
message on the connection that node already opened.

That is also why this component is a `gateway` rather than a `service`: it has no
inbound surface at all. Nothing calls it; it calls, and then everything on this
node routes through what it opened.

## The wires

It mirrors the cloud endpoint's configuration: a WebSocket client enabled by
default and a QUIC client shipped disabled, plus a separate HTTPS client used for
enrolment
(<https://github.com/kubeedge/api/blob/v1.23.0/apis/componentconfig/edgecore/v1alpha2/default.go>).
The choice is per node and static — nothing negotiates or falls back at runtime,
so a fleet where some nodes speak one wire and some the other is a fleet
somebody configured that way.

## What happens when it fails

Nothing on this node stops. That sentence is the whole value proposition of the
system and it is worth stating on the component whose failure it describes: the
container runtime keeps the pods up, the local store keeps answering reads,
devices keep being polled, and the node accumulates status it will report when
the connection returns. What stops is *change* — no new workload, no updated
secret, no revocation.

Reconnection is this module's job, and reconvergence after it is the cloud
runtime's, in
[synccontroller](srn://kubeedge/product/core/component/cloudcore/component/synccontroller).
