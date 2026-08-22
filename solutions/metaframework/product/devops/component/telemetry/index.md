---
name: telemetry
kind: component
version: 2
title: Telemetry
summary: OpenTelemetry instrumentation compiled into every process here — traces and logs to a collector, and the one place that knows what must never be recorded.
status: review
owner: sergio
component-type: library
lifecycle: planned
criticality: 3
relations:
  depends-on:
    - ../signoz
  implements:
    - /product/devops/requirement/every-request-is-traced
tags:
  - observability
  - opentelemetry
---

Not built. `lifecycle: planned`.

`component-type: library` and therefore, by rule T1
([component.md](srn://metaframework/product/specification/component/kind-contracts)),
**no environment declaration** — it has no runtime of its own and runs inside
[repo-sync](srn://metaframework/product/devops/component/repo-sync) and
[catalog-router](srn://metaframework/product/devops/component/catalog-router),
which declare theirs. A library that named an environment would be claiming a
deployment it does not have.

## Why a component at all, rather than a line in each process

Because it holds a decision that must be made once: what a span may carry. Two
processes instrumenting themselves independently produce two answers, and the
answer that matters is negative — a repository name is fine, a branch name is
fine, an installation token is not, and neither is the `Authorization` header,
the git credential helper's stdin, or a URL that a token was ever interpolated
into. Redaction is one list in one place or it is not redaction.

The rest is ordinary: OTLP over gRPC to the collector in
[signoz](srn://metaframework/product/devops/component/signoz), traces and logs,
resource attributes naming the service and the environment entity it is running
in.

## What is worth a span

Stated so the instrumentation is not "everything, and then a sampling problem":

- The request, at the edge, with the resolved `{owner}/{repo}/{branch}` as
  attributes rather than in the span name — a span name carrying a branch has
  unbounded cardinality.
- The lease: acquired, waited-for, or refused, and whether it forced a fetch.
  This is the span that explains a slow first read, and it is the reason
  [branch-freshness-lag](srn://metaframework/metric/branch-freshness-lag) is
  answerable at all.
- The fetch, separately, because git is the slow part and its duration belongs
  to the repository rather than to the reader who happened to arrive first.
- The catalog load, which the portal already measures against itself: ~18ms to
  fingerprint against ~2.2s to rebuild, on the numbers in
  `framework/portal/src/lib/catalog/fingerprint.ts`. Whether a request paid the
  rebuild is the single most useful thing a trace here can say.

Not the render. Instrumenting the portal's components from outside would
produce a flame graph of React, which answers no question
anybody has about this product.

## The honest limits

- **The portal is not instrumented and this component does not change that.**
  Traces stop at the boundary: the router's span covers "the portal rendered
  this", as one duration, with no inside. Making that inside visible means
  changing a product that is out of scope here, and
  [0004](srn://metaframework/product/devops/adr/0004-signoz-runs-beside-the-workload)
  does not pretend otherwise.
- **There is no metrics pipeline.** Traces and logs only. Counters and gauges
  are deliberately absent until something needs one, because a metric with no
  consumer is a cost with no reader. The one measured number this product
  declares is derived from traces.
- **No sampling.** At the traffic this product expects — single-digit concurrent
  readers — head sampling would throw away the only interesting traces. If that
  assumption breaks, this paragraph is what needs revisiting first.
- **Nothing enforces the redaction list.** Like every other rule in this
  repository, it holds because it is written down, not because a test fails. For
  a list whose failure mode is a credential in a trace store, that is the
  weakest part of this page and should be the first thing given a test.
