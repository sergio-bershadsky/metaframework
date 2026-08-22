---
name: kubeedge
kind: solution
version: 1
title: KubeEdge
summary: Kubernetes control extended to intermittently connected edge nodes and the physical devices behind them, described from the public sources of a CNCF graduated project.
status: review
owner: sergio-bershadsky
vision: |
  One Kubernetes control plane whose reach does not stop at the datacentre. The
  cloud half keeps the API and the controllers; the edge half keeps a local copy
  of everything it needs and goes on running when the link is gone. Between them
  sits a single multiplexed channel rather than a thousand direct API clients,
  and beneath the edge half sits a device abstraction that turns a Modbus
  register or an OPC-UA node into an ordinary custom resource. The description
  here exists to test the metaframework against a system it was not designed
  around: a codebase this catalog does not own, in a language none of the other
  catalogs use, whose two defining properties — gRPC at a seam and production
  obligations over an intermittent link — no described solution had ever
  exercised.
scope:
  in:
    - The KubeEdge cloud and edge runtimes, their installer, and the libraries they are built from.
    - EdgeMesh, the Dashboard, and the device mapper framework, each on its own release train.
    - The deployment shapes the project's own Helm chart and installer produce.
  out:
    - Sedna and Ianvs — separate AI projects with their own governance and releases.
    - Kubernetes itself, described here only as an external component at the seam.
    - Anything about how a particular operator runs KubeEdge; this describes the software, not a deployment.
contacts:
  - role: surveyor
    handle: sergio-bershadsky
  - role: upstream-project
    handle: kubeedge
    channel: https://github.com/kubeedge/kubeedge/issues
tags:
  - edge
  - kubernetes
  - cncf
  - iot
  - surveyed
---

A description of software this catalog does not own. KubeEdge is an Apache-2.0
project that graduated from the CNCF on 2024-10-15, and everything below was read
from its public repositories, its release artifacts, and its own documentation
site. Nothing here is a plan, a proposal, or a roadmap: it is one reviewer's
reading of a system that already runs.

## The release this describes

Every statement in this catalog is about **v1.23.1**, published 2026-07-15
(<https://github.com/kubeedge/kubeedge/releases/tag/v1.23.1>). The version is
pinned once, here, and no entity below restates it — a per-entity version would
be a second clock and would disagree with this one within a release. Where a
component belongs to a repository with its own release train, that train's tag is
named on the component's own page, because it genuinely differs: the main
repository, `kubeedge/edgemesh`, `kubeedge/dashboard` and `kubeedge/mappers-go`
were each at a different tag when this was written.

Three properties made this the third solution surveyed rather than a fourth
candidate. It puts **gRPC** at a real seam — the Device Management Interface
between the edge runtime and a device mapper, in both directions. It runs an
**edge** deployment in the exact sense this framework's `environment-type` enum
means: production obligations, geographic distribution, and a link that is
expected to drop. And its installer is a genuinely installable command-line
program, which is what `component-type: application` was added for and what no
catalog had yet carried.

## Four products, split on release train

The split in `product/` is not the architecture diagram the project publishes.
That diagram splits cloud from edge, which would put both halves of one release,
one repository and one maintainer group into two products — two ownership lines
for something nobody owns separately. What an open-source project actually
publishes is **release trains**, and the trains are what the products follow:

- [core](srn://kubeedge/product/core) — the cloud runtime, the edge runtime, the
  installer, and the three libraries staged inside the same repository.
- [networking](srn://kubeedge/product/networking) — EdgeMesh, on its own tags.
- [console](srn://kubeedge/product/console) — the Dashboard, still pre-1.0.
- [device-integration](srn://kubeedge/product/device-integration) — the mapper
  framework and the older mapper collection it replaced.

`lifecycle` on those four is the one field that carried the split, and the
evidence available for it is not the evidence the field's definition assumes. A
product's `lifecycle` is described in the specification as a funded position in a
portfolio, moved by whoever decides investment. An open-source project publishes
no investment ledger. What it publishes is tag cadence and last-push dates, and
those turn out to be genuinely informative: a repository superseded by a
successor stops being pushed, and a component still below 1.0 says so in its own
version. Each product page names the evidence it used.

## Where the ontology strained

This catalog was authored from a survey whose point was to find the places where
the framework does not fit, and those places are recorded on the entities that
hit them rather than collected into one complaint:

- **No environment declares `dev`.** The value means a shared, integrated,
  disposable target with synthetic data — a property of an *organisation running*
  software, not of software. Nothing in KubeEdge's public material is one, and
  inventing one would be the only fabricated entity in the catalog. Recorded on
  [single-machine](srn://kubeedge/environment/single-machine).
- **The edge fleet cannot be placed.** `environment-type: edge` fits
  [edge-fleet](srn://kubeedge/environment/edge-fleet) exactly, and the
  `topology.yaml` behind the value cannot express a set of sites that is
  unbounded and enumerated nowhere. The artifact is authored anyway, with its
  region notes saying which part of it is a placeholder.
- **A module inside a process has no `component-type`.** The two runtimes are
  each a single process hosting a set of pluggable modules that have a runtime,
  do not deploy independently, and mostly expose nothing. Both parent pages
  carry the reasoning; every module carries an `x-deployment-unit` field naming
  the process it is inside, which is the third escape hatch three catalogs have
  now invented for the same missing field.
- **Configuration is nested and versioned, and the flat contract cannot hold
  it.** The environments' `config.yaml` files are honest and nearly empty, and
  [cloud](srn://kubeedge/environment/cloud) explains why that is the finding
  rather than an omission.
- **The most common wire in device integration has no transport value.** MQTT is
  absent from the closed six-value transport enum, and the AsyncAPI dialect
  adopted as the escape hatch admits three protocol spellings, none of them MQTT
  — even though AsyncAPI itself defines an MQTT binding. Three surfaces in this
  system speak it. Recorded on
  [mosquitto](srn://kubeedge/product/core/component/mosquitto), the external
  component that sits behind the seam.
- **A `gateway` can front something the catalog is not allowed to point at.**
  The type's discipline requires a `depends-on` edge to everything a gateway
  fronts; what a
  [mapper](srn://kubeedge/product/device-integration/component/mapper) fronts is
  a physical device, which is correctly an actor, and no forward edge in this
  framework accepts an actor. The requirement is unsatisfiable at that seam and
  the page says so rather than inventing components for hardware.

## What was not copied

No text, source, proto or manifest from any KubeEdge repository appears in this
catalog. Names of services, methods, modules, fields and ports are named as
identifiers, because an identifier is what a description has to quote to be
about anything; every claim beyond an identifier is either stated in the
surveyor's own words or cited to a URL. That discipline is not stylistic: this
repository is source-available under PolyForm Noncommercial and the surveyed
project is Apache-2.0, and vendoring one into the other is a licensing decision
nobody has taken.

Nothing here crosses `srn://kubeedge`. The systems the project depends on and
does not own — the Kubernetes API server, containerd, the MQTT broker its own
chart installs — are described locally as `external` components, at the fidelity
the rest of this description needs and no further.
