---
name: 0002-dark-only-console
kind: adr
version: 1
title: The portal is a dark-only architect's console
summary: One dark palette, no light theme and no toggle — the console is an instrument panel, not a document reader.
status: review
owner: sergio
decision-status: accepted
date: "2026-08-19"
deciders:
  - sergio
relations:
  uses:
    - /product/portal/component/console
tags:
  - portal
  - design-system
---

## Context

The founding decision record settles the portal's visual direction in one line —
"Linear/Vercel-school dense dark only; electric blue-violet accent" — before any
of it existed. Commit `ef74fe9` (2026-08-19 12:25) turned that into the console
that ships: a blueprint-grid substrate, Archivo for text and IBM Plex Mono for
addresses, and SRNs typeset as first-class copyable strings rather than as
inline code.

The audience is one reader doing one kind of work: opening a catalog to find out
what a system currently is and to judge a change against it. That reader spends
their time on dense structured surfaces — a tree, a graph, a diff, a schema —
not on long-form prose, and they are looking at four diagram canvases whose node
colours have to carry meaning.

## Decision

The portal ships **one** palette and it is dark. There is no light theme, no
`prefers-color-scheme` branch and no theme toggle. `src/app/globals.css` defines
a single set of token values, and every surface in
[console](srn://metaframework/product/portal/component/console) reads from it.

## Consequences

- Nine kind hues can be tuned once, against one background, at matched lightness
  and chroma. Two backgrounds would mean two tunings and a standing risk that a
  kind reads as a different kind in one of them, which would break
  [0003-colour-is-ontology](srn://metaframework/product/portal/adr/0003-colour-is-ontology)
  in the theme nobody was looking at.
- Consumers that cannot read CSS custom properties need only one hex table.
  `lib/ui/console-tokens.ts` holds nine hand-converted values for Monaco and
  mermaid; under two themes it would hold eighteen and would need a runtime
  switch in both renderers.
- A reader who wants light output has none. There is no print stylesheet either,
  so a catalog page printed from a browser prints a dark page or, more likely, a
  broken one. Nobody has tried.
- Third-party stylesheets fight this rather than cooperate with it. Stoplight's
  Mosaic ships its own theme and had to be overridden token by token in
  `stoplight-theme.css`, and its unlayered CSS caused two separate regressions
  ([0005-stoplight-json-schema-viewer](srn://metaframework/product/portal/adr/0005-stoplight-json-schema-viewer)).
- The choice is cheap to revisit for a while and expensive later: the tokens are
  already indirected through CSS custom properties, but nothing outside them has
  ever been tested against a second background.

## Alternatives considered

- **Light and dark with a toggle.** The default expectation for a documentation
  site, and it is what a catalog partly is. Rejected on cost against audience:
  it doubles the palette tuning and the hex mirror for a reader base that is, at
  the time of writing, one person, and none of the nine hues had been proven
  legible on light.
- **Follow `prefers-color-scheme` with no toggle.** Half the cost of a toggle
  and none of the control. Rejected for the same tuning reason, plus a worse
  failure mode: the console would change appearance based on an OS setting the
  reader may not associate with it.
- **A light-only console.** Not seriously considered. Diagram canvases and code
  panes are the majority of the surface, and both are the case dark palettes are
  good at.
