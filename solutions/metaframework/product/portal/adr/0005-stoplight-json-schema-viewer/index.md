---
name: 0005-stoplight-json-schema-viewer
kind: adr
version: 2
title: Render schemas with Stoplight's JsonSchemaViewer
summary: A datamodel's schema is drawn by a third-party viewer rather than by a hand-written explorer — bought once, paid for three times in the cascade.
status: review
owner: sergio
decision-status: accepted
date: "2026-08-19"
deciders:
  - sergio
relations:
  uses:
    - /product/portal/component/console/component/artifact-viewer
    - /product/portal/component/schema-registry
tags:
  - portal
  - schemas
---

## Context

A datamodel page has to show a JSON Schema in a form a reviewer can read: nested
objects expandable, `$ref` targets resolved, `allOf` composition visible,
required and optional distinguished. The portal first did this itself —
`src/components/schema/schema-explorer.tsx` was a hand-written explorer with
three views (effective fields, inheritance, raw), rendering a precomputed
`SchemaBundle` from
[schema-registry](srn://metaframework/product/portal/component/schema-registry).

That file was several hundred lines of tree-rendering, badge and expansion state
solving a problem that is entirely generic — it knew nothing about this
framework, only about JSON Schema 2020-12. Commit `bae08e4` (2026-08-19 13:08)
adopted Stoplight's viewer alongside it; commit `1368318` deleted the hand-written
explorer and its `type-badge.tsx` when the artifact block became the single home
for a file's drawing and its source.

## Decision

Schema rendering is Stoplight's. `@stoplight/json-schema-viewer` (`^4.16.4`) draws
every datamodel's `schema.json`, wrapped in
`src/components/schema/stoplight-schema-view.tsx` and loaded client-only, because
Mosaic touches `document` at module scope and would break server rendering. Three
further `@stoplight/*` packages come with it — `mosaic`, `mosaic-code-viewer`,
`markdown-viewer`.

## Consequences

- **The portal stopped owning a JSON Schema renderer.** Composition, expansion,
  `$ref` display and type badges are somebody else's problem now, and the
  portal's own schema code is free to be about identity and validation instead.
- **Its stylesheet fought the console three separate times, and each fix is
  still load-bearing.** Mosaic's CSS is unscoped: it sets Inter globally,
  redefines `--font-mono`, and resets heading sizes to `inherit`.
  1. `bae08e4` — "its unscoped 285KB stylesheet was silently overriding the
     portal's fonts globally"; the fix was to re-assert the portal's tokens
     unlayered.
  2. `3c39c20` — Mosaic had flattened every prose heading to body size, because
     unlayered CSS outranks every cascade layer; the fix was to import it into a
     `stoplight` cascade layer declared first.
  3. `1368318` — that layer sat *below* Tailwind's preflight, which zeroes
     `margin` and `padding` on `*`, so every `sl-p*`/`sl-m*` utility computed to
     zero (`sl-pl-3` → padding 0) and the viewer rendered with property names
     fused to their types.
  The standing cost is the 18-line comment and the single `@layer theme, base,
  stoplight, components, utilities;` declaration at the top of
  `src/app/globals.css`, which must come before the Tailwind import and whose
  position is the fix for both failures 2 and 3.
- **A second stylesheet exists only to re-dress the widget.**
  `src/components/schema/stoplight-theme.css` overrides Mosaic's own theme so the
  viewer looks like the rest of the dark console.
- **The viewer flattens `allOf`, which loses provenance.** A field inherited from
  a base schema is shown as if the child declared it. `src/lib/schema/lineage.ts`
  and `schema-lineage.tsx` exist for no other reason than to rebuild that one
  fact and show it beside the viewer — see
  [artifact-viewer](srn://metaframework/product/portal/component/console/component/artifact-viewer).
- **Deleting the hand-written explorer stranded two registry functions.**
  `buildSchemaBundle()` and `schemaValidator()` in `lib/schema/registry.ts` were
  its API and now have no production caller; only `registry.test.ts` imports
  them. The concrete loss is that `W_DM_UNION_TAG`, which is emitted only inside
  `buildSchemaBundle`, can no longer reach the diagnostics page by any path.
- **Four dependencies and a client-only boundary** for a widget that appears on
  datamodel pages alone.
- **It writes to the console on pages that are not wrong, and half of that is
  outside our reach.** Two separate faults, measured on
  `/catalog/metaframework/product/specification/datamodel/entity-frontmatter`:
  1. *Fixed.* The viewer imports `useUpdateAtom`/`useAtomValue` from
     `jotai/utils`, which jotai 1.12.0 turned into shims that `console.warn` on
     every call — 90 to 252 identical `[DEPRECATED]` lines per datamodel page.
     `overrides: { "jotai": "1.11.2" }` in `framework/portal/package.json` pins
     the last release before the shim. It is behaviour-preserving and that is
     checked, not assumed: ignoring comments, jotai's `esm/index.mjs` and
     `index.js` are byte-identical between 1.11.2 and 1.13.1, and `utils` differs
     only in the wrapper. Zero warnings after; the viewer renders the same 102
     rows. Drop the override when the viewer stops importing the deprecated
     names.
  2. *Not fixable from outside.* `JsonSchemaViewer` renders a top-level combiner
     with Mosaic's `Menu`, whose `renderTrigger` callback is invoked with
     `{ isOpen }`; the viewer's own callback spreads that object straight onto
     `Pressable`, which merges unknown props into the DOM element it clones. So
     React logs *"does not recognize the `isOpen` prop on a DOM element"* — a
     console **error**, which raises the dev overlay's issue badge — on every
     datamodel whose schema root is a `oneOf`/`anyOf`. That is 7 of the 66
     schemas in the catalog today, `entity-frontmatter` among them. The offending
     JSX is inside `@stoplight/json-schema-viewer`, so no wrapper or prop filter
     of ours sits between it and React, and 4.16.4 is the latest release
     (published 2025-07-18), so there is no version to bump to. It stands as a
     known dependency risk: a dev-only console error we do not own, on a widget
     we chose the same afternoon we adopted it.

## Alternatives considered

- **Keep the hand-written explorer.** It fitted the console's type system
  exactly and cost no cascade fights. Rejected because it was generic work: the
  three views it offered were re-implementations of what a maintained viewer
  already does, and every JSON Schema keyword the spec later allows would have
  been the portal's problem to draw.
- **Show the raw JSON in Monaco and nothing else.** The source is shown anyway,
  in the same artifact block. Rejected because a 200-line schema with four
  `$ref`s is not reviewable as text — following a reference means scrolling to
  another file — and resolution is precisely what the registry already did on
  the server.
- **A different third-party viewer.** No comparison was run. Stoplight was
  picked, adopted the same afternoon, and the cascade problems were discovered
  after rather than weighed before.
