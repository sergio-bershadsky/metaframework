---
name: local
kind: environment
version: 1
title: Local
summary: One developer's machine running next dev — the only environment this solution has, and the complete list rather than the first entry in it.
status: review
owner: sergio-bershadsky
environment-type: local
tags:
  - development
---

`npm run dev` at the repository root proxies to `next dev` in
`framework/portal`. That is the entire deployment story. Nothing is shared, no
data is of record, and anyone may break it at any moment — which is the standard
definition of `local`, and here it is also the definition of *every* environment
the solution has.

## Why there is exactly one

Not an omission. There is no `.github/`, no Dockerfile, no `vercel.json`, no
`fly.toml`, no Kubernetes manifest and no deploy script anywhere in the tree.
The `process.env.NODE_ENV === 'production'` branch in
`framework/portal/src/app/schemas/[...path]/route.ts` — which selects a
`max-age` instead of `no-store` — is a code path, not a deployment.

Modelling a `production` environment would be modelling an intention. Modelling
`schemas.metaframework.dev` as an environment would be worse: it would invert the
decision that separates identity from serving address, which is the whole point
of decision-record amendment `2026-08-19-d`. The canonical host is a constant at
`framework/portal/src/lib/schema/url.ts:46`; it is not a place anything runs.

## What runs here

One Node process. `next dev` with Turbopack, serving the console, the `/schemas`
route and the `/api/history` route out of the same process — which is why
[schema-service](srn://metaframework/product/portal/component/schema-service) and
[history-service](srn://metaframework/product/portal/component/history-service)
are typed `service` under protest: the `component-type` enum has no value for an
HTTP endpoint inside a monolith.

The catalog is read live from disk on every request. In development the loader
stats the tree and re-parses only when a fingerprint moved (`~18ms` to
fingerprint 197 entities across 597 entries, against `~2.2s` to rebuild); in
production it is read once per process. `docs/decision-record.md` calls this
"live fs reads in dev" and it is the reason an author sees a diagnostic appear
the moment they save.

## Two knobs, and neither is identity

`CATALOG_DIR` retargets the running portal at a catalog somewhere else on disk,
which is how the portal is pointed at a solution repository that is not this one.
`SCHEMA_BASE_URL` says where *this* process serves schema bytes; unset, it is
`http://localhost:3000`. Neither changes what a schema *is*: `$id` is built from
the canonical host either way, and `fixture-check.test.ts` asserts exactly that —
that a served document's `$id` is the canonical URL and not the serving one.

The configuration surface is in the sibling `config.yaml`, and placement in
`topology.yaml`. Both are thin on purpose: there is one process and one machine.

## The plugin is installed from a path

`marketplace/README.md` documents installation as
`/plugin marketplace add /Users/…/metaframework/marketplace` — a local
filesystem path. Installing from a git remote is named as an alternative and is
untested. There are no releases, no tags and no changelog; both manifests say
version `0.1.0`.

## What this environment does not guarantee

Anything. No SLO, no availability objective, no data residency, no change
window, no promotion path — there is nowhere to promote to. Every measured number
that appears in this catalog's requirements was measured here, by a person
running a command, on 2026-08-19.
