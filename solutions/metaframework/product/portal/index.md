---
name: portal
kind: product
version: 4
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

`framework/portal` — a single Next.js 16 / React 19 application:
TypeScript, TSX and CSS under `src/`, with a test suite that runs in a couple of
seconds. It reads `solutions/` and `.git/` and writes nothing. It is the product this solution's directive is about: the
place where a reader finds out what a system currently is, and what was decided
to make it that.

`lifecycle: incubating` rather than `active`, and the distinction is the whole
honesty of this page. There is no deployment of any kind — no Dockerfile, no
`vercel.json`, no host configuration anywhere in the repository. The only
environment is [local](srn://metaframework/environment/local), and the only
address that has ever served a byte of this portal is `localhost:3000`. A
product page claiming `active` would be claiming production, and there is none.

Two corrections to that paragraph, both dated 2026-08-20. **`.github/` now
exists** — it used to be named above as evidence of no deployment, and it is a
CI workflow rather than a deployment, so the conclusion stands and the evidence
had to go. And **this product is about to acquire a second environment it does
not declare**: [devops](srn://metaframework/product/devops) runs the portal on a
Hetzner instance, and both of that product's `topology.yaml` files carry a
comment saying why they may not list it here — membership is authored on the
component side, and correcting this page's declaration is a change to this
product that the work describing devops deliberately did not make. Until it
does, "the only environment is local" is true of what is *declared* and will
stop being true of what *runs*.

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
  — `/api/history`, four read-only operations, reached from the history
  disclosure at the foot of every entity page since `5c865d3`.
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

Two gaps, both greppable, both deliberately modelled rather than tidied away.
A third — `history-panel.tsx` fetching `/api/history` with nothing mounting it —
was closed by commit `5c865d3`, which imports and renders it at the foot of
every entity page
([history-panel](srn://metaframework/product/portal/component/console/component/history-panel)
carries the correction).

- `buildSchemaBundle()` in `src/lib/schema/registry.ts` has no production
  caller — the only importers are `registry.test.ts` and the coverage register.
  It was the API of the schema explorer that Stoplight's `JsonSchemaViewer`
  replaced. The direct consequence is that `W_DM_UNION_TAG`, emitted only inside
  `buildSchemaBundle`, can never reach `/diagnostics`. Its neighbour
  `schemaValidator()` is no longer in that position: `lib/datamodel/datamodel.ts`
  calls it, and `lib/catalog/index.ts` calls that.
- **No test renders a component and no end-to-end harness exists** — there is no
  Playwright, no Cypress and no Testing Library in `package.json`, and
  `find src -name '*.test.tsx'` returns nothing. What that no longer means is
  that `src/components` and `src/app` are untouched: `state-simulator.test.ts`
  asserts the simulator's whole model out of `src/components/diagrams/` without a
  DOM, and two route handlers are called directly as deployed —
  `fixture-check.test.ts` does that for
  `/schemas` and `src/app/artifacts/[...path]/route.test.ts` for `/artifacts`.
  The three routes under `src/app/api/` — history, status, watch — are the ones
  no test imports.

## Ownership

One product, one owner, one author: `git shortlog -sn` on this repository
returns a single name, Sergey Bershadsky. `framework/portal/README.md` is still unedited `create-next-app`
boilerplate, and `AGENTS.md` is the generated Next.js block. The documentation
of this product is this catalog.
