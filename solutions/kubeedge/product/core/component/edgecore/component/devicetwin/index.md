---
name: devicetwin
kind: component
version: 1
title: Device twin
summary: Holds desired and reported state for every device on this node, and hosts both directions of the device-management interface a mapper speaks.
status: review
owner: sergio-bershadsky
component-type: service
lifecycle: released
criticality: 2
relations:
  exposes:
    - /protocol/dmi-upstream
  uses:
    - /protocol/dmi-downstream
  depends-on:
    - ../edgehub
    - ../eventbus
tags:
  - devices
  - grpc
x-deployment-unit: edgecore
---

The node's model of the hardware attached to it. A device declared in the cluster
arrives here as desired state; a reading taken by a driver arrives here as
reported state; and the difference between the two is what makes a device
controllable from a `kubectl apply`.

## The gRPC seam, in both directions

This module is the reason this solution was surveyed at all: it hosts the first
gRPC surface in any catalog in this repository, and it hosts **both ends** of it.

The device-management interface is one interface definition declaring two
services with inverted roles, and the two edges above are what that costs in
frontmatter. In [dmi-upstream](srn://kubeedge/protocol/dmi-upstream) this module
is the server and a
[mapper](srn://kubeedge/product/device-integration/component/mapper) is the
client — a mapper registers itself and reports device state upward, so this
module `exposes` it. In
[dmi-downstream](srn://kubeedge/protocol/dmi-downstream) the roles invert — the
node tells a mapper to add, update or remove a device or a device model, and asks
it for one — so this module `uses` it. One interface, one socket, one pair of
components, and a contract panel that shows it twice with the columns swapped.

Both run over a **local socket** rather than a network address: a Unix socket on
Linux, and, since the release train this survey covers, a named pipe on Windows,
because Unix sockets are not available there
(<https://github.com/kubeedge/kubeedge/blob/v1.23.1/CHANGELOG/CHANGELOG-1.23.md>).
The client dials without transport security, which is defensible for a socket on
the same filesystem and would not be for anything else.

That combination — local IPC, no host, an endpoint that is a filesystem path
whose form differs by operating system — is the second independent sighting in
this repository of a contract that has no field for any of it. The transport enum
is a list of *networks*, and local inter-process communication is not one of
them.

## What it holds

Per device: the desired values the cloud declared, the reported values the driver
last produced, and a cache of which mapper is responsible for which protocol so
the downward calls know where to go. State changes are also published onto the
node's MQTT bridge, which is why
[eventbus](srn://kubeedge/product/core/component/edgecore/component/eventbus) is
in the `depends-on` set.

## What the node does not decide

Whether a reading is anomalous, and what to do about it. The release train this
survey covers moved anomaly detection into the mapper's own data pipeline rather
than the node's, so this module holds values and does not judge them.
