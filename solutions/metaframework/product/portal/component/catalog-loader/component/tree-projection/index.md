---
name: tree-projection
kind: component
version: 1
title: Tree projection
summary: The serialisable TreeNode view of the entity graph and its four lenses — a component because it exists to cross the RSC boundary, not to load anything.
status: review
owner: sergio
component-type: library
tags:
  - rsc
  - navigation
---

# Tree projection

`src/lib/catalog/tree.ts`, 306 lines, with a 376-line test. `buildTree()` turns
the loaded `Catalog` into `TreeNode` — srn, name, title, kind, status, version,
owner, children, and one boolean saying whether the entity itself carries an
error diagnostic. That is the whole shape.

## Why it is separate from the loader

Not because it is big, and not because it is in its own file. It exists for a
boundary: the navigation rail is a client component, and sending the entity
graph across the RSC boundary would ship every entity's prose, artifacts,
resolved relations and diagnostics to the browser on every page. `TreeNode` is
the smallest projection the sidebar can be built from, and building it is a
different job from loading — the loader would still be correct if nothing ever
drew a tree.

## The lenses

`TREE_LENSES` is `['hierarchy', 'kind', 'status', 'owner']`, closed and
exported, and the tree groups **within each branch** rather than flattening the
catalog. That is a decision with a stated reason: a flat grouping dissolves the
one thing an SRN encodes, and a datamodel six levels down would appear as a
sibling of a solution.

`KIND_ORDER` fixes sibling order across every lens — containers first, then
behaviour (protocol, datamodel), then participants (actor, environment), then
the paperwork (requirement, adr). It is exhaustive over the ontology, `solution`
included, because the Kind lens buckets the root like any other level.

## What lives next door instead

The rail's own state — filters, focus, the `localStorage` preferences read
through `useSyncExternalStore` and re-validated on read — is in
`components/catalog-tree.tsx` and belongs to the console, not here. This module
is pure: given a catalog it returns a value, and it has never touched the DOM.
