---
name: stock-tooling-schema-consumption
kind: requirement
version: 1
title: A catalog schema is resolvable by tooling that has never heard of this framework
summary: A datamodel's schema.json must be dereferenceable by stock JSON Schema tooling, following every cross-entity $ref, without a clone of this repository.
status: review
owner: sergio-bershadsky
requirement-type: non-functional
priority: must
relations:
  uses:
    - /product/portal/component/schema-service
    - /environment/local
tags:
  - interoperability
  - json-schema
---

# A catalog schema is resolvable by tooling that has never heard of this framework

The obligation the entire schema-identity chain was re-decided four times to
satisfy. A schema in this catalog is a public contract, and a contract that only
one program can read is not one. The consumer is
[schema-consumer](srn://metaframework/actor/schema-consumer): a validator, a
generator, a browser playground — anything holding nothing but a URL.

Two forms were tried and abandoned, both recorded rather than deleted. An `srn://`
`$ref` was well-formed and unresolvable by anything. A relative file path
resolved for exactly one class of consumer — a tool running inside a clone of
this repository, invoked from the right directory — which is why amendment
`2026-08-19-c` says of the previous measurement that it "was real but its scope
was narrower than the requirement".

## Acceptance criteria

- **AC-1** Every `schema.json` declares a root `$id` that is an absolute HTTP URL on the canonical host, and every cross-entity `$ref` has the same form.
  - No `srn://`, no relative path, no depth arithmetic.
- **AC-2** A stock dereferencer, given only a starting URL and no filesystem access, retrieves the full transitive closure of that schema.
  - **Given** decision-record amendment `2026-08-19-c`, with the portal running
  - **When** `json-schema-ref-parser` was pointed at the deepest schema in `solutions/acme`
  - **Then** it fetched eight documents and reported `resolved without a single filesystem read: true`
- **AC-3** The serving route answers a cross-origin request. `Access-Control-Allow-Origin: *` plus an `OPTIONS` preflight handler, so a browser-based validator is not excluded by CORS.
- **AC-4** Identity does not vary by deployment: a served document's `$id` is the canonical URL, never the address it was fetched from.
  - `fixture-check.test.ts` asserts both halves — that `$id` equals
    `srnToSchemaUrl(entity.srn)`, and that no `schema.json` contains the string
    `/schemas/`.
- **AC-5** A schema URL addresses the current schema and cannot be pinned.
  - `schemaUrlToSrn()` rejects an `@N` outright rather than normalising it away, so
    a pin has exactly one legal home — frontmatter `relations`, where git-backed
    history can resolve it.

## Three caveats that must travel with AC-2

The measurement is the strongest evidence in this catalog and it is also the one
most easily overstated, so its limits are part of the criterion rather than a
footnote:

1. **The driver is not in this repository.** The recorded output names
   `node http-deref.mjs`; `find` returns nothing for that file. AC-2 cites a
   dated measurement, not a reproducible check.
2. **The measurement predates the identity it now describes.** It was taken while
   `$id` was the *serving* URL. Amendment `2026-08-19-d` then moved identity to
   the constant `https://schemas.metaframework.dev`, which nothing in this
   repository serves. Amendment d argues the result still stands because it
   proved the URL *form*, and says in the same breath what a consumer must do
   today: map the canonical host onto a serving address in resolver config, one
   line, outside the artifacts.
3. **The HTTP surface AC-3 rests on has no test file.**
   `framework/portal/src/app/schemas/[...path]/route.ts` is covered only by
   `fixture-check.test.ts` importing the handler directly to assert one 200 and
   three rejections.

## What is in the repository

The route itself, with a three-layer path whitelist, a sha256 `ETag` with 304
handling and the CORS headers AC-3 names. And
`framework/portal/src/lib/schema/dereference.ts`, which installs a resolver at
`order: 1` ahead of the built-in HTTP resolver, mapping a canonical schema URL
back to a local file — the same host-to-source mapping an outside consumer would
configure, implemented in-process so that rendering an entity page never depends
on the network. That claim is test-enforced from the other side:
`dereference.test.ts` states that if the resolver stops matching, the tests do
not fail with a wrong shape, they fail by trying to reach the network.

## Out of scope

Publishing. Nothing in this repository serves the canonical host, and nothing
here proposes to. This requirement is about the *form* of the identifier and the
behaviour of the route that exists, not about a domain being registered.
