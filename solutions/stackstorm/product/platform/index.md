---
name: platform
kind: product
version: 1
title: Platform
summary: The supervised server processes, the package they share, the workflow engine, the reverse proxy, and the infrastructure the reference deployment installs beside them.
status: review
owner: sergio-bershadsky
lifecycle: active
primary-actors:
  - /actor/automation-operator
  - /actor/monitoring-system
  - /actor/managed-host
  - /actor/api-key-identity
tags:
  - runtime
  - amqp
---

Everything released together from `github.com/StackStorm/st2`, plus the systems
that repository's reference deployment installs alongside it. One tag, one
maintainer group, one test suite — which, rather than any picture of tiers, is
what makes this a product.

## The shape: three processes with a door, eight without

The eleven supervised processes divide cleanly by whether anything can call
them.

Three have an inbound surface and are `service` components:
[st2api](srn://stackstorm/product/platform/component/st2api),
[st2auth](srn://stackstorm/product/platform/component/st2auth) and
[st2stream](srn://stackstorm/product/platform/component/st2stream). Eight have
no listener at all — they wake up because a message arrived on a queue or
because a clock fired, they do something, and they write the result back onto
the bus. The component kind's test for `job` is exact about this: no inbound
surface is the definition. So eight of them are jobs.

That distribution is worth naming because no catalog in this repository has had
one like it. Every other described system is mostly services with a worker or
two at the edge; this one is mostly workers with three doors. It is not a
modelling preference — the discipline decides it, and the discipline decides it
the same way eight times.

## The rule that distribution breaks: a `job` that publishes

The `job` discipline says a job **MUST NOT expose a protocol**, and gives the
reason in the same sentence: *no inbound surface is the definition*. On a
request-response protocol those two statements are the same statement, because
exposing means having a door.

On a bus they come apart, and this product is where that happens. Four of the
processes with no door — the sensor container, the timers engine, the notifier
and the action runner — **publish** onto the platform's exchanges. Publishing is
outbound, so it is not an inbound surface; it is also unambiguously the
*provider* half of the conversation, which is what `exposes` means and what the
existing catalogs already author for bus publishers.

The catalog resolves it by authoring `exposes` on those jobs and saying so here,
rather than by leaving the protocol graph one-sided. Both alternatives are
worse: `uses` would state the consumer side and be false, and silence would
leave the framework's own authoritative side of the protocol graph — the
component's `exposes`/`uses` edges — missing the direction for half the
publishers in the system.

So the discipline's prohibition is read as scoped to what it is about: a job has
no inbound surface, and it may still provide one. The rule as written is a
request-response rule, and a bus-shaped product is where it stops being true.

## Why the infrastructure is `external` and not `datastore`

MongoDB, RabbitMQ and Redis are installed by the project's own reference
deployment. The solution owns the *deployment* and does not own the *software*,
and the two candidate types split on ownership of the software rather than on
who ran the installer. All three are therefore `external`, and each says on its
own page what the seam is.

The RabbitMQ case is the one that settles it beyond preference.
[rabbitmq](srn://stackstorm/product/platform/component/rabbitmq) holds no state
of record — it is the bus — so `datastore`, which means a holder of persistent
state, would be actively false rather than merely imprecise. Once RabbitMQ is
`external`, typing its two neighbours differently would be splitting one
deployment decision across two vocabularies.

The consequence for the framework is worth recording: `datastore` survives in
this repository only in the invented fixture. Two independently surveyed
real systems have now typed their bundled third-party stores `external`, because
in both cases the store is somebody else's software that the solution merely
installs.

## `criticality` on these pages, and what it means

Every runtime component here carries a `criticality`, and it is read exactly as
the component kind defines it — blast radius and review priority, never an SLA.
The scale used across this product: **1** where the platform stops working,
**2** where a whole class of automation stops, **3** where one feature stops,
**4** where nothing stops immediately. No availability objective is stated
anywhere in this catalog, because the project publishes none.

## What is also here and is not a process

- [st2common](srn://stackstorm/product/platform/component/st2common) — the
  package every process imports, and the only place the bus topology is written
  down.
- [orquesta](srn://stackstorm/product/platform/component/orquesta) — the
  workflow engine, a separate repository on its own release train.
- [nginx](srn://stackstorm/product/platform/component/nginx) — the edge of the
  reference deployment.
- [stackstorm-k8s](srn://stackstorm/product/platform/component/stackstorm-k8s) —
  the Helm chart, which is here because its subject is this product's process
  set and because inventing a fourth product for one artifact would be worse
  than the strain of filing it under the thing it deploys. Its page argues why
  no `component-type` fits it.
