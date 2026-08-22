---
name: local
kind: environment
version: 3
title: Local
summary: One developer's machine running next dev — the environment this whole solution was authored in, and no longer the only one that has run.
status: review
owner: sergio-bershadsky
environment-type: local
tags:
  - development
---

`npm run dev` at the repository root proxies to `next dev` in
`framework/portal`. Nothing is shared, no data is of record, and anyone may
break it at any moment — which is the standard definition of `local`, and here
it is also the definition of every other environment the solution declares.

## Why there was exactly one, and what changed

This page used to argue that `local` was the complete list, on the evidence that
there was no `.github/`, no Dockerfile, no `vercel.json`, no `fly.toml`, no
Kubernetes manifest and no deploy script anywhere in the tree. Two of those have
since stopped being true, in steps worth separating.

`.github/` arrived first and is a CI workflow, not a deployment, so it did not
move the argument. `docker/` arrived on 2026-08-22 and does move it: a
Dockerfile that packages the portal, a compose file that starts it and a Helm
chart that renders manifests for it, belonging to
[compose](srn://metaframework/environment/compose) and
[production](srn://metaframework/environment/production). The first of those has
actually started on a laptop. So this is no longer the only environment the
solution has, nor the only one anything has ever run in; it remains the only one
that runs `next dev`, which is what the rest of this page describes.

What has not changed is the reason `schemas.metaframework.dev` is still not
modelled as an environment: doing so would invert the decision that separates
identity from serving address, which is the whole point of decision-record
amendment `2026-08-19-d`. The canonical host is a constant at
`framework/portal/src/lib/schema/url.ts:46`; it is not a place anything runs.
The `process.env.NODE_ENV === 'production'` branch in
`framework/portal/src/app/schemas/[...path]/route.ts` — which selects a
`max-age` instead of `no-store` — is likewise a code path and not a deployment.
It is a code path that is now reachable: the packaged `server.js` under
`docker/` sets `NODE_ENV = 'production'` in process, so the container takes that
branch while `next dev` here does not.

## What runs here

One Node process. `next dev` with Turbopack, serving the console, the `/schemas`
route and the `/api/history` route out of the same process — which is why
[schema-service](srn://metaframework/product/portal/component/schema-service) and
[history-service](srn://metaframework/product/portal/component/history-service)
are typed `service` under protest: the `component-type` enum has no value for an
HTTP endpoint inside a monolith.

The catalog is read live from disk on every request. In development the loader
stats the tree and re-parses only when a fingerprint moved, which is two orders
of magnitude cheaper than rebuilding — the measurement, and the catalog size it
was taken against, live in
[catalog-loader](srn://metaframework/product/portal/component/catalog-loader)
rather than being copied here, because a per-entity cost restated beside a
stale entity count is a claim that goes wrong twice
([0018](srn://metaframework/adr/0018-measured-facts-are-derived-or-dated)); in
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
