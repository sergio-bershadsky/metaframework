---
name: cloud-edge-channel
kind: protocol
version: 3
title: Cloud-edge channel
summary: One mutually authenticated WebSocket per node carrying every message either half of the control plane has for the other.
status: review
owner: sergio-bershadsky
style: request-response
participants:
  - alias: cloudhub
    ref: /product/core/component/cloudcore/component/cloudhub
    role: hub
  - alias: edgehub
    ref: /product/core/component/edgecore/component/edgehub
    role: spoke
conforms-to:
  - standard: RFC 6455 The WebSocket Protocol
    url: https://www.rfc-editor.org/rfc/rfc6455
tags:
  - websocket
  - asyncapi
  - spine
---

The spine. Every fact that crosses between the cluster and an edge node crosses
here: pod specifications going down, node and pod status coming up, device twins
in both directions, certificate requests, upgrade tasks, and whatever a user's
own rules route. One connection per node, mutually authenticated, multiplexed by
a routing group in the message header rather than by a URL.

It carries exactly one shape — the
[beehive message](srn://kubeedge/product/core/datamodel/beehive-message@1) — and
that envelope's payload field is opaque, so the message × datamodel matrix of
this protocol has exactly one column. That is not a modelling shortcut; it is
what the wire says.

## Three wires, one conversation, and the rule that says that is three protocols

CloudHub serves the **same** conversation over three transports, configured
independently in one module and enabled independently at runtime:

| Wire            | Default        | Address                                     |
| --------------- | -------------- | ------------------------------------------- |
| WebSocket (TLS) | **enabled**    | port 10000                                  |
| QUIC            | disabled       | port 10001                                  |
| Unix socket     | **enabled**    | a socket file under the node's library path |

Same participants, same message schema, same workflows, same state. The framework
says one transport per protocol, and that a protocol offered over two wire
technologies is two protocol entities — so an exhaustive catalog would hold three
entities here, byte-identical except for `transport.yaml`, sharing every workflow
by duplication.

Two of the three could not be written anyway: `transport.kind` admits
`http`, `grpc`, `amqp`, `kafka`, `websocket` and `in-process`, and there is no
`quic` member and no member for a local socket. The framing library underneath
supports exactly two basic transports, WebSocket and QUIC, and the enum names one
of them.

So this catalog holds **one** entity, describing the wire that is on by default,
and states the other two here. The cost is exactly what the rule was protecting
against — a reader cannot see from the transport artifact that a QUIC deployment
is possible — and it is a smaller cost than three copies of one conversation that
drift the first time a workflow changes.

## Why the style is `request-response`, and why that is uncomfortable

The decision rule asks whether the sender names the receiver (it does — there is
one peer) and whether the protocol contracts a correlated reply. It does, for
*some* messages: the header carries a synchronous flag and a parent-identity
field, and a message sent with the flag set is answered with a message whose
parent identity is the first one's identity. The edge runtime's remote query path
uses exactly this, with a default timeout of 60 seconds.

But the great majority of traffic sets neither field and is one-way push. So one
value has to describe a channel that carries both interaction shapes, and
`request-response` is chosen because it is the stronger claim: a reader who
assumes replies exist will not be surprised, and a reader who assumes they do not
would be wrong about the query path. The consequence is that any workflow authored
here as pure event fan-out draws a `W_PROTO_STYLE_MISMATCH` that the catalog can
never clear — which is why `workflows/carry-a-resource-update.yaml` and
`workflows/ask-the-cloud.yaml` are written as one file each rather than merged:
the second one is what keeps the declared style honest.

## Channels are routing groups, not paths

The connection has no per-topic addressing. Dispatch happens on the `group` field
of the envelope, and the receiving hub hands the message to whichever module
family that group names — `resource` for the Kubernetes-shaped traffic the
metadata manager stores, `twin` for device twins, `func` for the function/rule
routing surface, `user` for messages the event bus originated, `taskmanager` for
node upgrade and configuration jobs.

The AsyncAPI dialect wants channels with addresses, and those five group names are
the honest answer: they are what decides where a message goes. Note that this
makes an *address* out of a value in the payload's own header, which is unusual
but is exactly what the wire does.

## Why the document carries no `operations`

`action` is `send` or `receive` relative to one application, and the profile
requires a document with operations to name that application in `id`. This
channel has no such perspective: both ends run the same framing library, every
one of the five groups carries traffic in both directions, and neither side is
the client in any sense the wire records. Naming one would be an arbitrary choice
that a reader would then take as evidence.

So the document declares channels and no operations — the same decision the
`acme` settlement transport made for a different reason, and permitted by the
profile for exactly this case. Direction, where it matters, is in the workflows.

## What the transport artifact does not say

The endpoint the *client* dials carries the node's identity in its path — a
fixed project identifier, the node name, and a trailing segment — while the
server accepts any path and routes automatically. The pathname below is the
client's, with variables, because that is the address the conversation actually
has. Authentication is mutual TLS with a certificate the node obtains through
[node-enrollment](srn://kubeedge/product/core/protocol/node-enrollment@1); the
minimum version is TLS 1.2 and the cipher list is fixed to two suites. None of
that fits a field, so it is prose, and `x-srn-auth` carries the label.

Sources: [`cloud/pkg/cloudhub/servers/server.go`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/cloud/pkg/cloudhub/servers/server.go),
[`edge/pkg/edgehub/config/config.go`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/edge/pkg/edgehub/config/config.go),
[`edge/pkg/edgehub/messagehandler/`](https://github.com/kubeedge/kubeedge/tree/v1.23.1/edge/pkg/edgehub/messagehandler),
[`apis/componentconfig/cloudcore/v1alpha1/default.go`](https://github.com/kubeedge/kubeedge/blob/v1.23.1/staging/src/github.com/kubeedge/api/apis/componentconfig/cloudcore/v1alpha1/default.go).

## The Arazzo description

`arazzo.yaml` re-describes this exchange as the edge hub drives it, in the
OpenAPI Initiative's [Arazzo](https://spec.openapis.org/arazzo/latest.html)
format, grounded in `transport.yaml` — the one synchronous question this channel
carries, with the sixty-second wait expressed as a step timeout, and the
ordinary downward update with the status report that follows on its own
schedule.

An Arazzo Description has a single executor, so it describes one participant's
path and never the whole exchange: `workflows/` stays the authoritative
choreography, and the sequence diagrams on this page derive from it alone. The
file is grammar-free — snapshotted with the entity, served as authored, and
judged by no field table, so no shape of it can be wrong here. One rule does
reach it: grounding, `W_PROTO_ARAZZO_UNGROUNDED` — every source description
must name a sibling artifact, and every operation or channel a step names must
resolve inside one. The step graph the portal draws from the file is a picture
and checks nothing.
