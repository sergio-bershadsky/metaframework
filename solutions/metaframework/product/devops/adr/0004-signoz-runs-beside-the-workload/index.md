---
name: 0004-signoz-runs-beside-the-workload
kind: adr
version: 1
title: SigNoz runs beside the workload, not as a service somebody else operates
summary: Telemetry is exported to a self-hosted SigNoz on the same machine — OpenTelemetry at the boundary keeps that reversible, and it is reversible precisely because the instrumentation names no vendor.
status: review
owner: sergio
decision-status: proposed
date: "2026-08-20"
relations:
  uses:
    - /product/devops/component/signoz
    - /product/devops/component/telemetry
tags:
  - devops
  - observability
---

## Context

This is the first thing in this repository that runs anywhere but a developer's
machine, and it is the first thing whose failures nobody will be watching when
they happen. The catalog's own honesty about that is blunt: every measured
number in it "was measured here, by a person running a command"
([local](srn://metaframework/environment/local)). A hosted product cannot be
debugged that way.

The stated requirement is logs and traces, for debugging and for performance
review. The question is where they land.

## Decision

Self-hosted SigNoz, in the same compose project and the same cluster as the
workload it observes. The instrumentation
([telemetry](srn://metaframework/product/devops/component/telemetry)) speaks
OpenTelemetry and OTLP, and names SigNoz nowhere except in configuration.

## Consequences

- **The decision is cheap to reverse and that is most of its justification.**
  OTLP is the boundary; moving to a vendor, or to a plain collector plus
  something else, is an endpoint change rather than a reinstrumentation. The
  coupling recorded on
  [signoz](srn://metaframework/product/devops/component/signoz) is real at the
  deployment and shallow in the code.
- **Nothing leaves the machine.** A catalog carries repository names, branch
  names and file paths, which describe somebody's private system; keeping
  traces local means no third party holds a map of what the reviewers were
  reading. For a product whose whole purpose is reading private descriptions,
  that is worth more than the convenience given up.
- **The observability stack competes with the workload for one box.** This is
  the cost, and it is not small: ClickHouse is by a wide margin the largest
  memory and disk consumer in the deployment, and the machine it is on is the
  machine serving catalogs. Retention limits move from tuning to a correctness
  property, and
  [production](srn://metaframework/environment/production) carries them in
  `topology.yaml` rather than leaving them to the chart's defaults.
- **Nobody is paged.** There is no alerting, no on-call and no SLO — consistent
  with every environment this solution declares. SigNoz here is a thing an
  [operator](srn://metaframework/actor/operator) opens *after* someone says the
  devops is slow. Calling that monitoring would be a claim this catalog cannot
  support.
- **Operating it is now a job.** Upgrades, schema migrations, and a disk that
  fills are ours. Against a product with one machine and no on-call, the
  realistic failure is that it is installed once and never touched, and it
  degrades into a dashboard nobody trusts.

## Alternatives considered

- **A hosted vendor** (Grafana Cloud, Honeycomb, Datadog, or SigNoz's own
  cloud). Strictly better operationally — no ClickHouse to run, no disk to
  watch, no upgrades — and rejected on data locality plus the fact that this
  product has no budget line. It remains the obvious answer if operating the
  stack becomes the tax it usually becomes, and the OTLP boundary is what keeps
  that door open.
- **Logs only, no traces.** Much cheaper: a file, or the orchestrator's log
  stream, and no stack at all. Rejected because the questions this product will
  actually raise are *why was that page slow* and *did that request pay for a
  fetch*, and both are spans with parents. A log line per request cannot say
  whether the 2.2s was git or the catalog rebuild.
- **Instrument nothing until something hurts.** Genuinely defensible for a
  concept-stage product, and the reason it was not chosen is that the first
  thing that hurts will be intermittent, on a machine nobody can attach a
  debugger to, and reproducing it is exactly what tracing exists to avoid.
- **Prometheus and metrics rather than traces.** Rejected for the same reason
  the metrics pipeline is deliberately absent from
  [telemetry](srn://metaframework/product/devops/component/telemetry): a counter
  tells you the rate went up and never which request was slow or why.
