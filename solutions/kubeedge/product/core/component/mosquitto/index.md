---
name: mosquitto
kind: component
version: 1
title: Mosquitto
summary: The MQTT broker the cloud half's own chart installs onto edge nodes — a third-party system this project ships, enabled by default and running nowhere near the cloud.
status: review
owner: sergio-bershadsky
component-type: external
lifecycle: released
criticality: 2
relations:
  uses:
    - /environment/edge-fleet
    - /environment/single-machine
tags:
  - mqtt
  - devices
  - external
---

Somebody else's broker, installed by this project's own chart. Eclipse Mosquitto
is not KubeEdge code and nobody here maintains it, but the cloud half's Helm
chart carries a DaemonSet template for it, switched on in the chart's default
values and pinned to a published image tag
(<https://github.com/kubeedge/kubeedge/blob/v1.23.1/manifests/charts/cloudcore/values.yaml>).
Installing a dependency for the operator is a legitimate thing for a chart to do;
it just makes the ownership line harder to see, which is why this page exists.

## The detail most likely to be misread

It is declared in the **cloud** chart and it does not run in the cloud. The
template's default affinity requires the edge node role, so every replica lands
on an edge node, with the host network and a host path under the node's KubeEdge
directory for its data. A reader who finds it in the chart and assumes it is a
cluster-side workload has the topology exactly backwards, and it matters: the
whole point of putting the broker on the node is that device traffic terminates
at the site and never crosses the link to the cloud.

That also explains the environment edges above. It is declared on
[edge-fleet](srn://kubeedge/environment/edge-fleet) and not on
[cloud](srn://kubeedge/environment/cloud), even though the artifact that places
it belongs to the cloud environment's chart. The
[single-machine](srn://kubeedge/environment/single-machine) edge is an
**inference** rather than a reading: the same chart default applies, and an
all-in-one host carries the edge node role that the affinity requires, so the
broker lands there too — but no single-host manifest was read that says so, and
that is the difference between this edge and the one beside it.

## Why it is a component and not an actor

The mechanical half of the boundary test, again:
[eventbus](srn://kubeedge/product/core/component/edgecore/component/eventbus)
has to name it in a `depends-on` edge, and no forward edge in this framework
accepts an actor target. It is also the right answer on the substance — a
specific component requires this specific system by name, which is exactly the
distinction that keeps
[physical-device](srn://kubeedge/actor/physical-device) an actor.

## The boundary, and the one wire this catalog cannot describe

The contract at this seam is MQTT: a broker with topics, published messages and
subscriptions, reached over TCP. Nothing about that is unusual — it is the most
widely deployed wire in the entire device-integration industry — and it is the
one wire the framework's transport contract has no value for.

`transport.yaml` names a closed set of six kinds — `http`, `grpc`, `amqp`,
`kafka`, `websocket`, `in-process` — and anything outside it fails
`E_PROTO_TRANSPORT_SCHEMA`. The AsyncAPI dialect that would otherwise be the
escape hatch admits three protocol spellings and their TLS variants: Kafka,
WebSocket, AMQP. AsyncAPI itself defines an MQTT binding and accepts
`protocol: mqtt`; the framework adopted AsyncAPI as a dialect for this role and
then narrowed it below what the standard covers, and the narrowing lands on this
broker.

The consequence is concrete rather than theoretical. Three separate surfaces in
this system speak MQTT — the edge runtime's bridge against this broker, the
per-property publish target a device resource may select, and one of the three
endpoint types the routing module accepts — and none of them can be given a
protocol entity whose transport says what it is. Recording it here, on the
external component that sits behind the seam, is the closest the catalog can get
to describing the conversation at all.

## What is deliberately not described

Its version beyond the tag the chart pins, its configuration, its persistence,
its authentication. An operator may replace it wholesale — the edge runtime's
bridge takes a broker address and does not care whose broker answers — and the
project's own defaults point at the loopback address of the node rather than at
this DaemonSet by name. Describing this broker's insides would claim a coupling
that does not exist.
