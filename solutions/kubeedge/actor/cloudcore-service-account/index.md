---
name: cloudcore-service-account
kind: actor
version: 2
title: CloudCore service account
summary: The cluster identity the cloud runtime assumes to watch, write and impersonate against the Kubernetes API server.
status: review
owner: sergio-bershadsky
actor-type: service-account
goals:
  - Watch and update the custom resources the cloud runtime owns, on behalf of the cloud runtime.
  - Act for an edge client's own identity when an edge request must be authorised as that client.
  - Approve the certificate requests that enrolling edge nodes submit, on behalf of the cloud runtime.
relations:
  uses:
    - /environment/cloud
tags:
  - rbac
  - credential
---

The identity, not the runtime. [cloudcore](srn://kubeedge/product/core/component/cloudcore)
is the process; this is the `cloudcore` ServiceAccount its chart creates, bound
to an aggregated cluster role, and the two are separate because they are revoked,
rotated and audited separately. Anyone auditing what the cloud half of KubeEdge
can do in a cluster is asking about this entity and not about that one.

## What makes it worth its own page

Two things this identity does are unusual enough that a reader should not have to
infer them from a chart.

**It aggregates.** The cluster role the chart binds is an aggregation target: it
carries no rules of its own and collects whatever other roles are labelled to
aggregate into it. That means the permission surface is not fully readable from
the chart — an administrator, or another chart, can widen it later without
touching anything in this repository.

**It can impersonate.** When the cloud runtime is configured to authorise edge
requests, it forwards them to the Kubernetes API server as the requesting edge
client rather than as itself. That is the correct design — it puts the edge
client's own RBAC in charge of the answer — and it also means this identity holds
a privilege that is only safe while the runtime's own authorisation of the edge
client is sound.

## Why a separate actor and not a field on the component

Because the questions differ. "What does the cloud runtime do?" is answered on
the component page; "what can this credential do if it leaks?" is answered here,
and it is the question a security review actually asks. Listing every
`actor-type: service-account` entity in a solution is the credential inventory,
and an inventory whose entries are attributes of other entities is not one.

## Boundaries

This actor holds no goals of its own — it borrows them from the runtime that
assumes it, which is what distinguishes a service account from a `system` actor
in this framework. The edge side has no counterpart entity here: an edge node
authenticates with a certificate minted during enrolment, which is a per-node
credential rather than a shared identity, and it is described on
[cloudhub](srn://kubeedge/product/core/component/cloudcore/component/cloudhub)
where it is issued.

That split is also why `W_ACTOR_ORPHAN` is raised here and left standing. Every
kubeedge protocol — [node-enrollment](srn://kubeedge/product/core/protocol/node-enrollment),
[cloud-edge-channel](srn://kubeedge/product/core/protocol/cloud-edge-channel), and
the container and device interfaces — names components and, where a human or a
device is genuinely on the wire, the
[cluster-operator](srn://kubeedge/actor/cluster-operator) or
[physical-device](srn://kubeedge/actor/physical-device) actors. None of them names
this entity, because the participant in every one of those conversations is the
runtime, and this is the credential the runtime assumes.

Adding the credential to a participant list would put two things on one lane that
this page exists to keep apart. What this identity can do is an RBAC fact, and an
RBAC fact is not a conversation.
