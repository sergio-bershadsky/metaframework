---
name: artifact-viewer
kind: component
version: 4
title: Artifact viewer
summary: Monaco source panes and the JSON Schema view, joined to their drawings by a line index built from the file's own parse tree.
status: review
owner: sergio
component-type: ui
lifecycle: released
relations:
  uses:
    - /environment/local
  depends-on:
    - /product/portal/component/srn
    - /product/portal/component/schema-registry
tags:
  - ui
  - editor
---

The pane that shows a catalog file as itself. Seven files under
`src/components/code/` — `artifact-block.tsx` (433), `source-view.tsx` (199),
`monaco.ts` (325), `code-block.tsx` (141), `anchor-link.tsx` (41) and the two
worker entry points — plus `src/lib/artifacts/{source-map,anchors,language}.ts`
(207 + 82 + 15). The schema half lives in `src/components/schema/`
(`stoplight-schema-view.tsx`, `schema-lineage.tsx`, `stoplight-theme.css`) and
`src/lib/schema/lineage.ts` (280).

Which files an entity gets a block for is decided by
[entity-view](srn://metaframework/product/portal/component/console/component/entity-view);
this component owns what a block *is*.

## The block

One artifact, one block, carrying both its drawing and its source: side by side
when the column is wide enough, tabs when it is not, never two disconnected
sections. The failure it was built to fix is recorded in the file — a protocol
page used to render `workflows/place-order.yaml` twice, as a diagram near the
top and as raw YAML at the bottom, with nothing saying they were the same file.

## The diagram↔source join

This is the part with real machinery behind it, and it is three modules deep.

`source-map.ts` uses `yaml`'s `parseDocument`, which keeps a character range on
every node, to map a path into a document to a 1-based line span. Because YAML
1.2 is a strict JSON superset, the same pass indexes `states.json` and
`schema.json` — one mechanism, not one per format. It knows nothing about
diagrams.

`anchors.ts` owns the diagram vocabulary and is the only module that speaks
both. For a workflow it is barely a translation at all: a step's positional path
(`steps[4].alt[0].steps[2]`) *is* its path through the YAML, because the
workflow mini-spec keys steps positionally, so the mapping is a parse. For a
state chart it maps state ids and transition edge ids back to the lines that
declared them.

`anchor-link.tsx` carries the join at runtime as a React context rather than a
prop, for a structural reason: the visual is a server component built beside the
parsed artifact, while the editor and the selection state are client-side, and a
server component can be passed to a client component but cannot be handed
callbacks afterwards. Hovering a diagram element lights its lines; moving the
caret lights the element those lines produce.

`source-map.test.ts` is the only test in this component's surface.

## Monaco, and the three decisions in it

1. **Local, never a CDN.** `@monaco-editor/react` defaults to fetching the AMD
   loader from jsdelivr; `loader.config({ monaco })` hands it the bundled copy,
   because "a catalog that stops rendering its own artifacts when the network is
   unavailable is not a catalog".
2. **Nothing loads until something needs it.** Every import sits behind
   `loadMonaco()`, and contributions and grammars are enumerated rather than
   pulled in wholesale — Monaco's all-in entry brings the TypeScript compiler
   with it. `SourceView` itself is reached through `next/dynamic` with
   `ssr: false`; a closed block renders no editor and, since commit `1368318`,
   does not import the module either. Mount-laziness and import-laziness are
   different questions and only the second is about bytes
   ([0011-lazy-client-modules-and-dev-cache](srn://metaframework/product/portal/adr/0011-lazy-client-modules-and-dev-cache)).
3. **The SRN link provider is ours.** VS Code's JSON language service links
   `$ref` pointers inside the same document and nothing else, so an `srn://` in
   an artifact was dead text. The provider registered here matches two
   spellings — a bare SRN and a canonical schema URL under
   `CANONICAL_SCHEMA_HOST`, resolved back through `schemaUrlToSrn()` — and turns
   both into client-side navigation to that entity's page. Linking only the
   first would leave the one reference a reader actually wants to follow, the
   `$ref` to the base a model extends, unclickable.

`editor.worker.ts` and `json.worker.ts` look orphaned to a
static-import scan. They are referenced only through
`new Worker(new URL('./json.worker.ts', import.meta.url))` in `monaco.ts`,
because that literal-relative-URL form is the only shape a bundler recognises.

Prose fences use `monaco.editor.colorize()` instead of an editor: a document can
hold a dozen fences, and a dozen editors is a dozen scroll containers and a
dozen keyboard traps where Tab types a tab.

## The schema view

A datamodel's `schema.json` is rendered with Stoplight's `JsonSchemaViewer` over
the bundled document, client-only because Mosaic touches `document` at module
scope. The cost of that stylesheet is real and recurred three times; it has its
own record,
[0005-stoplight-json-schema-viewer](srn://metaframework/product/portal/adr/0005-stoplight-json-schema-viewer),
and the cascade-layer fix lives in
[console](srn://metaframework/product/portal/component/console).

`lineage.ts` exists because of what the viewer correctly throws away. Every
viewer worth using flattens `allOf` into the one shape an instance must satisfy,
and flattening erases provenance — in a catalog whose datamodel story *is*
composition, "where did `created-at` come from?" becomes unanswerable. The
module rebuilds that one fact and nothing else, from two structures
[schema-registry](srn://metaframework/product/portal/component/schema-registry)
already computed: the inheritance DAG, and which schema contributes which
property name. It is a companion to the schema view, not a second viewer.

## What is absent

The raw server-rendered source is the only no-JavaScript path to an artifact:
both the Stoplight viewer and the Monaco pane are `ssr: false`, so a reader
without JavaScript sees the file and no shape.

Nothing *here* validates an example against its schema, and that is now a
statement about this component only. `E_DM_EXAMPLE_INVALID` is emitted —
`lib/datamodel/datamodel.ts` compiles a validator per datamodel through
`schemaValidator()` and checks every `examples/` file, reaching `/diagnostics`
through `withDatamodelChecks()`. What this viewer does is render the file, so a
reader looking at an example here still sees no verdict beside it; the verdict is
on the diagnostics page.

Neither the Stoplight view, the lineage footer, nor any file under
`src/components/code/` has a test.
