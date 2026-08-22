---
name: stackstorm-k8s
kind: component
version: 1
title: stackstorm-k8s
summary: The project's Helm chart for a clustered deployment — versioned packaging read by a machine, and the component the type set has no value for at all.
status: review
owner: sergio-bershadsky
component-type: content
lifecycle: released
criticality: 3
relations:
  depends-on:
    - /product/platform
    - /product/operator-surfaces
tags:
  - deployment
  - helm
  - packaging
x-repository: StackStorm/stackstorm-k8s
x-type-strain: no component-type fits deployment packaging
---

The project's own answer to "how do I run this on Kubernetes without designing
it myself". The chart declares a workload per st2 process, wires them to
MongoDB, RabbitMQ and a coordination backend, exposes the HTTP surfaces through
an ingress, and carries defaults for how many of each process to run. Those
defaults are the source of everything
[ha-cluster](srn://stackstorm/environment/ha-cluster) records.

It is on its own release train, in its own repository, moving at its own — much
slower — cadence than the platform it deploys. That is the fact that makes it a
component here rather than a footnote.

## Why it is filed under this product

The chart deploys both products. Filing it here is a choice: its subject is
overwhelmingly this product's process set, and inventing a fourth product for a
single artifact would put an ownership line around something no one owns
separately. The `depends-on` edges name both products so the graph tells the
truth even though the placement cannot.

## No `component-type` fits, and this one is not close

The type set is closed at ten values and every one of them is wrong here, in a
different way:

- **`content`** — carried above, as the nearest — means versioned content
  consumed **by being read, by a person or a model**. A chart is read by Helm.
  The reading half is right; the reader is a program, which the definition
  explicitly is not about.
- **`application`** means a packaged program a user installs and runs as one
  unit. The chart *is* installed by a user from a chart repository, so the
  channel half fits — and the thing installed is not a program, it is a
  description of other programs.
- **`specification`** means normative documents whose contract surface is the
  text itself, consumed by reference and never executed. A chart's text is
  templated and executed against a cluster, which is the one thing that
  definition rules out.
- Every remaining value assumes a runtime, a store, or a system somebody else
  owns.

The missing concept is **deployment packaging**: a versioned artifact whose
subject is other components' placement, consumed by a deployment tool. It is not
a small gap — every project of any size ships one — and it is the reason
`x-type-strain` above exists, where no check will ever see it.

This is directly relevant to the framework's deferred topology work, whose own
reopening trigger is a component that actually generates deployment manifests.
Here the component exists, it is somebody else's, and the catalog cannot name
what it is.

## Fidelity, which the `content` discipline requires and this cannot give

The `content` type requires a statement of what keeps the content true of the
system it describes. The honest answer: **nothing does.** The chart is a
separate repository on a separate cadence from the platform, so its workload set
and its defaults can lag the release train they deploy. Its documents are also
not listed as artifacts on disk here, because they are somebody else's files and
this catalog cites them rather than vendoring them — which is a second place the
`content` discipline assumes content that lives in the same repository as the
entity describing it.

## No environment

Content declares none, and the rule is right for once: the chart does not run
anywhere. What runs is what it installs, and those components declare their own.
