---
name: every-request-is-traced
kind: requirement
version: 1
title: Every request is traced, and no trace carries a credential
summary: A reader's request produces one trace spanning auth, lease, fetch and catalog load — enough to answer "why was that slow" without attaching to a process, and never enough to leak a token.
status: review
owner: sergio
requirement-type: non-functional
priority: should
relations:
  uses:
    - /environment/production
tags:
  - hub
  - observability
---

This is the first thing in the repository that runs where nobody can attach a
debugger. Everything measured in this catalog so far was measured by a person
running a command on their own machine; that stops working the moment the
process is in Helsinki and the complaint is "it was slow twenty minutes ago".

The requirement has two halves and the second is the one with teeth. Tracing a
product that holds installation tokens means the trace store becomes a place a
credential can end up, and a trace store is long-lived, widely readable, and
exactly where nobody looks for one.

## Acceptance criteria

- **AC-1** A request produces one trace, with the edge span as root, covering
  authorisation, lease acquisition, any git fetch it forced, and the catalog
  load.
- **AC-2** The trace distinguishes a request that paid for a `git fetch` from
  one that did not, and a request that paid for a catalog rebuild from one
  served off the fingerprint cache. These are the two questions a slow page
  actually raises, and neither is answerable from a duration alone.
- **AC-3** Repository and branch are span **attributes**, never span names. A
  span name carrying a branch has unbounded cardinality and degrades the trace
  store into a per-branch index.
- **AC-4** No span, attribute, event or log line contains an installation token,
  the App private key, an `Authorization` header, or a URL a credential was
  interpolated into. The redaction list is one list, in
  [telemetry](srn://metaframework/product/hub/component/telemetry).
- **AC-5** Telemetry export never blocks or fails a request. The exporter drops
  on failure, which is what makes
  [signoz](srn://metaframework/product/hub/component/signoz)'s
  `criticality: 4` true rather than aspirational — an exporter configured to
  block silently inverts it.
- **AC-6** Traces are retained under an explicit limit declared in
  [production](srn://metaframework/environment/production)'s `topology.yaml`,
  not left to a chart default. The stack shares a machine with the workload it
  watches, so unbounded retention is an availability risk rather than a cost.

## Where the trace stops, stated once

At the portal. Rendering appears as one span with a duration and no inside,
because instrumenting 23,277 lines of someone else's product is a change to a
product this work does not touch. AC-2 is written the way it is precisely
because of this: the loader's own numbers — ~18ms to fingerprint against ~2.2s
to rebuild, per `framework/portal/src/lib/catalog/fingerprint.ts` — are visible
from outside as *which path was taken*, and that is the most useful thing
obtainable without going in.

## Rationale for `should`

The product is correct with no telemetry at all. What it loses is the ability to
answer questions about itself, which is a real loss and not a correctness one —
so `should`, and AC-4 is the clause that would justify `must` if it stood alone.
Splitting the redaction obligation into its own `must` requirement was
considered and rejected: it only bites when tracing exists, and a requirement
that is vacuous unless another is met is better read as one requirement with a
hard clause.

## What is unverified

All of it. Nothing is instrumented and no trace has been emitted.

AC-4 deserves naming as the weakest: it is a rule held by a written list, with
no test, in a repository whose own colour ADR already records that "nothing
enforces any of it". For a rule whose failure mode is a live credential sitting
in a searchable store, discipline is not an adequate mechanism, and the first
test this product gets should be the one that asserts a span carrying a fake
token comes out redacted.
