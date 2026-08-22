---
name: entity-view
kind: component
version: 4
title: Entity view
summary: One entity, at whichever version the URL asks for — header, prose, kind fields, relations, contents, artifacts, and the ?v=N historical path.
status: review
owner: sergio
component-type: ui
lifecycle: released
relations:
  uses:
    - /environment/local
  depends-on:
    - /product/portal/component/catalog-loader
    - /product/portal/component/srn
    - /product/portal/component/git-history
    - /product/portal/component/protocol-model
    - /product/portal/component/schema-registry/component/schema-bundler
    - /product/portal/component/console/component/artifact-viewer
    - /product/portal/component/diagrams
  implements:
    - /product/portal/requirement/catalog-renders-without-git
  realizes:
    - /capability/solution-description
tags:
  - ui
  - entity-page
---

The page a reviewer spends their time on: `src/app/(console)/catalog/[...srn]/page.tsx`,
the components under `src/components/entity/`, and five shared
renderers — `kind-badge`, `srn-address`, `entity-link`, `markdown`,
`version-picker`.

## The page

Breadcrumb from `ancestorsOf`, header (kind icon, title, `SrnAddress`, status
and version badges), summary, prose, then five sections: **Details** (kind
frontmatter), **Relations**, **Contents**, the neighbourhood graph, and
**Artifacts**. Loader diagnostics scoped to this SRN are rendered on the page
itself, so an entity's own errors are visible where the entity is, not only on
`/diagnostics`.

Two of those sections are worth naming because they are self-maintaining rather
than hand-listed. `EntityDetails` discovers fields from the kind's zod schema
rather than from a list in the component, and any string value that resolves to
an entity becomes a badge — so a new SRN-valued field added to a kind spec links
itself. `EntityRelations` shows authored outgoing edges and derived inbound ones
side by side, visually distinguished, which is what lets a component page answer
"what breaks if I change this?" without opening anything else.

`EntityChildren` carries a detail worth defending: below the by-kind grouping of
direct children it lists every deeper descendant, flat, and each deep row states
the owners between here and it. Names collide across sub-components — every
component may own an `api` protocol — so the flat list restates as text the
context a tree gives by indentation.

## Prose linking

`Markdown` turns any SRN in the body into a navigable badge, whether it was
written as a markdown link or dropped bare into a sentence, resolved through
`mentionsIn()`. Nothing else is linked: matching bare entity *names* would be
guesswork, and an unresolvable SRN renders as a visibly broken badge rather than
as plain text. The reasoning is recorded in
[0009-srn-only-prose-linking](srn://metaframework/product/portal/adr/0009-srn-only-prose-linking).

## The historical path

`?v=N` is the whole state of this page, and keeping it in the URL rather than in
client state is what makes a historical view shareable — "look at the datamodel
as it was when we agreed the contract" is a link, not a sequence of clicks. The
page calls `getEntityHistory()` and `readFileAtRevision()` from
[git-history](srn://metaframework/product/portal/component/git-history) on the
server; `VersionPicker` only navigates.

Three behaviours make that path honest rather than merely present:

- `loadSnapshot()` re-parses the old `index.md` with gray-matter. When the old
  frontmatter fails **today's** zod schema, `coerceFrontmatter()` falls each
  required field back to the current one and the render is flagged `degraded`
  rather than refused. Refusing would make exactly the oldest, most interesting
  revisions unreachable.
- `HIDDEN_AT_HISTORICAL` names precisely what a historical page omits: incoming
  relations, the neighbourhood graph, contents, artifacts and schema, and loader
  diagnostics. All of those are derived from *other* entities' current state, so
  showing them beside an old document would date-mix. Outgoing edges are
  reconstructed, because they were authored in the document itself; sibling
  artifacts are dropped for the same reason the rest are.
- A `?v=` that cannot be resolved renders `EntityVersionProblem` with the actual
  reason — "no commit carries v4; git knows v1, v2, v3" — or, when git itself is
  unavailable, the `HistoryReason` message and hint that
  [git-history](srn://metaframework/product/portal/component/git-history)
  classified. That degradation is why this component claims
  [catalog-renders-without-git](srn://metaframework/product/portal/requirement/catalog-renders-without-git):
  with no git binary the picker collapses to a plain badge and the page still
  renders.

The version list costs one `git log` plus one `git show` per commit and the page
pays for it unconditionally, because the picker sits in the header and "an
affordance that only appears after a round trip is an affordance most readers
never discover".

## Artifact dispatch

`EntityArtifacts` is where the file becomes the unit. Dispatch is by
entity kind **and** filename: `schema.json` counts as a shape only on a
datamodel, `workflows/*.yaml` only on a protocol, `states.json` only on a
protocol. A renderer that understands the artifact contributes a drawing; one
that does not contributes nothing and the source is still shown; a file that
will not parse still gets a block, with the parser's complaint above the lines
that caused it. The kind's primary artifact is promoted and opened; everything
else arrives collapsed, because a page that opens twelve editors opens slowly.

The blocks themselves, the schema view and the lineage footer belong to
[artifact-viewer](srn://metaframework/product/portal/component/console/component/artifact-viewer);
the drawings to
[diagrams](srn://metaframework/product/portal/component/diagrams). This
component owns only the decision of which of them a given file gets.

## What is absent

There is no time travel over anything but `index.md`. Artifacts, the graph and
the contents list have no historical form, and there is no diff view on this
page — [history-panel](srn://metaframework/product/portal/component/console/component/history-panel)
was built for that and is mounted nowhere.

Nothing on an entity page mentions the schema serving route. Grepping `src` for
`/schemas/` outside `app/schemas/` and `lib/schema/` finds only tests, so a
datamodel page never shows the reader the URL an outside tool would fetch.

No test covers this page or any component under `src/components/entity/`.
