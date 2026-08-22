---
name: admission-controller
kind: component
version: 1
title: Admission controller
summary: An optional admission webhook that validates KubeEdge's own custom resources before the cluster accepts them.
status: review
owner: sergio-bershadsky
component-type: service
lifecycle: released
criticality: 3
relations:
  uses:
    - /environment/cloud
  depends-on:
    - /product/core/component/kubernetes-api-server
    - /product/core/component/api
tags:
  - webhook
  - validation
---

A separate binary from the same repository, deployed as its own Deployment with
its own service, and shipped **disabled** in the chart's values.

## What it validates

The project's own resources rather than anything of Kubernetes': device and
device-model declarations, the message-routing rules and endpoints, and the node
upgrade jobs. It is a validating webhook, so its answer is yes or no at admission
time rather than a mutation.

## Why it is optional, and what that means for everything else

Because it is off by default, **every consumer of these resources has to behave
as if nothing validated them**. The controllers in the cloud runtime read
resources that may never have passed a check; a mapper receives a device
declaration that may name a property type nothing supports. That is a real
property of the system and it is easy to miss from a chart, which is why it
belongs on a component page.

It is also the reason the custom resource definitions themselves carry as much
structural validation as they do: the definition is the check that is always on,
and this webhook is the one that catches what a schema cannot express.

## `service`, for once without a strain

It is a genuinely independently deployed process with a genuinely inbound surface
— the Kubernetes API server calls it — so the type fits without argument, which
is worth noting in a catalog where the same type is a nearest fit fifteen times
over.

## Blast radius

`criticality: 3`. Off by default, and nothing running depends on it. Its failure
mode when it is on is the interesting one: a webhook that is down makes the
resources it guards unwritable, so switching it on trades a validation gap for an
availability dependency.
