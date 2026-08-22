---
name: keadm
kind: component
version: 1
title: keadm
summary: The installer — one command-line program that renders the cloud chart, enrols a node as a host service, upgrades either half, and inspects a disconnected node.
status: review
owner: sergio-bershadsky
component-type: application
lifecycle: released
criticality: 2
relations:
  uses:
    - /environment/cloud
    - /environment/edge-fleet
    - /environment/single-machine
    - /product/core/protocol/node-enrollment
  depends-on:
    - /product/core/component/cloudcore
    - /product/core/component/edgecore
tags:
  - installer
  - cli
---

The first `component-type: application` in any catalog in this repository, and it
holds cleanly, which is worth recording because the value was added on the
strength of a strain rather than an example.

## Package identity, version, and channel

**Identity.** A single statically-built command-line binary named `keadm`, built
from the main repository.

**Version source of truth.** The repository's own release tag. The program prints
it, the release assets carry it in their filenames, and there is no second place
it is declared.

**Channel.** Release assets published on the project's GitHub releases, as
tarballs per operating system and architecture — Linux on three architectures and
Windows on one at the surveyed tag, each with a published checksum
(<https://github.com/kubeedge/kubeedge/releases/tag/v1.23.1>). That is a real
channel in the sense the type demands: a version is installable outside the
repository, by a URL, without a build. The type's own test is that an absolute
local path is not a channel, and this passes it.

## What it does, grouped the way the program groups it

The subcommands fall into families, and the families are the honest description
of what an operator can do:

- **Cloud side** — render and apply the chart, print the bootstrap token an
  enrolling node needs, generate the manifests without applying them, and reset.
- **Edge side** — join a node, update its configuration, back up, upgrade, roll
  back, reset, and drive the same operations across a batch of nodes from one
  invocation.
- **Node inspection** — get, describe, log, exec into, edit and restart things
  **on the node**, plus confirming and releasing a held upgrade. This family is
  the interesting one: it talks to the node's own Kubernetes-shaped API surface,
  so it works on a machine with no route to the cluster.
- **Diagnostics** — check a host's readiness, collect state for a bug report,
  diagnose a node that will not come up.

## Why it is an `application` and not a `ui`

`ui` would not be wrong on its face — the type covers command-line interfaces
explicitly. `application` is chosen because what is being described here is the
**shipped distribution**: a packaged program with an install channel, a version,
and checksums, containing several distinct surfaces inside it. Typing it `ui`
would describe the interaction and lose the packaging, and the packaging is what
an operator has to reason about when they ask which version of the installer
matches which version of the runtimes.

## The environment edges, and the weaker sense they carry

It declares all three environments, and the sense is weaker than for any other
component in the catalog. A workload is *deployed* into an environment; this is
*invoked* on a host that is part of one — on the operator's machine against the
cluster, on the machine being turned into a node, on the all-in-one box. There is
no field for that difference, and the placement view will show it as a resident,
which is why the single-host topology entry gives it a replica floor of zero and
says so.

## Its dependency on both runtimes

Real, and in an unusual direction: the installer knows how to install, configure
and upgrade both halves, so a change to either runtime's configuration document
or service registration is a change this program has to follow. That is also why
the edge runtime's own upgrade module
[depends on it](srn://kubeedge/product/core/component/edgecore/component/taskmanager)
rather than the other way round — a process cannot replace itself.
