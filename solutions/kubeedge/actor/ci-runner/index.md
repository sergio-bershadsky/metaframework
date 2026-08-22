---
name: ci-runner
kind: actor
version: 2
title: CI runner
summary: The GitHub Actions runtime that lints, builds and end-to-end tests the main repository against several Kubernetes versions and both cloud-edge wires.
status: review
owner: sergio-bershadsky
actor-type: system
goals:
  - Reject a change that fails vendor verification, licence checks or lint.
  - Prove that an enrolled edge node works over either supported wire, against every supported Kubernetes version.
  - Publish the release artifacts an operator installs from.
relations:
  uses:
    - /product/core/component/keadm
    - /product/core/component/cloudcore
    - /product/core/component/edgecore
tags:
  - ci
---

Modelled as an actor rather than an environment, because a pipeline is not a
deployment target of this solution's components — the framework routes it here by
rule, and the rule is right in this case for a reason worth stating: what CI
brings up is a throwaway cluster in a container, and calling that an environment
would give it a topology and a config surface that describe nobody's deployment.

## What the workflow actually gates

The main workflow at the surveyed tag runs verification and lint, builds every
binary, runs the unit and edge integration suites, and then runs an end-to-end
job whose matrix is the interesting part: it crosses the two cloud-edge wire
technologies — WebSocket and QUIC — against three Kubernetes minor versions
(<https://github.com/kubeedge/kubeedge/blob/v1.23.1/.github/workflows/main.yaml>).

That matrix is evidence for something this catalog says elsewhere and would
otherwise be asserting: the QUIC wire is not a dead option kept for a slide. It
is disabled by default and it is tested on every change, which is a different
statement from either "supported" or "abandoned", and it is the reason
[cloudhub](srn://kubeedge/product/core/component/cloudcore/component/cloudhub)
describes both wires as live.

A second job re-runs the end-to-end suite against the installer's deprecated
command surface, which is how the project keeps a removed-in-name-only interface
honest.

## What it does not do

It does not deploy. There is no target for it to deploy to: the three
environments in this catalog are shapes the software takes on somebody else's
hardware, and nobody's hardware belongs to this project. The runner's credential
inventory is therefore whatever GitHub issues it per job, which is not this
catalog's to revoke or rotate. That is also why the type here is `system` and not
`service-account`: a service account is an identity something assumes and someone
can revoke, and this is the runtime, holding a token nobody in this description
controls.

## Why the three `uses` edges

They name the three artifacts the release publishes and the end-to-end job
actually exercises: the installer, and the two runtimes it installs. Every other
package in the repository reaches this actor only through the repository-wide
build and vendor sweep, which is a weaker relationship than an edge should claim.

## No protocol names this actor

`W_ACTOR_ORPHAN` is raised against this page and is right. The three edges above
are reach — which binaries the release publishes and the end-to-end job
exercises — and the framework is explicit that an actor's own `uses` edge states
reach rather than a modelled conversation. This solution is a survey and has no
journeys, so the other half of the rule cannot fire either.

There is nothing in the surveyed source for this actor to participate in. The
protocols this catalog describes are the ones the running system speaks —
enrolment, the cloud-edge channel, the container and device interfaces — and a
build pipeline speaks none of them. Manufacturing a protocol to clear the warning
would put a conversation in the catalog that the source does not contain.
