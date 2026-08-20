---
name: 0008-one-hop-neighbourhood-graph
kind: adr
version: 1
title: The entity graph is one hop, and only one hop
summary: An entity page draws what it touches and what touches it — never the transitive closure, because a whole-solution graph answers no question.
status: review
owner: sergio
decision-status: accepted
date: "2026-08-19"
deciders:
  - sergio
relations:
  uses:
    - /product/portal/component/diagrams/component/relation-graph
    - /product/portal/component/console/component/entity-view
tags:
  - portal
  - diagrams
---

# The entity graph is one hop, and only one hop

## Context

Frontmatter `relations` plus the loader's derived inbound index give the portal a
complete directed graph over every entity in the catalog — 197 of them when
commit `36d504c` (2026-08-19 13:42) wired diagrams into entity pages and had to
choose how much of that graph an entity page shows, and 280 once this solution
described itself. The number only ever grows, which is the point.

Drawing all of it is the tempting answer and a bad one. A graph on that scale is
a hairball: it is impressive, it is unreadable, and no question a reviewer
arrives with is answered by it. The founding decision record had already deferred a
"global graph view" for the same reason.

## Decision

The neighbourhood graph on an entity page is exactly one hop. `entity-graph.tsx`
takes the entity's resolved outgoing relations and its inbound edges, adds
nothing further, and hands that to
[relation-graph](srn://metaframework/product/portal/component/diagrams/component/relation-graph).
The docstring states the reasoning in the code: "a whole-solution graph is a
hairball that answers no question, whereas *what does this touch, and what
touches it* is exactly what a reviewer opens a component page to find out."

## Consequences

- **The drawing is bounded by the entity's own degree**, so it stays readable on
  a hub component without any density control, thinning heuristic or zoom.
- **It disappears when it would say nothing.** `entity-graph.tsx` returns `null`
  below two relations: a single edge is a sentence, and the relations list above
  already says it better than a picture with two boxes.
- **Transitive reachability is not visible anywhere on an entity page.** "What
  eventually depends on this?" is a question the portal cannot answer — a reader
  answers it by clicking through, one hop at a time, or by `grep`.
- **The reader has to move to get context.** Every neighbour is a link, and
  navigating turns the neighbour into the new centre. That is the intended
  motion, and it is also the whole navigation model: there is no expand-in-place
  affordance and no depth control.
- **The deferral it leaned on was lifted four hours later, without its own
  record.** Commit `1368318` shipped a solution map at `/map`, which is the
  global view the founding record deferred. It survives this decision only
  because it answers a different question: the map draws containment plus
  `depends-on`/`uses` crossings over containers alone (`MAP_KINDS =
  CONTAINER_KINDS`), never the full edge set, and it recentres rather than
  showing everything at once. Recording that here is the honest version — the
  deferral moved, and no ADR was written when it did.

## Alternatives considered

- **Two hops, or a depth control.** Rejected on the same grounds one step later:
  two hops from a hub component is already dozens of nodes, and a depth slider
  makes the reader tune a picture instead of reading one. Nobody measured where
  the breakdown actually starts.
- **A whole-solution graph on every page, focused on the current entity.** This
  is what the solution map eventually became, at `/map`, restricted to containers
  and with a polar layout that recedes what is far away. As an entity-page
  drawing it was rejected: the same hairball, plus a highlight.
- **No graph at all — the relations list is already complete.** Genuinely
  arguable, since the list carries every edge with its type and direction, and
  the graph adds only shape. Kept because the shape is the part prose is worst
  at: a cycle, a fan-in, or a component that only ever appears as a target reads
  instantly in the drawing and slowly in the list.
