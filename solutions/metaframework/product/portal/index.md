---
name: portal
kind: product
version: 1
title: Portal
summary: The Next.js console that renders a catalog — the surface where a product's current state and the decisions around it are read.
status: review
owner: sergio
lifecycle: incubating
primary-actors:
  - /actor/reviewer
  - /actor/catalog-author
relations:
  depends-on:
    - /product/specification
  implements:
    - requirement/green-test-suite
tags:
  - portal
  - nextjs
  - read-only
---

# Portal

`framework/portal` — a single Next.js 16.3.1 / React 19.2.8 application, 23,277
lines of TypeScript, TSX and CSS under `src/`, 16 test files, 395 tests, ~1.2s
(measured 2026-08-19 with `npx vitest run`). It reads `solutions/` and `.git/`
and writes nothing. It is the product this solution's directive is about: the
place where a reader finds out what a system currently is, and what was decided
to make it that.

`lifecycle: incubating` rather than `active`, and the distinction is the whole
honesty of this page. There is no deployment of any kind — no Dockerfile, no
`vercel.json`, no `.github/`, no host configuration anywhere in the repository.
The only environment is [local](srn://metaframework/environment/local), and the
only address that has ever served a byte of this portal is `localhost:3000`. A
product page claiming `active` would be claiming production, and there is none.

## How this decomposes, and why not by directory

The components below are the system's **jobs**, not `src/`'s folders. Five of
them: resolve identity, read and validate the tree, own the schema story, reach
into git for the past, and render. Where two modules answer one question they
were merged — `url.ts` and `registry.ts` are one
[schema-registry](srn://metaframework/product/portal/component/schema-registry)
because identity and validation are the same job seen from two sides, and
`workflow.ts`, `states.ts` and `mermaid.ts` are one
[protocol-model](srn://metaframework/product/portal/component/protocol-model)
because all three answer "turn a protocol's sibling artifact into something
drawable and narratable". Where one module crosses a real boundary it was split
out: the two route handlers, because they are the only things in this product an
outside process can address.

- [srn](srn://metaframework/product/portal/component/srn) — the identity
  grammar, and the only module with no dependency of its own.
- [catalog-loader](srn://metaframework/product/portal/component/catalog-loader)
  — filesystem to entity graph, fail-soft, plus the dev fingerprint cache.
- [schema-registry](srn://metaframework/product/portal/component/schema-registry)
  — the `schema.json` profile, one ajv instance, the inheritance DAG.
- [schema-service](srn://metaframework/product/portal/component/schema-service)
  — `/schemas`, the only surface built for a consumer outside this repository.
- [git-history](srn://metaframework/product/portal/component/git-history) — the
  past, read through a subprocess, and never allowed to throw.
- [history-service](srn://metaframework/product/portal/component/history-service)
  — `/api/history`, four read-only operations with no in-app caller today.
- [protocol-model](srn://metaframework/product/portal/component/protocol-model)
  — the workflow mini-spec, the XState subset, and the mermaid compiler.
- `console` and the diagram subsystem — the chrome, the tree, the entity page,
  the artifact panes and the four renderers.

## Where the ontology does not fit this product

Stated here once, so each component page does not have to re-argue it.

**`component-type` has no value for "HTTP endpoint inside a monolith."**
`schema-service` and `history-service` are Next.js route handlers running in the
UI's own process. They are not independently deployed, not independently
started, and not addressable except through the same server that renders the
catalog. `service` is the nearest of the seven values and both take it; the
mismatch is recorded in prose rather than as an invented eighth value, which is
what [kinds/component.md](srn://metaframework/product/specification/component/kind-contracts)
prescribes.

**There is no `metric` kind.** `RESERVED_KINDS` in
`framework/portal/src/lib/srn/srn.ts:23` lists exactly eight buckets, and the
loader rejects anything else. So every measured number in this subtree — 395
tests, 1368 KiB → 1133 KiB of first load, ~3.6s → ~12ms of dev rebuild — lives
inside a requirement's acceptance criteria, where it can at least be checked.

## What is built and not wired

Three gaps, all greppable, all deliberately modelled rather than tidied away:

- `components/history/history-panel.tsx` is the only client of `/api/history`,
  and nothing imports it. `grep -rn HistoryPanel src` returns three hits, all in
  the file that defines it; `git log -S HistoryPanel` returns exactly one commit,
  `4aa3f68`, which is also the commit that added the directory.
- `buildSchemaBundle()` and `schemaValidator()` in
  `src/lib/schema/registry.ts` have no production caller — the only importer is
  `registry.test.ts`. They were the API of the schema explorer that Stoplight's
  `JsonSchemaViewer` replaced. The direct consequence is that `W_DM_UNION_TAG`,
  emitted only inside `buildSchemaBundle`, can never reach `/diagnostics`.
- There are **zero component tests and zero end-to-end tests**. All 16 suites
  live under `src/lib/**`; `find src -name '*.test.tsx'` returns nothing. Roughly
  7,100 lines of components and app routes are unverified except where a test
  imports a route handler directly, which `fixture-check.test.ts` does for
  `/schemas` and nothing does for `/api/history`.

## Ownership

One product, one owner, one author: 52 commits, all on 2026-08-19, all by Sergey
Bershadsky. `framework/portal/README.md` is still unedited `create-next-app`
boilerplate, and `AGENTS.md` is the generated Next.js block. The documentation
of this product is this catalog.
