---
name: devicecontroller
kind: component
version: 1
title: Device controller
summary: Watches device and device-model resources and turns them into twin updates for the node the device is attached to.
status: review
owner: sergio-bershadsky
component-type: job
lifecycle: released
criticality: 2
relations:
  depends-on:
    - /product/core/component/kubernetes-api-server
    - ../cloudhub
tags:
  - controller
  - devices
x-deployment-unit: cloudcore
---

The cloud end of the device abstraction. Everything a
[cluster-operator](srn://kubeedge/actor/cluster-operator) declares about a
physical device is an ordinary custom resource, and this module is what makes
declaring one have an effect somewhere.

**Trigger.** Watches the device, device-model and device-status resources the
cloud runtime's chart installs as custom resource definitions.

**Effect.** Sends the desired state of a device to the node named on the device
resource, and writes reported state back onto the cluster object.

## The split this release inherits

Device status is a separate resource from the device itself, split out of it in
the release train this survey covers
(<https://github.com/kubeedge/kubeedge/blob/v1.23.1/CHANGELOG/CHANGELOG-1.23.md>).
That is a change in what this module watches and writes, and it is the kind of
change worth recording on a component page rather than only in a data model: a
reader tracing why a device's reported values stopped appearing where they used
to will look here first.

## What it is not responsible for

It does not talk to devices. It does not know what a Modbus register is. The
translation from a declared property to a wire read happens at the far end of the
edge runtime, in a
[mapper](srn://kubeedge/product/device-integration/component/mapper) that this
module has never heard of. All this component does is move a declaration to the
node that can act on it — which is exactly why the device abstraction survives a
new fieldbus without a cloud-side change.
