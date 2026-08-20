---
name: console
kind: component
version: 1
title: Console
summary: The console chrome and the design tokens every other surface reads — shell, masthead, ontology hues, and the one hex mirror of the palette.
status: review
owner: sergio
component-type: ui
relations:
  uses:
    - /environment/local
  depends-on:
    - /product/portal/component/catalog-loader
    - /product/portal/component/catalog-loader/component/tree-projection
tags:
  - ui
  - design-system
---

# Console

The frame everything else in the portal is drawn inside, plus the token layer
that decides what a colour means. Five files carry it:
`src/app/(console)/layout.tsx`, `src/components/app-shell.tsx` (57 lines),
`src/components/diagnostics-indicator.tsx` (43 lines), `src/app/globals.css`
(414 lines) and `src/lib/ui/{kind,console-tokens}.ts` (132 + 22 lines).

## The shell

`AppShell` is a `h-dvh` column: a 48px masthead, then a row of a fixed 288px
(`w-72`) rail holding [catalog-tree](srn://metaframework/product/portal/component/console/component/catalog-tree)
and an unconstrained `main`. The main column is deliberately *not* centred or
max-width-clamped — the comment on it says why, and the reason is
[diagrams](srn://metaframework/product/portal/component/diagrams): a solution
map inside a 65ch measure is not a map.

The masthead carries three things and nothing else: the entity and solution
count read straight off the loaded catalog, a link to `/map`, and the
error/warning counts from `catalog.diagnostics`. The map gets its own way in
rather than a tree node because, as the code comment puts it, "the rail answers
*where is X*; the map answers *how is this put together*".

`AppShell` is a server component that awaits `getCatalog()` and calls
`buildTree()` itself, which is why this component depends on both
[catalog-loader](srn://metaframework/product/portal/component/catalog-loader)
and its
[tree-projection](srn://metaframework/product/portal/component/catalog-loader/component/tree-projection):
the rail receives a serialisable projection, never the entity graph.

## Colour is ontology

The palette rule is stated at the top of `globals.css` and enforced by
convention alone: each of the nine entity kinds owns one hue at matched
lightness and chroma, and nothing else in the UI is coloured. `lib/ui/kind.ts`
is the single table — label, CSS variable, text/bg/border class, lucide icon,
and a one-line blurb per kind — and every badge, tree row, diagram node and
graph edge reads from it. The decision has its own record,
[0003-colour-is-ontology](srn://metaframework/product/portal/adr/0003-colour-is-ontology);
the dark-only console has
[0002-dark-only-console](srn://metaframework/product/portal/adr/0002-dark-only-console).

`lib/ui/console-tokens.ts` is the awkward half of that rule and is worth reading
as an artefact of it. Monaco parses theme colours as hex and cannot read a CSS
custom property; mermaid's `themeVariables` are the same kind of consumer. So
nine oklch tokens are hand-converted to hex once, in one file, each annotated
with the token it came from — "two hand-converted copies of the palette is how a
console drifts out of tune with itself". Nothing regenerates them; if a token in
`globals.css` moves, this file does not notice.

## The cascade-layer declaration

`globals.css` opens with `@layer theme, base, stoplight, components, utilities;`
before the Tailwind import, and the 18-line comment above it is the most
expensive thing in this component. Stoplight's Mosaic stylesheet is unscoped: it
sets Inter globally, redefines `--font-mono`, and resets heading sizes to
`inherit`. Unlayered, it beats every Tailwind utility. Layered too low — below
`base` — Tailwind's preflight zeroes `margin`/`padding` on `*` and every one of
Mosaic's own `sl-p*` utilities computes to zero. Both failures happened, in that
order, and both are recorded in
[0005-stoplight-json-schema-viewer](srn://metaframework/product/portal/adr/0005-stoplight-json-schema-viewer).

## What is not here

There is no light theme and no theme toggle: the dark palette is the only one
defined, so "dark mode" is not a mode.

Fourteen shadcn/ui primitives sit in `src/components/ui/`. Twelve have zero
importers anywhere in `src` — badge, breadcrumb, card, collapsible, dialog,
input, scroll-area, separator, skeleton, table, tabs, tooltip; only `button`
(1 importer) and `dropdown-menu` (2) are used. That is generated scaffolding,
not a design system, and it is recorded here rather than modelled as a part of
the system.

No component in this subtree is tested. All 16 vitest files live under
`src/lib/**`; `find src -name '*.test.tsx'` returns nothing. Everything below —
the shell, the rail, the entity page, the editors, the four diagrams — is
verified by looking at it.

## Sub-components

- [catalog-tree](srn://metaframework/product/portal/component/console/component/catalog-tree)
  — the navigation rail: four lenses, filters, focus, persisted preferences.
- [entity-view](srn://metaframework/product/portal/component/console/component/entity-view)
  — the entity page, including the `?v=N` historical path.
- [artifact-viewer](srn://metaframework/product/portal/component/console/component/artifact-viewer)
  — Monaco source panes, the schema view, and the diagram↔source join.
- [history-panel](srn://metaframework/product/portal/component/console/component/history-panel)
  — built, and mounted nowhere.
- [diagnostics-report](srn://metaframework/product/portal/component/console/component/diagnostics-report)
  — the integrity gate that stands in for the CLI there is none of.
