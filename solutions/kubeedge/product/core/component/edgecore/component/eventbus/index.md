---
name: eventbus
kind: component
version: 1
title: Event bus
summary: The node's MQTT bridge — an MQTT client against a broker, and, in one of its modes, an MQTT broker embedded in the edge runtime itself.
status: review
owner: sergio-bershadsky
component-type: gateway
lifecycle: released
criticality: 2
relations:
  depends-on:
    - /product/core/component/mosquitto
tags:
  - mqtt
  - devices
x-deployment-unit: edgecore
---

What it fronts is named in its `depends-on`: the MQTT broker on the node. Devices
and device-adjacent software at the edge speak MQTT, the rest of the runtime
speaks the in-process message bus, and this module is the translation between
them.

## Three modes, one of which is unusual

It runs against an external broker, against a broker it starts **inside the edge
runtime process**, or both at once
(<https://github.com/kubeedge/api/blob/v1.23.0/apis/componentconfig/edgecore/v1alpha2/default.go>).
The default is external, pointed at a loopback address, which is what the cloud
chart's broker DaemonSet provides.

The embedded mode is worth stating plainly because it changes what this component
*is*: in that mode the edge runtime is not a client of a broker, it **is** the
broker, and the `depends-on` edge above stops being true of that deployment. The
catalog has no way to make an edge conditional on a configuration value, so the
edge states the default and this paragraph states the exception.

## The transport the framework cannot name

MQTT is the wire here, and it is also the wire behind the device resource's
push-to-MQTT option and behind one of the message-routing endpoint kinds. It is,
by a wide margin, the most common protocol in this entire system's problem
domain.

The transport enum has no value for it. The document-standard dialect the
framework adopted for asynchronous transports admits a short list of protocol
names, and MQTT — which that standard itself defines a full binding for — is not
among them. So the most common wire in edge computing is describable in this
catalog only as prose. That is the sharpest single finding of the survey behind
this solution, it is directly actionable, and it is recorded here because this is
the component it is about.

## Quality of service, and what is not promised

The defaults are the weakest MQTT offers: fire and forget, no retained messages,
a bounded in-process queue for sessions. Nothing in the project promises delivery
on this path, and this description does not invent a promise. A device reading
lost between the driver and the runtime is lost.
