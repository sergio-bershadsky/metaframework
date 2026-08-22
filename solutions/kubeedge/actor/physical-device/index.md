---
name: physical-device
kind: actor
version: 1
title: Physical device
summary: The sensor, controller or instrument at the far end of a mapper's southbound driver — the thing the device model abstracts.
status: review
owner: sergio-bershadsky
actor-type: external-system
goals:
  - Be read on a schedule without the reader knowing which fieldbus it speaks.
  - Accept a setpoint written by a controller that has never heard of its register layout.
  - Keep working when the site it sits in loses its uplink.
tags:
  - device
  - fieldbus
---

A programmable logic controller, a temperature probe, a camera, a meter. It
speaks a fieldbus or an industrial protocol — Modbus, OPC-UA, Bluetooth Low
Energy, ONVIF, GigE Vision are the families the project's own older mapper
collection shipped drivers for — and it has no idea that Kubernetes exists.

## Why this is an actor and not an external component

It fails the mechanical half of the boundary test in the friendliest possible
way: nothing in this catalog needs to name a device in a `uses`, `exposes`,
`depends-on` or `implements` edge, because no component depends on a *particular*
device. What components depend on is the **abstraction** — the device model and
device custom resources, and the driver interface a mapper implements. A device
is the thing on the other side of that abstraction, and the abstraction exists
precisely so the number and kind of devices can change without any edge in this
catalog moving.

That is the opposite of the reasoning that made
[containerd](srn://kubeedge/product/core/component/containerd) and
[mosquitto](srn://kubeedge/product/core/component/mosquitto) `external`
components: those are named systems that specific components require by name.

## What we deliberately do not describe

Register maps, sampling limits, wire timing, power behaviour. All of it is
per-device and none of it is in any KubeEdge repository — which is the point of
the device model: the vendor-specific part lives in a mapper's driver layer,
written by a [mapper-developer](srn://kubeedge/actor/mapper-developer), and the
catalog stops at the seam.

## Where it appears

A device is never a participant in the cloud-side conversations. It appears only
at the southbound end of a
[mapper](srn://kubeedge/product/device-integration/component/mapper), which is
the component that exists to hold exactly one translation: fieldbus on one side,
a declared property on the other.
