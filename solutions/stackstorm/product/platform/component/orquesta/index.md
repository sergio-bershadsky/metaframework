---
name: orquesta
kind: component
version: 1
title: Orquesta
summary: The graph-based workflow engine — a separate Apache-2.0 repository on its own release train, imported by the workflow process.
status: review
owner: sergio-bershadsky
component-type: library
lifecycle: released
criticality: 2
tags:
  - workflow
  - engine
x-runtime: python
x-repository: StackStorm/orquesta
---

The workflow semantics: the definition language, the graph it compiles to, task
ordering, transition conditions, and how data moves between tasks. It is a
library with no runtime of its own, imported by
[st2workflowengine](srn://stackstorm/product/platform/component/st2workflowengine),
which supplies everything about the outside world — the bus, the store, the fact
that a task is an execution.

## Why it is a component here and not just a dependency

Because it is the project's own, on its own release train. It sits in a separate
repository under the same organisation, carries the same licence, and moves at a
different cadence from the platform that imports it. That combination — ours,
separately released — is exactly what makes it worth a component page: a
`depends-on` edge to it says something a requirements file cannot, namely that
the workflow semantics of this platform are versioned independently of the
platform.

A third-party library the project merely consumes would not get a page. The test
this catalog applies is whether the project releases it, not whether it imports
it.

## The seam, and what is on each side

On the library's side: what a workflow *means*. On the process's side:
everything that makes a workflow *happen*. The seam is narrow and the split is
clean, which is why the strain about state machines lives on the process page
rather than here — the library knows the graph, and the states an execution
moves through belong to the platform's own model.

## No environment

A library declares none. Where the workflow semantics run is wherever
[st2workflowengine](srn://stackstorm/product/platform/component/st2workflowengine)
runs, which that component declares for itself.
