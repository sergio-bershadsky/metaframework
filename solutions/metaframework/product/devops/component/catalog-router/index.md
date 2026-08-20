---
name: catalog-router
kind: component
version: 1
title: Catalog router
summary: The edge — turns a URL into a repository, a branch and a catalog root, leases the worktree, and fronts the portal with it.
status: review
owner: sergio
component-type: gateway
lifecycle: planned
criticality: 1
relations:
  depends-on:
    - ../repo-sync
    - ../github
    - ../telemetry
    - /product/portal/component/catalog-loader
  implements:
    - /product/devops/requirement/any-git-repository-is-a-catalog-source
    - /product/devops/requirement/every-request-is-traced
  realizes:
    - /capability/shared-catalog-access
  uses:
    - /product/devops/protocol/worktree-lease
    - /environment/production
    - /environment/compose
tags:
  - edge
  - routing
---

Not built. `lifecycle: planned`.

Every request enters here and nothing else is addressable from outside. The job
is small and stated as a single sentence, which is what the `gateway` discipline
demands — *fronts, routes, or adapts others rather than owning behaviour*:

> `/r/{owner}/{repo}/{branch}/…` → a signed-in identity, a leased worktree path,
> and the portal asked to render that path.

## What it fronts

[repo-sync](srn://metaframework/product/devops/component/repo-sync), for the
worktree; [github](srn://metaframework/product/devops/component/github), for who
the reader is and whether they may see the repository; and the portal's
[catalog-loader](srn://metaframework/product/portal/component/catalog-loader),
which is the thing being rendered. Those three `depends-on` edges are the
discipline's requirement that a gateway name everything it fronts, and the third
is the interesting one.

## The portal edge is a promise, not a call

[catalog-loader](srn://metaframework/product/portal/component/catalog-loader)
resolves its root once per process from `process.env.CATALOG_DIR`
(`framework/portal/src/lib/catalog/index.ts:21`) and caches exactly one catalog.
One process, one catalog. This product needs one process and many.

The edge is therefore drawn deliberately at the component rather than at
[portal](srn://metaframework/product/portal) as a whole, so that the obligation
lands in *that* component's derived inbound list where a maintainer will meet
it. What it obliges is written down in
[0002-the-catalog-root-becomes-a-request-value](srn://metaframework/product/devops/adr/0002-the-catalog-root-becomes-a-request-value):
the catalog root becomes a request-scoped value and the working-tree cache
becomes a small keyed cache instead of a single slot. That is an additive change
to a product this work was told not to restructure, and it is the one dependency
here that cannot be satisfied by writing code in this subtree.

Until it is made, nothing in this product can work. Saying so on the page is
better than discovering it in a sprint.

## Authorisation is GitHub's answer, repeated

This component stores no permission. It asks
[github](srn://metaframework/product/devops/component/github) whether the
signed-in identity can read `{owner}/{repo}`, and refuses or proceeds. There is
no local role, no team, no share link and no cache of an affirmative answer
beyond the life of a session.

The consequence to be honest about: a revoked GitHub permission is honoured at
the next session check rather than instantly, and the window is however long a
session lasts. That is a real weakening of GitHub's own model and it is the
price of not asking GitHub on every request for a page that renders hundreds of
entities.

## Why a gateway and not a service

It owns no behaviour worth calling domain logic: no catalog parsing, no git, no
rendering, no schema work. It resolves, authorises, leases and forwards. If
business behaviour ever accumulates here — a permission model of its own, a
cache with its own invalidation rules, a projection of the catalog — that is the
signal the type is wrong and it has become a service, and the discipline says
review should flag exactly that.

## The lease is held for the render, not the request

A page render reads the catalog root repeatedly and asynchronously; releasing
the lease when the HTTP handler returns would let
[repo-sync](srn://metaframework/product/devops/component/repo-sync) evict a
worktree out from under a stream still being produced. The lease is held for the
life of the render, and a lease that is never released is a leak that fills the
volume — so it has a timeout on the holder's side and eviction treats an expired
lease as absent.

Nobody has designed what happens when a lease expires mid-render. The honest
answer is probably "the render fails and the reader retries", and writing that
down is cheaper than discovering it as a corrupted page.

## Unresolved

- **Where sessions live.** A cookie plus signed state needs no store; anything
  richer needs one, and this product has no datastore entity. Deliberately open.
- **URL shape.** `/r/{owner}/{repo}/{branch}/…` collides with branch names that
  contain slashes — `feature/x` makes the split ambiguous against a catalog path.
  The obvious answers are an encoded branch segment or a `?ref=` query, and
  neither has been chosen.
- **What a reader without access sees.** 404 and 403 leak different things about
  a private repository's existence. GitHub itself answers 404; copying that is
  probably right and has not been decided.
