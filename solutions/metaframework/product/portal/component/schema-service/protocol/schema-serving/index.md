---
name: schema-serving
kind: protocol
version: 1
title: Schema serving
summary: How a JSON Schema tool that has never heard of this framework fetches a catalog schema, and what happens when it follows a $ref out of one.
status: review
owner: sergio
style: request-response
participants:
  - alias: consumer
    ref: /actor/schema-consumer
    role: initiator
  - alias: schema-service
    ref: /product/portal/component/schema-service
    role: responder
tags:
  - http
  - interoperability
---

# Schema serving

The only conversation in this solution with a party outside it. One initiator —
stock JSON Schema tooling, described as
[schema-consumer](srn://metaframework/actor/schema-consumer) — and one
responder,
[schema-service](srn://metaframework/product/portal/component/schema-service).

## Why it sits here

Its only component participant is the responder, so the nearest common ancestor
of its participants is that component itself, and the protocol directory lands
inside it. The actor is excluded from the calculation by
[structure.md](srn://metaframework/product/specification/component/core-contracts):
actors are solution-level, so counting them would push every protocol in the
catalog to the solution root.

## The interesting half is the second request

Fetching one document is unremarkable: `GET /schemas/{srn-path}`, a
three-layer whitelist, `application/schema+json`, a sha256 ETag, a 304 on
revalidation.

What the workflow exists to draw is what happens **next**. The document the
consumer receives states its `$id` as
`https://schemas.metaframework.dev/…` and every cross-entity `$ref` as a URL on
that same host — not on the origin the bytes just came from. That is the
identity/retrieval split working exactly as
[0007](srn://metaframework/adr/0007-canonical-schema-host-and-x-srn-restored)
intends, and it means a naive consumer's next fetch goes to a host **that
resolves nowhere**. There is no DNS, no hosting and no redirect for
`schemas.metaframework.dev` anywhere in this repository.

The consumer therefore needs one line of resolver configuration mapping the
canonical host onto a serving address, outside the artifacts. The `alt` fragment
in `workflows/fetch-schema.yaml` has that branch and its `[else]`, and the
`[else]` is the honest one: without the mapping, the reference does not resolve.

## Artifacts

`transport.yaml` declares `kind: http`, `base-path: /schemas`, and the two
operations the handler implements. It carries a surface list rather than a
`spec` link, because no OpenAPI document for this route exists — and the two are
mutually exclusive by rule, so writing both would guarantee divergence.

There is no `states.json`. A stateless GET has no conversation state; the ETag
is a cache validator, not a state.

## What is not modelled

The measurement that made this protocol worth having — eight documents bundled
over HTTP by a tool that had never heard of the framework — is recorded prose in
decision-record amendment 2026-08-19-c, not a check. Its driver script is not in
the repository, and it was taken while `$id` was still the serving URL, before
amendment -d moved identity to the unserved constant. It proves the URL *form*
works. It does not prove that this route answers today, and nothing in the test
suite makes an HTTP request to it.
