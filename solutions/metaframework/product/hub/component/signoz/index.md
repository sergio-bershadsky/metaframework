---
name: signoz
kind: component
version: 1
title: SigNoz
summary: The observability stack — collector, ClickHouse and query UI — run on the same machine as the workload it watches, and owned by nobody here.
status: review
owner: sergio
component-type: external
lifecycle: released
criticality: 4
relations:
  uses:
    - /environment/production
    - /environment/compose
tags:
  - external
  - observability
---

`component-type: external`: SigNoz is operated here but not written here, and
the enum's `external` value is for exactly that — a system this solution does
not own, described locally so edges can point at it. Running someone else's
software does not make it ours.

It declares environments because unlike
[github](srn://metaframework/product/hub/component/github) it genuinely runs in
them: containers in the compose file and pods in the chart, on the same machine
as everything else. That placement is the decision recorded in
[0004-signoz-runs-beside-the-workload](srn://metaframework/product/hub/adr/0004-signoz-runs-beside-the-workload).

`criticality: 4` — the lowest assessed tier. If this is down, the product still
serves catalogs and nobody reading one notices. It is graded here rather than
left unassessed because the grading is the point: an observability stack that
takes the workload down with it has been mis-built, and a tier stated in
advance is what makes that reviewable.

## What it is, concretely

Three things in a trench coat, and they are worth naming separately because they
fail separately:

- an **OTLP collector**, which is the only part
  [telemetry](srn://metaframework/product/hub/component/telemetry) talks to;
- **ClickHouse**, which is where the traces and logs actually live and which is
  by far the largest consumer of disk and memory on the box;
- a **query UI**, which is what an [operator](srn://metaframework/actor/operator)
  opens.

## The part that is easy to get wrong

ClickHouse will happily use every gigabyte the machine has. On a single Hetzner
instance shared with the workload it is watching, an unbounded retention window
is not a cost problem, it is an availability problem: the thing that watches the
product evicts the product. Retention and resource limits are therefore not
tuning, they are the difference between this being `criticality: 4` and it being
the reason for an outage — and they belong in
[production](srn://metaframework/environment/production)'s `topology.yaml`
rather than being left to the chart's defaults.

Nobody has sized any of it. There is no measured trace volume, because there is
no traffic, because nothing is built.

## Not a dependency of the product

Nothing in [hub](srn://metaframework/product/hub) may fail because SigNoz is
unavailable. The instrumentation exports over a channel that drops on failure
rather than blocking, which is the default for the OTLP exporters and is being
stated here because it is the property that makes `criticality: 4` true rather
than aspirational. An exporter configured to block would silently invert the
tier.

## Alternatives, and why they are not on this page

The choice between self-hosting this and sending telemetry to a vendor is a
decision, so it lives in
[0004](srn://metaframework/product/hub/adr/0004-signoz-runs-beside-the-workload)
rather than here. This page describes what was chosen.
