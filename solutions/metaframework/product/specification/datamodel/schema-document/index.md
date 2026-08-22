---
name: schema-document
kind: datamodel
version: 4
title: Schema document
summary: The schema.json profile — 2020-12, a canonical $id, a required x-srn, four forbidden keywords, and cross-entity refs as absolute URLs.
status: review
owner: sergio
usage: exchange
abstract: false
tags:
  - spec
  - format
  - schema
---

Every datamodel entity in every catalog owns exactly one `schema.json`, and this
is the profile it must satisfy. Specified in `framework/spec/kinds/datamodel.md`
— the second-longest document in the spec, behind `protocol.md` and ahead of
`srn.md`; validated by `framework/portal/src/lib/schema/registry.ts`. It is the
most numerous artifact in the catalog by a wide margin —
`find solutions -name schema.json` is the census — and it keeps growing, partly
because `usage: config` contracts are ordinary datamodels obeying this profile
and one extra discipline of their own.

`usage: exchange` and not `both`, because these documents are literally served
over HTTP to consumers outside the repository —
`framework/portal/src/app/schemas/[...path]/route.ts` returns them as
`application/schema+json` with `Access-Control-Allow-Origin: *` and an `OPTIONS`
preflight, "explicitly so browser-based validators and playgrounds can fetch it".
The file on disk is the storage of a datamodel entity; this format is what
crosses the boundary.

## The profile in one paragraph

JSON Schema draft 2020-12, exactly one dialect. A root `$id` equal to the
entity's canonical schema URL — `https://schemas.metaframework.dev` followed by
the entity's SRN path verbatim. A required `x-srn` carrying the same identity in
the framework's own vocabulary, unversioned. No `$id` at any level below the
root. Four forbidden keywords at any depth: `$dynamicRef`, `$dynamicAnchor`,
`$anchor`, `$vocabulary`. Inheritance is stock `allOf` + `$ref` and nothing else.
Cross-entity `$ref`s are absolute canonical URLs; local shapes are addressed by
`#/$defs` pointers and are entity-private.

## Why this shape, in four decisions

The reference form was decided four times, and the chain is in this solution's
`adr/` bucket:
[0004](srn://metaframework/adr/0004-srn-as-the-json-schema-reference-syntax) →
[0005](srn://metaframework/adr/0005-relative-path-schema-refs-without-id) →
[0006](srn://metaframework/adr/0006-dereferenceable-schema-urls) →
[0007](srn://metaframework/adr/0007-canonical-schema-host-and-x-srn-restored).
Reading them in order is the only way to understand why the profile carries two
identity fields that say the same thing: `$id` is what a stock validator acts on,
`x-srn` is what a reader greps for, and neither is trusted from the file — both
are derived from the directory and compared against it.

## What the sibling schema here cannot say

The sibling `schema.json` is a profile of a profile, and it stops where a single
document stops:

- `$id` **equals this entity's canonical URL**. The pattern in the sibling checks
  the host and the shape; only the loader can check the path, because only the
  loader knows which directory the file was read from (`E_DM_ID_MISMATCH`).
- `x-srn` **equals this entity's unversioned SRN** — same reason
  (`E_DM_SRN_MISMATCH`).
- A `$ref` **names a registered datamodel in the same solution**
  (`E_SRN_DANGLING`, `E_SRN_CROSS_SOLUTION`).
- The root `allOf` graph is **acyclic** (`E_DM_INHERIT_CYCLE`), and a base used by
  descendants does not set `"additionalProperties": false` (`E_DM_CLOSED_BASE`) —
  both are properties of the whole registry, not of one file.

There is also a rule the profile can only state in prose, and the sibling states
it in its own `description`: the four forbidden keywords are forbidden *as
members*, at any depth, which includes being a member of a `properties` map. The
portal's `forbiddenKeywordsIn()` walks every schema-shaped object and asks
`keyword in node`, so writing `"properties": { "$anchor": false }` — the natural
JSON Schema way to forbid a keyword — is itself `E_DM_KEYWORD`. This document's
own sibling was rewritten to use `not` / `required` for exactly that reason.

## How the portal resolves these without a network

One ajv 2020 instance, every document registered under the `$id` a stock tool
would read out of it. Because the key *is* the identity, `$ref` resolution is
plain RFC 3986 with no custom resolver and no network access at build or render
time. For offline bundling — `framework/portal/src/lib/schema/dereference.ts` —
`@apidevtools/json-schema-ref-parser` gets a catalog resolver registered at
`order: 1`, ahead of the built-in HTTP resolver, mapping a canonical URL back to
a file on disk. The no-network claim is test-enforced rather than asserted:
`dereference.test.ts` records that "if the catalog resolver ever stops matching,
these tests do not fail with a wrong shape — they fail by trying to reach the
network".

ajv is configured `strict: false` and `validateFormats: false`. The second is not
laziness: `datamodel.md` makes `format` annotation-only, so asserting it would
break additivity.

## Absent

**`https://schemas.metaframework.dev` resolves nowhere.** It is a constant at
`framework/portal/src/lib/schema/url.ts:46`, mirrored at
`scripts/migrate_schema_ids.py:45`; `host schemas.metaframework.dev` is NXDOMAIN
and no redirect points at it. Every `$id` in the catalog therefore names a host
that answers nothing. That is the intended
design — identity is not a retrieval address — but it means an outside consumer
needs one line of resolver configuration before any of this dereferences, and no
such consumer exists in-repo. What the repository does now hold is the build for
the eight specification meta-schemas — `npm run schemas:build`, scoped and
explained in `docs/schema-hosting.md` — which is a site that could answer the
name and is deployed behind nothing.

**The serving route has no test file.** `app/schemas/[...path]/route.ts` is
exercised only indirectly, by `lib/catalog/fixture-check.test.ts` importing the
handler and asserting a 200 whose `$id` is the canonical URL rather than the
serving one, plus `>= 400` for a `..` climb, `.git/config`, and a real
non-datamodel entity.

**`W_DM_UNION_TAG` cannot reach the diagnostics page.** It is emitted only inside
`buildSchemaBundle()` in `registry.ts`, and that function has no production
caller: its only importers are `registry.test.ts` and the coverage register.

This section used to read "examples are never validated", on the grounds that
`schemaValidator()` was in the same position. It is not, and has not been since
`lib/datamodel/datamodel.ts` began compiling each entity's own validator through
it and running every file in the entity's `examples/` directory against the
result — which is `E_DM_EXAMPLE_INVALID`, defined in `datamodel.md` and emitted
there.
