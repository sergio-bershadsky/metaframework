---
name: config
kind: datamodel
version: 1
title: Schema service configuration
summary: The one key of local's four that a hosted component actually reads — NODE_ENV, which picks this route's Cache-Control and nothing about identity.
status: review
owner: sergio
usage: config
abstract: false
tags:
  - configuration
---

The concrete config contract of
[schema-service](srn://metaframework/product/portal/component/schema-service),
and the only config contract in this solution's `local` half.

## Why one key, out of the four `local` declares

[local](srn://metaframework/environment/local) declares `CATALOG_DIR`,
`SCHEMA_BASE_URL`, `NODE_ENV` and `PORT`, all environment-wide, and says why:
one Node process serves the console, `/schemas` and `/api/history`, so there is
nothing to scope a key `for:`. Attributing all four to components would invent a
decomposition the environment explicitly denies. What the join needs is
narrower — which *hosted* component reads each key — and only one of the four
has an answer in this catalog:

- `CATALOG_DIR` is read by
  [catalog-loader](srn://metaframework/product/portal/component/catalog-loader),
  which declares no environment.
- `SCHEMA_BASE_URL` is read in `lib/schema/url.ts`, which is
  [schema-registry](srn://metaframework/product/portal/component/schema-registry) —
  a `library`, and libraries declare no environment either.
- `PORT` is Next's own listen port and belongs to the runtime rather than to any
  component described here.
- `NODE_ENV` is read *here*: it selects `no-store` against
  `public, max-age=300, stale-while-revalidate=3600` on every `/schemas`
  response, because in development the file being served is being edited right
  now.

An environment-wide entry no contract declares is not a finding — a platform key
no modelled component reads is the ordinary reason an entry has no `for:` — so
the other three stay unchecked and correctly so, until a component that reads
one declares an environment.

## `NODE_ENV` is required and defaulted

The pair means the key is always present in the resolved configuration and no
environment owes it: the runtime supplies `development` if nobody else does. The
`enum` is what earns the entry — `production` here is a code path and not a
deployment (`NODE_ENV === 'production'` has never been true for this route
outside a local `next start`), and a misspelling silently selects the
development branch in a deployment that thought it had caching. A typo'd value
is now `E_ENV_CONFIG_VALUE` rather than a mystery `no-store` header.

Nothing here is `writeOnly`. The route is read-only, `Access-Control-Allow-Origin:
*`, and deliberately reachable by a validator that has never heard of this
framework; a credential in its configuration would contradict the whole point of
the surface.
