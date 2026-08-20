---
name: schema-registry
kind: component
version: 3
title: Schema registry
summary: Identity and validation for every schema.json — the canonical host constant, the E_DM_* profile validator, one ajv instance keyed by $id, and the allOf inheritance DAG.
status: review
owner: sergio
component-type: library
lifecycle: released
relations:
  depends-on:
    - ../srn
  uses:
    - /product/specification/datamodel/schema-document@1
  realizes:
    - /capability/schema-interoperability
tags:
  - json-schema
  - identity
---

`src/lib/schema/url.ts` (156 lines) and `src/lib/schema/registry.ts` (1,403).
Two files, one job seen from two angles: what a schema **is called**, and
whether it is **legal**. Splitting them into two components would have produced
two entries in the tree whose summaries a reader could not tell apart.

## Identity, and the constant that is not configuration

```ts
export const CANONICAL_SCHEMA_HOST = 'https://schemas.metaframework.dev'
```

`url.ts:46`, mirrored once outside the portal at `scripts/migrate_schema_ids.py:45`
with a comment naming this line as its source. It is deliberately **not** an
environment variable. Identity must not vary between a laptop and a deployment:
registries and caches key on `$id`, and two deployments disagreeing about a
schema's identity is a defect, not a configuration choice.

`SCHEMA_BASE_URL` (default `http://localhost:3000`) is a different concept in
the same file — where *this* process hands the bytes over. `schemaUrlToSrn()`
returns `null` for a serving URL and for any URL carrying an `@version` pin,
so neither can be silently normalised into an identity. A schema URL addresses
the **current** schema; pins live in frontmatter `relations`, which is the only
place [git-history](srn://metaframework/product/portal/component/git-history)
can resolve them.

**Nothing serves that host.** `https://schemas.metaframework.dev` has no DNS, no
hosting and no redirect anywhere in this repository. It is an identifier. A
consumer that prefers fetching to trusting a cache maps it onto a serving
address in resolver configuration — which is exactly what
[schema-bundler](srn://metaframework/product/portal/component/schema-registry/component/schema-bundler)
does in-process.

## Validation, in one ajv instance

`buildSchemaRegistry(catalog)` walks every datamodel entity, reads its
`schema.json`, and registers the document under its own derived canonical id.
Because every document is registered under exactly the `$id` a stock validator
would read out of it, `$ref` resolution is **plain RFC 3986 with no custom
resolver and no network access** at build or render time. The URLs are
dereferenceable for outsiders; this process never dereferences them, because it
already holds the files.

Fifteen `E_DM_*` classes are raised here — dialect, forbidden keywords
(`$dynamicRef`, `$dynamicAnchor`, `$anchor`, `$vocabulary`), a missing or
mismatched `$id`, a missing or mismatched `x-srn`, a `$ref` naming no entity, a
foreign `$defs` pointer, an `allOf` inheritance cycle, a closed base — plus
`E_SRN_CROSS_SOLUTION` and `E_SRN_DANGLING` from resolving refs. ajv is
configured `strict: false` and `validateFormats: false`, the second because
`format` is annotation-only in the datamodel contract and asserting it would
break additivity for every schema that ever added one.

`withSchemaRegistry()` in `lib/catalog/index.ts:53` concatenates these
diagnostics onto the catalog's, which is what puts `E_DM_*` on
[diagnostics-report](srn://metaframework/product/portal/component/console/component/diagnostics-report)
beside `E_FM_*`. Its own docstring records that before that merge existed the
registry ran only in the test suite and this whole class of error never reached
the page.

## The inheritance DAG, and two warnings that go nowhere

`effectiveModel()` walks the `allOf` chain and answers which schema contributes
which property. It is the input to the schema lineage panel on a datamodel page,
which exists solely to rebuild the one fact Stoplight's `allOf` flattening
drops.

Two warnings are worth naming because they do **not** behave like the rest:

- `W_DM_CONTRADICTION` (a property constrained to disjoint types by two
  ancestors) is pushed into a *local* diagnostics array that the entity page
  surfaces. It never reaches `catalog.diagnostics`, so the diagnostics page and
  the masthead counter do not see it.
- `W_DM_UNION_TAG` is emitted only inside `buildSchemaBundle()`, and
  `buildSchemaBundle()` has no production caller — `grep` finds importers only
  in `registry.test.ts`. It was the API of the schema explorer that Stoplight
  replaced. The warning is therefore **unreachable in the running portal**.

`schemaValidator()` is unreachable for the same reason, which is why
`E_DM_EXAMPLE_INVALID` is specified and implemented nowhere: the function that
would validate an `examples/` file against its schema exists and nothing calls
it.

## What it is not

It is not a schema *store* and not a service. It builds once per catalog load,
lives in the render process, and hands client components a plain serialisable
bundle — client code must import only types from it, or ajv lands in the browser
bundle.
