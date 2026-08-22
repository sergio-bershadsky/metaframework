---
name: cluster-operator
kind: actor
version: 1
title: Cluster operator
summary: The person who installs the cloud half, enrols edge nodes, and declares devices as custom resources.
status: review
owner: sergio-bershadsky
actor-type: human
goals:
  - Stand up the cloud half of the control plane without hand-writing Kubernetes manifests.
  - Enrol a machine at a site as an edge node and see it go Ready.
  - Declare a physical device as a custom resource and have the edge start talking to it.
  - Inspect and restart a workload on a disconnected node without a route to the cloud.
relations:
  uses:
    - /product/core/component/keadm
    - /product/console/component/dashboard-ui
tags:
  - operator
  - install
---

The protagonist of the installation and enrolment paths, and the only actor in
this catalog who touches every product. The role is defined by what the project's
own installer assumes about its user: someone with a shell on both the cloud
machine and the edge machine, `kubectl` against the cluster, and the authority to
install a system service on a host.

## Why this is one role and not three

The project's documentation separates "install the cloud side", "join an edge
node" and "onboard a device" into different pages, and it would be easy to read
those as three roles. They are not: all three are performed with the same
command-line program, against the same cluster, by whoever holds the token that
`keadm gettoken` prints. Splitting them would create actors distinguished only by
which subcommand they had reached, and the goals above would be identical modulo
tense.

The role that genuinely is separate is
[mapper-developer](srn://kubeedge/actor/mapper-developer), because that person
writes and builds a program rather than running one, and never needs cluster
credentials at all.

## What this actor cannot do

Nothing here implies an SLO or an on-call rotation. KubeEdge publishes an
installer and a control plane; who operates a cluster built from it, under what
obligations, is a fact about a deployment and not about the software, and this
catalog describes the software. The operator's fourth goal — inspecting a
workload while the node is offline — is the one that distinguishes this system
from stock Kubernetes, and it is served by the edge-local API surface rather than
by any cloud path.

## Boundaries

The operator is never a component: this catalog describes the surfaces they
reach, never their behaviour. The `uses` edges above name only the two surfaces
built for a human — the installer and the web console. Everything else the
operator does goes through `kubectl` against the Kubernetes API server, which is
an [external](srn://kubeedge/product/core/component/kubernetes-api-server)
component here, and through the custom resources the cloud runtime installs.
