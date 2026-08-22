---
name: solution-map
kind: component
version: 3
title: Solution map
summary: A whole solution as structure only, laid out in polar coordinates around a focus that the reader moves by clicking.
status: review
owner: sergio
component-type: ui
lifecycle: released
relations:
  uses:
    - /environment/local
  depends-on:
    - /product/portal/component/diagrams/component/diagram-kit
    - /product/portal/component/catalog-loader
  implements:
    - /product/portal/requirement/every-diagram-has-a-text-equivalent
tags:
  - diagrams
  - map
---

`src/components/diagrams/solution-map.tsx` plus the two routes
`src/app/(console)/map/page.tsx` and `map/[solution]/page.tsx`. It is the only
whole-catalog view in the portal, and the only diagram that does not use ELK.

## Structure only

`MAP_KINDS` is exactly `CONTAINER_KINDS` — solution, product, component. Nothing
else is drawn. Crossing edges are the `depends-on` and `uses` relations between
those containers. A protocol or a datamodel on this canvas would answer a
question the entity pages already answer better and would double the node count
doing it.

One route per solution, not a client-side switcher: "which solution am I looking
at" is the coarsest state on the page, a solution is a sealed universe so nothing
here can ever cross the boundary, and a shared link has to land on the same map.
`/map` itself holds nothing and redirects to the first solution — "a map is
always a map OF something".

## Polar, and why the geometry is stored that way

Depth is radius. The map answers "what is around this thing", and the honest
shape of that question is a centre with rings. Containment wins when two paths
reach a node at the same depth, so the ring a node sits on is its position in
the structure whenever the structure can explain it.

Re-centring is the interaction: clicking a node recomputes the neighbourhood and
the map **rotates** into place, because angle and radius are interpolated
separately. Tweening x and y instead would slide every node along a straight
line through the middle of the canvas, which reads as a list being re-sorted
rather than as a structure seen from somewhere else. Opening the entity is a
separate affordance on the focused node — "a map you cannot explore without
leaving it is not a map". The geometry lives in
[diagram-kit](srn://metaframework/product/portal/component/diagrams/component/diagram-kit)
and is the tested half; the paint is here and is not.

## Two edge languages, no colour

Containment is solid, thicker, higher contrast and drawn straight, so it reads
as the skeleton the map hangs on. Dependency is thin, dashed, dimmer and bowed,
so it reads as something crossing that skeleton. Colour is not used to tell them
apart
([0003-colour-is-ontology](srn://metaframework/product/portal/adr/0003-colour-is-ontology)).

Off-branch entities recede rather than disappear, so the focused branch has
visible context.

## Text equivalent

`describe()` emits one line per ring — `2 steps away: checkout, inventory.` —
then one sentence per crossing edge, then, deliberately, a line naming the nodes
that are visually receded. That last line exists because "visual recession has to
be said out loud, or a reader who is not looking at the canvas gets a flat list
where a sighted reader sees a subject and its context". No test asserts any of
it.

## What is absent

The map has no filters, no lens, no search and no way to hide an edge language.
It cannot be exported. It does not show actors, environments, protocols,
datamodels, ADRs or requirements, so a reader looking for "everything in this
solution" is still looking at the rail.

Nothing in the founding decision record authorises this view: it deferred a
"global graph view", and the deferral was lifted in commit `1368318`
(2026-08-19 21:18) without a record of its own. This paragraph is where that is
written down.
