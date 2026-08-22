---
name: single-machine
kind: environment
version: 1
title: Single machine
summary: Both halves on one host — the all-in-one and in-Kind installs the project ships for trying it, developing against it, and running its end-to-end suite.
status: review
owner: sergio-bershadsky
environment-type: local
tags:
  - local
  - all-in-one
---

One box running the cloud half and the edge half at once, with everything bound
to loopback. It is what the project's own quick-start produces, what its
in-Kind tooling produces, and what a contributor has in front of them while
changing either runtime.

## Why `local` and not `dev`

`local` means a single developer's machine: no shared state, no objective, no
data of record, and anybody may break it at any moment. That is exactly this.

`dev` would mean something else — shared and integrated, disposable, synthetic
data only, a place where a `draft` component is allowed to be — and **no honest
instance of it exists in this catalog**, which is a finding rather than a gap.

The reason is structural, not particular to KubeEdge. `dev` is a property of an
*organisation running* software: somebody funds a shared cluster, points several
teams at it, and agrees that the data in it is fake. An open-source project
publishes software, not the organisations that run it, so nothing it releases can
be a `dev` target. Everything KubeEdge publishes on this axis is either a
single-host install, which is this entity, or continuous integration — and the
specification routes CI away from environments deliberately, on the grounds that
a pipeline is not a deployment target and its runner should be modelled as an
actor. It is, as [ci-runner](srn://kubeedge/actor/ci-runner).

That closes the question for open-source surveys generally: a fourth such survey
will not produce a `dev` either. If the value is ever to gain evidence in this
repository it will have to come from a private catalog describing an
organisation's own estate, and saying so is more useful than leaving `dev` on a
coverage report as an unexplained zero.

## Guarantees, at their real strength

- **Nothing is of record.** Everything here is disposable by design; the
  installer's own reset path exists to throw it away.
- **Loopback everywhere.** The cloud-edge channel, the node-local API surface,
  the MQTT broker and the device-management socket all default to addresses on
  the host itself, so nothing about this target exercises the network conditions
  the edge fleet is built for.
- **The two halves are co-resident, which the software mildly objects to.** The
  edge runtime refuses to start while a kubelet is running on the same host, and
  an all-in-one box has one. The sibling `config.yaml` carries the one switch
  that turns that refusal off, and it is the only configuration key in this
  catalog that a person actually types.

## The console is placed here, and only here

The one component set in this catalog whose placement is decided by an absence.
[dashboard-ui](srn://kubeedge/product/console/component/dashboard-ui) and
[dashboard-bff](srn://kubeedge/product/console/component/dashboard-bff) declare
this target and no other, because at the surveyed tag the Dashboard repository
ships no chart, no deployment manifest and no release artifact, its backend binds
loopback by default, and the documented way to start either half is from source.
A console for a real cluster would obviously live next to that cluster; nothing
published says it does, so nothing here claims it.

That is the difference between a `local` target and a `dev` one seen from a third
angle. `local` is a place a description can be certain about, because the
evidence for it is a set of instructions rather than a deployment somebody else
operates.

## What this environment is good evidence for

Two things, both of which the other environments cannot show.

It is the only target where the same component appears on both sides of a
conversation it normally has across a network — which is why the project's own
end-to-end suite runs here and why both cloud-edge wire technologies are tested
here rather than against a real fleet.

And it is the target that makes the version pin meaningful: the cloud and edge
halves on one host are always the same build, whereas a real fleet is the case
where they are not, and neither this catalog nor the project publishes a
skew-tolerance statement.
