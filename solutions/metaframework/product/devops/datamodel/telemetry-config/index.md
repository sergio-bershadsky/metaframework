---
name: telemetry-config
kind: datamodel
version: 1
title: Telemetry configuration
summary: The two OTEL keys every instrumented process here reads — a mixin, because the library that reads them is a library and cannot own a contract of its own.
status: review
owner: sergio
usage: config
abstract: true
tags:
  - observability
  - configuration
---

[telemetry](srn://metaframework/product/devops/component/telemetry) is
`component-type: library` and therefore declares no environment — rule T1, and
it is the rule that creates this file. A library has no deployment, so nothing
ever joins an environment against it; its configuration surface has to reach the
join through the processes it is compiled into, which are
[repo-sync](srn://metaframework/product/devops/component/repo-sync) and
[catalog-router](srn://metaframework/product/devops/component/catalog-router).

`abstract: true` is what lets it. A mixin has no component to be the contract
of, so any number may sit in any bucket and the one-contract-per-bucket rule
does not count them; the two concrete contracts reach it with a root `allOf`
branch, and the join reads the flattened result without knowing inheritance
happened.

## Neither key is required, and that is a statement about compose

Both are declared in [production](srn://metaframework/environment/production).
Only `OTEL_EXPORTER_OTLP_ENDPOINT` is declared in
[compose](srn://metaframework/environment/compose), where its own entry explains
why the absence is safe: *unset, the exporter drops*. That is the property
[signoz](srn://metaframework/product/devops/component/signoz)'s `criticality: 4`
rests on — nothing in this product may fail because the observability stack is
unavailable — and an exporter configured to block would silently invert the
tier.

So a required key here would print `W_ENV_CONFIG_MISSING` against `compose` for
both components, and the fix a reader would reach for is a key the compose
author deliberately left out. `required` states what a process cannot start
without; these two are what it cannot be *observed* without, which is a
different claim and belongs in prose.

`OTEL_SERVICE_NAME` is per-process, so a trace can tell the router from the
syncer. It is inherited rather than written twice for exactly that reason: two
processes deciding independently what to call themselves is how a trace ends up
with two spellings of one service.

## No secret here, and that is deliberate

An OTLP endpoint is a network address, not a credential — the collector sits on
the private network beside the workload
([0004](srn://metaframework/product/devops/adr/0004-signoz-runs-beside-the-workload)),
so there is no token to configure and nothing to mark `writeOnly`. What must
never be recorded is a decision about span *content* and lives on
[telemetry](srn://metaframework/product/devops/component/telemetry)'s own page,
where it can be one redaction list rather than a schema keyword.
