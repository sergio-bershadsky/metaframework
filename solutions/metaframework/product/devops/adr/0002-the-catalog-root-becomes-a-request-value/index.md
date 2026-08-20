---
name: 0002-the-catalog-root-becomes-a-request-value
kind: adr
version: 1
title: The catalog root becomes a request value, and the portal has to change
summary: One portal process must serve many catalogs, so CATALOG_DIR stops being process-wide — an additive change to a product this work was told not to restructure.
status: review
owner: sergio
decision-status: proposed
date: "2026-08-20"
relations:
  uses:
    - /product/devops/component/catalog-router
    - /product/portal/component/catalog-loader
tags:
  - devops
  - portal
  - dependency
---

## Context

The portal resolves its catalog once, from the environment:

```ts
// framework/portal/src/lib/catalog/index.ts:21
export function catalogDir(): string {
  const configured = process.env.CATALOG_DIR
  if (configured) return path.resolve(configured)
  return path.resolve(process.cwd(), '../../solutions')
}
```

and caches exactly one parsed catalog behind it — `watchedCatalog` is a single
slot keyed on a fingerprint, and `deployedCatalog` is one promise per process.
One process serves one catalog. That is correct for both situations the portal
was built for: a developer's `next dev`, and the CLI pointed at the tree they
are editing.

[devops](srn://metaframework/product/devops) needs one process to serve many, because
a catalog here is a *(repository, branch)* pair and there are as many as readers
ask for.

## Decision

The catalog root becomes a **request-scoped value**, and the working-tree cache
becomes a small cache keyed by that root instead of a single slot. The router
passes the leased worktree path with the request; `catalogDir()` prefers the
request's value and falls back to today's environment variable, so every
existing caller behaves exactly as it does now.

This is an **additive** change and therefore legal under
[0010-additive-only-evolution](srn://metaframework/adr/0010-additive-only-evolution):
nothing is removed, no default changes, and a portal with no request-scoped
value set is the portal that exists today.

## Consequences

- **The portal grows a dependency on request context.** `catalogDir()` is
  currently a pure function of the environment and becomes a function of where
  it is called from. That is a real loss of simplicity in the module the whole
  loader hangs off, and it is the actual cost of this decision.
- **Memory becomes a policy.** A rebuild of the catalog as it stood was measured
  to grow the heap ~250MB
  (`framework/portal/src/lib/catalog/index.ts`), and *n* cached catalogs is
  *n* times that. The cache needs a bound, and the bound is a number nobody has
  chosen because nobody has measured a real multi-tenant load.
- **The fingerprint work carries over unchanged.** Each root is fingerprinted
  independently, so an edit on one branch does not invalidate another's — which
  falls out of keying by root and would not have fallen out of any of the
  alternatives.
- **It obliges a change in a product this work was told not to fix.** Stated
  plainly on both
  [devops](srn://metaframework/product/devops) and
  [catalog-router](srn://metaframework/product/devops/component/catalog-router)
  rather than buried here. Until it is made, nothing in this product runs.
- **`servingWorkingTree()` becomes ambiguous.** It currently answers "is this a
  live tree or a deployed build" for the whole process. Under this decision a
  single process serves live trees *and* is itself a deployed build, and the two
  modes stop being a process property. Nobody has worked out what it should
  return; it is the sharpest unresolved edge in this record.

## Alternatives considered

- **One portal process per (repository, branch), supervised, with idle
  eviction.** Requires no portal change at all, which is exactly why it was
  attractive. Rejected on operational weight: it means a process supervisor with
  its own lifecycle, health, port allocation and eviction — a subsystem larger
  than the change it avoids — and at ~250MB of heap per catalog the arithmetic
  is worse, not better, because nothing is shared between processes.
- **One process per repository, swapping the worktree underneath it.** Cheaper,
  and it reintroduces precisely the concurrent-reader collision that
  [0001](srn://metaframework/product/devops/adr/0001-a-worktree-per-branch)
  rejected, one level up.
- **A reverse proxy that rewrites `CATALOG_DIR` per request.** Not possible: the
  variable is read in-process, and an environment variable is not per-request.
  Recorded because it is the first thing anybody suggests.
- **Fork the portal into a multi-tenant variant.** The worst option and worth
  naming: two renderers that must agree on the catalog format forever, and the
  format is the product. This solution already has one copy-by-hand problem it
  regrets — the palette duplicated into `console-tokens.ts`
  ([0003-colour-is-ontology](srn://metaframework/product/portal/adr/0003-colour-is-ontology))
  — and that is thirty lines rather than a renderer.
