---
name: schema-bundler
kind: component
version: 2
title: Schema bundler
summary: json-schema-ref-parser with a catalog resolver ordered ahead of the http one, so a canonical $ref is satisfied from disk and the no-network claim is test-enforced.
status: review
owner: sergio
component-type: library
lifecycle: released
tags:
  - json-schema
  - offline
---

`src/lib/schema/dereference.ts`, 92 lines. `bundleSchema(entity, catalogDir)`
returns one self-contained document plus the catalog-relative paths of every
file it pulled in.

## Separate from the registry, on purpose

Different dependency, different job. The
[registry](srn://metaframework/product/portal/component/schema-registry) answers
*is this legal, and what does it inherit* using ajv. This answers *give me the
whole document* using `@apidevtools/json-schema-ref-parser`. Retrieval, not
validation.

## The resolver, and why it must exist

Every cross-entity `$ref` in the catalog is a canonical HTTP URL, and the
parser's default behaviour is to **fetch** it. That would make rendering an
entity page depend on network access at SSR and build time, for documents this
process already holds on disk.

So a resolver is installed at `order: 1` — ahead of the built-in `http` resolver
— whose `canRead()` claims only canonical schema URLs and whose `read()` maps
the URL path back through SRN ≡ path ≡ URL path and reads the file. Anything
else still falls through to the defaults, so a genuinely foreign `$ref` fails
loudly rather than being silently mis-read.

This is exactly the "map the canonical host onto a local source" step any
offline resolver performs. The document an outside consumer would receive is
byte-identical.

`bundle()` is used rather than `dereference()`, so shared and recursive shapes
stay as internal `#/` pointers and a self-referential model cannot expand
forever.

## The claim is enforced by the test, not by the comment

`dereference.test.ts` runs against the **real** catalog, and its own header says
what happens if the resolver stops matching: the tests "do not fail with a wrong
shape — they fail by trying to reach the network". That is the only mechanical
guarantee in this component, and it is worth more than the docstring above it.

## What is absent

The reproducible proof that an *outside* tool can do the same thing is not in
this repository. The measurement recorded in decision-record amendment
2026-08-19-c — a stock `json-schema-ref-parser` bundling eight documents over
HTTP with "resolved without a single filesystem read: true" — was produced by a
driver script, `http-deref.mjs`, that `find` does not locate anywhere here. It
is a dated observation, not a check that can be re-run.
