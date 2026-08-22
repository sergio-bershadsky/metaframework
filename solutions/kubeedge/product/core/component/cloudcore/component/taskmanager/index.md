---
name: taskmanager
kind: component
version: 1
title: Task manager (cloud)
summary: Drives fleet-wide operations — node upgrades, image pre-pulls, config updates — as declared jobs with a per-node state machine.
status: review
owner: sergio-bershadsky
component-type: job
lifecycle: released
criticality: 3
relations:
  depends-on:
    - /product/core/component/kubernetes-api-server
    - ../cloudhub
tags:
  - controller
  - operations
x-deployment-unit: cloudcore
---

Day-two operations, expressed the way Kubernetes expresses everything else. An
operator declares a job resource naming what should happen and to which nodes;
this module drives it and records progress per node.

**Trigger.** Watches the operations resources the chart installs — node upgrade,
image pre-pull and config update.

**Effect.** Sends the corresponding instruction to each targeted node through
[cloudhub](srn://kubeedge/product/core/component/cloudcore/component/cloudhub),
tracks each node's reported outcome, and writes it back onto the job.

## Why it has a counterpart on the edge

There is a second module with the same name inside the edge runtime
([taskmanager](srn://kubeedge/product/core/component/edgecore/component/taskmanager)),
and they are not the same component described twice. This one decides *what*
should happen across a fleet and holds the aggregate state; that one performs the
local half — replacing a binary, pulling an image, rewriting a config file — and
reports back. Two names, two entities, one word, because the upstream project
uses the same word for both halves of a distributed operation and renaming either
here would make the catalog disagree with every log line.

## Switched off by default

The chart ships this module disabled. That is a statement about how finished the
feature is, not about how useful it is, and it is worth reading alongside the
release notes for the train this survey covers, which show the operations
resources moving to a newer API version. A component whose API is still moving is
one an operator opts into.

## Blast radius

`criticality: 3` and not 1: nothing running depends on it, and a cluster with it
switched off is a cluster where upgrades are done by hand. What it can do when it
goes wrong is bounded by the fact that every action it takes is declared first,
in an object a reviewer can read before it runs.
