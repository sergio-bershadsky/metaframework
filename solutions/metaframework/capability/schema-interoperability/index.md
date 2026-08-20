---
name: schema-interoperability
kind: capability
version: 1
title: Hand a data contract to a tool that has never heard of this framework
summary: Let an outside program resolve a catalog's data models from a URL alone — every reference followed, no clone, no plugin, nothing taught.
status: review
owner: sergio-bershadsky
tags:
  - interoperability
  - json-schema
---

A data model written inside a catalog can be consumed by a program that knows
nothing about catalogs: a validator, a type generator, a browser playground, a
service in another repository. It is handed a URL, it gets a document, and every
reference inside that document is itself a URL it can fetch. It never learns what
an SRN is, and it never needs a copy of the repository.

This is the only capability in the solution whose beneficiary is outside it. It
exists because a schema is a public contract and a contract only one program can
read is not one — the position stated on
[stock-tooling-schema-consumption](srn://metaframework/requirement/stock-tooling-schema-consumption),
which is the `must` this doing is judged against.

It is also the one capability here with a measurement behind it rather than an
argument. With the portal running, a stock `json-schema-ref-parser` — given
nothing but a starting URL — retrieved the full transitive closure of the deepest
schema in `solutions/acme`: eight documents, ending
`resolved without a single filesystem read: true`
(`docs/decision-record.md:239-252`). Under the form that preceded it, the same
tool handed the same starting point resolved nothing.

## Boundaries

- **Identity, not hosting.** The doing is that the *form* of the identifier works
  for a stranger. Nothing in this repository serves the canonical host
  `https://schemas.metaframework.dev` — it is a constant at
  `framework/portal/src/lib/schema/url.ts:46`, deliberately not configuration,
  and there is no DNS, no deployment and no redirect for it anywhere here. A
  consumer maps that host onto a serving address in one line of resolver config,
  outside the artifacts
  ([0007-canonical-schema-host-and-x-srn-restored](srn://metaframework/adr/0007-canonical-schema-host-and-x-srn-restored)).
- **Current schemas only.** A schema URL addresses the schema as it is now, and
  `schemaUrlToSrn()` rejects an `@N` outright rather than normalising it away.
  Pinning has exactly one legal home — frontmatter `relations`, where git-backed
  history can resolve it. Versioned retrieval is not a gap to be filled; it is
  excluded, and the exclusion is what keeps a URL from meaning two things.
- **Read, never write.** There is no ingestion of a foreign schema, no
  publishing, no registry push. The conversation is one `GET` and its
  revalidation
  ([schema-serving](srn://metaframework/product/portal/component/schema-service/protocol/schema-serving)).
- **Data models only.** No other entity in the catalog is served to anyone. There
  is no API for the entity graph, no export of the tree, and no feed — a
  consumer that wants the description rather than the data contract reads the
  files.

## Three realizers, and the specification is one of them

Two are the obvious ones inside
[portal](srn://metaframework/product/portal) —
[schema-registry](srn://metaframework/product/portal/component/schema-registry),
which owns the canonical host, the `$id` rule and the one ajv instance, and
[schema-service](srn://metaframework/product/portal/component/schema-service),
the `/schemas` route with its three-layer whitelist, sha256 `ETag`, and the
`Access-Control-Allow-Origin: *` plus `OPTIONS` preflight that keeps a
browser-based validator from being excluded by CORS.

The third is
[kind-contracts](srn://metaframework/product/specification/component/kind-contracts),
and the edge is not ceremony. `framework/spec/kinds/datamodel.md` is where the
absolute-URL form of `$id` and of every cross-entity `$ref` is *normative* —
line 138 defines the canonical host, and lines 225-232 show the shape a consumer
actually meets. Without that rule the route would serve documents whose
references a stranger could not follow, which is the failure the whole
`0004`→`0005`→`0006`→`0007` chain was re-decided four times in one day to escape.
This is the only capability in the solution realized across two products, and it
is the one where that is load-bearing rather than incidental.

## What this capability cannot currently be shown to do

Stated on the capability page because a reader who sees "measured" stops reading:

- **The driver is not in the repository.** The recorded output names
  `node http-deref.mjs`; `find` returns nothing for that file. It is a dated
  measurement, not a reproducible check.
- **The measurement predates the identity it describes.** It was taken while
  `$id` was the *serving* URL. Amendment `2026-08-19-d` then moved identity to
  the unserved constant, and argues the result stands because it proved the URL
  form. That argument is sound and it is still an argument, not a rerun.
- **Nothing in the test suite makes an HTTP request to the route.**
  `framework/portal/src/app/schemas/[...path]/route.ts` has no test file; the
  only coverage is `fixture-check.test.ts` importing the handler directly to
  assert one 200 and three rejections.
- **Nothing in the portal's own UI links to `/schemas`.** An entity page never
  shows a datamodel's serving URL, so a consumer has to be told the address by
  somebody who read the code.

## Not this

- *Serving the catalog* is not this capability. The entity graph has no public
  surface at all; `/api/history` is the only other route and its sole client is
  unmounted
  ([catalog-history](srn://metaframework/product/portal/protocol/catalog-history)).
- *The SRN* is not it either. Identity inside the catalog and identity on the
  wire were deliberately separated —
  [0004-srn-as-the-json-schema-reference-syntax](srn://metaframework/adr/0004-srn-as-the-json-schema-reference-syntax)
  tried to make them the same thing and was disproved by a stock generator
  failing on it.
- *Validating an instance* is not something this solution does for anyone. It
  hands over the contract; whatever validates against it belongs to the consumer,
  which is why [schema-consumer](srn://metaframework/actor/schema-consumer) is an
  actor and not an `external` component.
