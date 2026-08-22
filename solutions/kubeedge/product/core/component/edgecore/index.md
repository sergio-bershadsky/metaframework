---
name: edgecore
kind: component
version: 1
title: EdgeCore
summary: The node-side process — a kubelet, a local object store, a device twin and a message bus in one binary, installed as a host service.
status: review
owner: sergio-bershadsky
component-type: service
lifecycle: released
criticality: 1
relations:
  uses:
    - /environment/edge-fleet
    - /environment/single-machine
  depends-on:
    - /product/core/component/beehive
    - /product/core/component/api
    - /product/core/component/viaduct
    - /product/core/component/containerd
tags:
  - runtime
  - edge
x-runtime: go
---

One process per enrolled machine, installed as a system service by the installer
rather than scheduled by anything, and the component the whole `edge`
environment-type exists to describe. Everything a site does when the cloud is
unreachable, it does inside this binary.

## What is inside it

The same in-process module arrangement as
[cloudcore](srn://kubeedge/product/core/component/cloudcore), and the same
modelling strain, argued there and not repeated here: each module has a runtime,
none deploys independently, most expose nothing, and every one of them carries
`x-deployment-unit: edgecore` because the component kind has no field for the
unit of deployment a component is inside. None declares an environment, so each
raises `W_COMP_NO_ENVIRONMENT` — deliberately, because this component's two
environment edges are the true statement and copying them onto every module would
claim that a module is deployed somewhere.

Read the modules in three groups:

- **The link.**
  [edgehub](srn://kubeedge/product/core/component/edgecore/component/edgehub) is
  the client end of the cloud-edge channel and the only module that talks to the
  cloud at all.
- **The node.**
  [edged](srn://kubeedge/product/core/component/edgecore/component/edged) runs
  containers,
  [metamanager](srn://kubeedge/product/core/component/edgecore/component/metamanager)
  owns the local store that makes autonomy possible, and
  [taskmanager](srn://kubeedge/product/core/component/edgecore/component/taskmanager)
  performs upgrades and image pre-pulls on this host.
- **The edges of the edge.**
  [devicetwin](srn://kubeedge/product/core/component/edgecore/component/devicetwin)
  holds device state and hosts both halves of the device-management interface;
  [eventbus](srn://kubeedge/product/core/component/edgecore/component/eventbus)
  bridges MQTT;
  [servicebus](srn://kubeedge/product/core/component/edgecore/component/servicebus)
  bridges local HTTP; and
  [edgestream](srn://kubeedge/product/core/component/edgecore/component/edgestream)
  dials the tunnel that carries interactive kubectl traffic.

A further module exists in the binary purely for database testing and is not
described here: giving a test fixture a component page would put something in the
graph that no deployment has.

## Why it is a kubelet and not a kubelet

It performs the kubelet's job — talk to a container runtime over the container
runtime interface, keep the declared pods running, report status — while getting
its instructions from a channel instead of from an API server, and while keeping
a durable local copy of everything it has been told. Stock kubelet has neither
property, and the refusal that follows is characteristic: the process will not
start while a kubelet is running on the same host, which is why
[single-machine](srn://kubeedge/environment/single-machine) needs the one
configuration switch in this catalog that a human types.

## Where the store is, and why there is no datastore component

The local object store is a file on the node, opened by this process through an
object-relational mapper that replaced an older one in the release train this
survey covers. It is genuinely a database and it is genuinely persistent, and it
is **not** modelled as a `component-type: datastore`, because that type means a
holder of persistent state *addressed as infrastructure* — something deployed,
reachable, and shared. This one is a file inside a process that nobody addresses.
Modelling it as a datastore would create a component nobody deploys; not
modelling it at all would lose the fact the entire autonomy story rests on. It is
therefore described in prose, on
[metamanager](srn://kubeedge/product/core/component/edgecore/component/metamanager),
which owns it.

## What it depends on that it does not contain

The container runtime, which it reaches over a local socket whose path form
differs by operating system, and the three libraries the main repository stages.
The container runtime is an
[external](srn://kubeedge/product/core/component/containerd) component here for
the mechanical reason that a `depends-on` edge cannot name an actor.
