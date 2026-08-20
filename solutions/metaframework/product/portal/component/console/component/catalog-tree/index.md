---
name: catalog-tree
kind: component
version: 2
title: Catalog tree
summary: The navigation rail — four lenses over the same tree, text and facet filters, focus, and preferences read through an external store.
status: review
owner: sergio
component-type: ui
lifecycle: released
relations:
  uses:
    - /environment/local
  depends-on:
    - /product/portal/component/catalog-loader/component/tree-projection
tags:
  - ui
  - navigation
---

# Catalog tree

`src/components/catalog-tree.tsx`, 866 lines, the single client component in the
rail. It renders the `TreeNode` projection that
[tree-projection](srn://metaframework/product/portal/component/catalog-loader/component/tree-projection)
builds; it never sees the entity graph, and that is the whole reason the
projection exists.

## Four lenses over one tree

`TREE_LENSES` is `hierarchy | kind | status | owner`. `hierarchy` is the
identity transform, so the rail has one code path rather than two that would
have to agree. The other three group **within each branch** rather than
flattening the catalog: a bucket appears at the level its members are siblings
at, and grandchildren get their own buckets one level down. A bucket's count is
its direct members only — "counting them here would promise rows this bucket
does not hold".

Bucket order is the lens's own: ontology order for kinds, lifecycle order for
statuses, alphabetical for owners with the unowned bucket last. A level whose
members all land in one bucket still shows that bucket, because the lens is a
stated intent and silently collapsing it would misreport how many groups exist.

## Filters and focus

Three filters compose: a text query matched against entity names (the match is
highlighted with `<mark>` in the row), a kind facet, and a status facet. A
`focus` SRN narrows the tree to one subtree. While filtering, expansion state
switches from per-node `useState` to an override map keyed by a `filterSignature`
— everything opens by default, and a manual collapse survives only until the
filter changes.

## Preferences are an external store, not state plus an effect

Lens, focus, kind and status filters live in `localStorage` under
`metaframework.tree` and are read through `useSyncExternalStore`. The docstring
gives the reason plainly: the state-plus-effect version renders once with the
defaults and then sets state — a cascading render React now flags — and it
silently disagrees with a second tab. Here the server snapshot *is* the
defaults, so hydration matches; the client snapshot is whatever storage holds;
and a `storage` event from another tab is just another change to publish.

Every stored value is re-validated on read against `ENTITY_KINDS`, `STATUSES`
and `isTreeLens`, so a preference written by an older build cannot resurrect a
kind, a status or a lens this build no longer has. A corrupt JSON blob falls
back to the defaults rather than breaking navigation, and a `localStorage` that
throws outright (denied storage) is treated as empty.

Note that the text query is *not* persisted — it is ordinary `useState`. A
filter you typed is a momentary act; a lens is a way of working. Nothing in the
code says so, so it is said here.

## What it does not do

There is no full-text search: the query matches entity `name` only, not titles,
summaries or prose. Whole-catalog search is on the founding record's deferred
list and no route or index exists for it.

There is no drag, no reordering, no multi-select and no persistence of scroll
position. The rail is read-only, like the rest of the portal.

No test covers this file. Its inputs — `applyLens`, `filterTree`,
`countMatches`, `matchesFilters` — are tested in `src/lib/catalog/tree.test.ts`;
everything this component adds on top of them is not.
