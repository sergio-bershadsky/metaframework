---
name: schema-service
kind: component
version: 4
title: Schema service
summary: The /schemas route handler — a three-layer path whitelist, a sha256 ETag, and CORS, so a tool that has never heard of this framework can fetch a schema.
status: review
owner: sergio
component-type: service
lifecycle: released
relations:
  exposes:
    - protocol/schema-serving
  depends-on:
    - ../catalog-loader
    - ../git-history
    - ../srn
  uses:
    - /environment/local
  implements:
    - /requirement/stock-tooling-schema-consumption
  realizes:
    - /capability/schema-interoperability
tags:
  - http
  - interoperability
---

`src/app/schemas/[...path]/route.ts`. `GET` and `OPTIONS`, read-only,
`runtime = 'nodejs'`, `dynamic = 'force-dynamic'`.

**`component-type: service` is the nearest fit and not the true one.** This is a
Next.js route handler running inside the console's own process. It is not
deployed, started or scaled separately; it exists because the same server that
renders a datamodel page can also hand its `schema.json` to somebody else. The
`component-type` enum has no value for "HTTP endpoint inside a monolith", and
the spec's instruction for that case is to take the nearest value and write the
nuance down rather than invent an eighth.

## The obligation it carries

`implements` names
[stock-tooling-schema-consumption](srn://metaframework/requirement/stock-tooling-schema-consumption),
and the edge was missing until 2026-08-21 while the requirement pointed back at
this component the whole time. Two of that requirement's criteria are this
handler and nothing else: AC-3 is the `Access-Control-Allow-Origin: *` and the
`OPTIONS` branch below, and AC-4 is the served `$id` staying canonical rather
than becoming the address it was fetched from — the half of AC-4 that only a
serving route can get wrong. AC-1 is the registry's, AC-2 is a dated
measurement, AC-5 belongs to the URL↔SRN mapping in `lib/schema/url.ts`. One
component satisfying part of a solution-level obligation is the shape the edge
is for; the requirement's whole "What is in the repository" section is written
that way, and claiming otherwise would be the overclaim.

Its counterpart is
[schema-closure-filesystem-reads](srn://metaframework/metric/schema-closure-filesystem-reads),
which already `measures` both that requirement and the capability below. A
number pointing at an obligation that nothing claimed to satisfy was the
asymmetry `W_REQ_UNIMPLEMENTED` found.

## Why it exists at all

Because [schema-consumer](srn://metaframework/actor/schema-consumer) is the only
justification for the whole canonical-URL identity design. A schema is a public
contract; if no address ever answers, the design is unfalsifiable. The route
sets `Access-Control-Allow-Origin: *` and answers an `OPTIONS` preflight
specifically so browser-based validators and playgrounds — which are subject to
CORS — can fetch one.

The URL path after `/schemas/` is the SRN path verbatim:

```text
GET /schemas/acme/product/shop/datamodel/order-line
  → solutions/acme/product/shop/datamodel/order-line/schema.json
```

The mapping is a rename, not a lookup — which is exactly why this handler is a
trust boundary.

## The whitelist, in three layers

1. `safeCatalogPath()` — borrowed from
   [git-history](srn://metaframework/product/portal/component/git-history),
   which is why that dependency edge exists — validates a catalog-relative path.
   Next has already percent-decoded the catch-all segments, and this handler
   deliberately does **not** decode again: `%252e%252e` → `..` is the classic
   traversal hole.
2. `dirToSrn()` with a hard `parsed.kind !== 'datamodel'` gate. Only a datamodel
   owns a `schema.json`, so this turns "any directory under `solutions/`" into
   the handful that can possibly answer.
3. A post-`realpath` containment re-check. The first layer proves the *string*
   stays inside the catalog; a symlink in the tree is the one way a validated
   path still leaves it.

`fixture-check.test.ts` imports this handler directly and asserts a 200 whose
`$id` is the **canonical** URL rather than the serving one, plus `>= 400` for a
`..` climb, for `.git/config`, and for a real-but-non-datamodel entity
(`acme/actor/customer`).

## Caching, and the honest gap

Responses carry a strong sha256 ETag over the exact bytes with 304 handling, a
`Content-Location`, and `Cache-Control: public, max-age=300,
stale-while-revalidate=3600` in production against `no-store` in development —
because in development the file is being edited right now. That production
branch is a code path, not a deployment: `NODE_ENV === 'production'` has never
been true for this route outside a local `next start`.

**No UI links here.** Grepping `src` for `/schemas/` outside `app/schemas/` and
`lib/schema/` finds only tests: an entity page never shows a datamodel's serving
URL. The route is live and reachable and, inside this application, unused —
which is the correct shape for a surface built for an outsider, and worth
knowing before anyone calls it dead.

The route also has **no test file of its own**. It is covered only through
`fixture-check.test.ts`, which is a catalog-loader test that happens to import
it.
