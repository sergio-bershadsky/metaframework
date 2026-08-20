---
name: schema-consumer
kind: actor
version: 1
title: Schema consumer
summary: Stock JSON Schema tooling that fetches a datamodel's schema and resolves its references without knowing this framework exists.
status: review
owner: sergio-bershadsky
actor-type: external-system
goals:
  - Validate an instance against a catalog schema without cloning the repository.
  - Follow a $ref from one catalog schema to another and get a document back.
  - Generate types from a schema using a tool that has never heard of the SRN.
relations:
  uses:
    - /product/portal/component/schema-service
tags:
  - interoperability
  - json-schema
---

A class of tool, not a named system: `ajv`, `json-schema-ref-parser`,
`json-schema-to-typescript`, a browser validator, a code generator in some other
repository. It never learns what an SRN is. It is handed a URL and expected to
get a document back and to follow every `$ref` inside it.

This actor is the entire justification for the canonical-URL identity design.
Every `$id` in every `schema.json` the portal loads is a URL rather than an SRN
because of what this consumer can and cannot do, and the decision was re-taken
four times in one day before it settled — the chain runs
`0004` → `0005` → `0006` → `0007` in the solution's `adr/` bucket, and each link
is a measurement against a real tool, not a preference.

## Written for, in code

`framework/portal/src/app/schemas/[...path]/route.ts` sets
`Access-Control-Allow-Origin: *` and answers an `OPTIONS` preflight, with the
reason in the file: a schema is a public contract, and the point is that *other*
tools can read it, including browser-based validators subject to CORS. It serves
`application/schema+json`, emits a sha256 `ETag` and honours `If-None-Match`.

The claim that the design works is a dated measurement, not an assertion:
decision-record amendment `2026-08-19-c` records a stock `json-schema-ref-parser`
bundling eight documents — the full transitive closure of the deepest schema in
`solutions/acme` — over HTTP, ending `resolved without a single filesystem read:
true`.

## Three caveats that travel with that measurement

1. The driver named in the recorded output, `http-deref.mjs`, is **not in this
   repository**. `find` returns nothing. It is recorded prose, not a reproducible
   check.
2. It was taken while `$id` was the *serving* URL. Amendment `2026-08-19-d` then
   moved identity to the constant `https://schemas.metaframework.dev`, which
   nothing in this repository serves. A consumer today needs one line of resolver
   config mapping that host onto a serving address; amendment d says so, and
   argues the measurement still stands because it proved the URL *form*.
3. `framework/portal/src/app/schemas/[...path]/route.ts` has **no test file**.
   The only coverage is `fixture-check.test.ts` importing the handler directly to
   assert a 200 and three rejections.

All three are carried in the acceptance criteria of
[stock-tooling-schema-consumption](srn://metaframework/requirement/stock-tooling-schema-consumption)
rather than left in a footnote.

## Why an actor and not an `external` component

By the boundary test in the spec's actor document, applied in order. It
originates requests, so it is a candidate. We do not describe its internals. And
nothing in this catalog needs to name it in a `uses`, `exposes`, `depends-on` or
`implements` edge — the dependency runs the other way, the route is anonymous by
construction, and there is no single system to describe. An `external` component
would claim a description we do not have.

The `uses` edge above points at
[schema-service](srn://metaframework/product/portal/component/schema-service),
the component this actor touches. Participation in
`protocol/schema-serving` is declared on the protocol, not here.

## What this consumer cannot do today

Ask for a specific version. `schemaUrlToSrn()` rejects an `@N` in a schema URL
outright rather than normalising it away, so a schema URL always addresses the
*current* schema. Pinning exists only in frontmatter `relations`, where
git-backed history can resolve it. There is no versioned schema retrieval and
none is planned in v1.

Nothing in the portal's own UI links to `/schemas` either. Grepping `src` for
`/schemas/` outside `app/schemas/` and `lib/schema/` finds only tests, so an
entity page never shows a datamodel's serving URL. This actor has to be told the
URL by someone who read the code.
