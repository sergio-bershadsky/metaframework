---
name: cloudhub
kind: component
version: 1
title: CloudHub
summary: The cloud runtime's only inbound surface — the endpoint every edge node connects to, and the certificate authority that lets it.
status: review
owner: sergio-bershadsky
component-type: service
lifecycle: released
criticality: 1
relations:
  exposes:
    - /product/core/protocol/cloud-edge-channel
    - /product/core/protocol/node-enrollment
  depends-on:
    - /product/core/component/viaduct
    - /product/core/component/api
tags:
  - transport
  - endpoint
x-deployment-unit: cloudcore
---

The seam. Every message the cloud sends a node and every message a node sends
back passes through this module, and nothing else in the cloud runtime holds a
socket open to anything outside the cluster.

## Four surfaces, and the reason that is awkward

It serves the same conversation over more than one wire technology at once,
configured independently and enabled independently
(<https://github.com/kubeedge/api/blob/v1.23.0/apis/componentconfig/cloudcore/v1alpha1/default.go>):

| Surface     | Default port or address                 | Default state |
|-------------|-----------------------------------------|---------------|
| WebSocket   | 10000                                   | enabled       |
| QUIC        | 10001                                   | disabled      |
| HTTPS       | 10002                                   | enabled       |
| Unix socket | a socket file under the state directory | enabled       |

The HTTPS surface is a different conversation — it is where an enrolling node
fetches a certificate — but the first, second and fourth are the *same* one. Same
peers, same message envelope, same behaviour on both ends; only the bytes on the
wire differ. The project's own continuous integration runs its whole end-to-end
suite over both the WebSocket and the QUIC form, so neither is vestigial.

That is a problem for the protocol kind rather than for this component, and it is
recorded where the protocols are described: one transport per protocol means one
conversation offered over three wires is three protocol entities, byte-identical
except for their transport artifact, and two of the three name a wire technology
the transport enum does not have.

## What it does besides carry bytes

**It enrols nodes.** The HTTPS surface takes a bootstrap token, accepts a
certificate signing request from a joining node, and returns the certificate that
node will authenticate with from then on. That is the only credential an edge
node ever has, and it is minted here.

**It fans out.** Messages from the controllers are addressed to a node and
delivered on that node's connection; messages arriving from a node are put on the
in-process bus for whichever module cares. Node reachability is therefore a fact
this module holds and nothing else does.

**It bounds the fleet.** The chart carries a node-limit value, so refusing
connections beyond a configured count is this module's behaviour and not the
cluster's.

## Why `service` when it does not deploy

It is the one module in the cloud runtime for which `service` is nearly right: it
has an inbound surface, which is half the definition. It fails the other half —
it is not independently deployed — and the general argument for that is on
[cloudcore](srn://kubeedge/product/core/component/cloudcore). The
`x-deployment-unit` field above names the process it is inside.
