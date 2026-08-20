---
name: history-panel
kind: component
version: 2
title: History panel
summary: The commit list, file picker and diff view over /api/history — complete, the endpoint's only client, and rendered by nothing.
status: review
owner: sergio
component-type: ui
lifecycle: in-development
relations:
  uses:
    - /product/portal/protocol/catalog-history
tags:
  - ui
  - history
  - dead-code
---

`src/components/history/history-panel.tsx` (458 lines) and `diff-view.tsx`
(217 lines). It is the only code in the repository that fetches
`/api/history`, and nothing in the repository renders it.

## It is not mounted

Grepping the whole of `src` for `HistoryPanel` returns its own definition and
nothing else. `git log -S HistoryPanel -- framework/portal/src` returns exactly
one commit, `4aa3f68` (2026-08-19 13:14) — the same commit that created
`src/components/history/`. It was written and never wired.

Two consequences follow and both are facts about the system rather than about
this file. First,
[history-service](srn://metaframework/product/portal/component/history-service)
is live, reachable and has zero in-app callers. Second, the conversation
described by
[catalog-history](srn://metaframework/product/portal/protocol/catalog-history)
is one nothing currently holds — this component authors the `uses` edge that
makes it a protocol with two named ends, and the edge is accurate about intent
and silent about traffic.

This component is modelled deliberately. A catalog that quietly omitted 675
lines of finished, unreachable UI would be describing the system somebody meant
to build.

## What it would do

Four read-only operations against
[history-service](srn://metaframework/product/portal/component/history-service),
each one `op=`: `log` for the commit list of an entity directory, `files` for
what a commit touched, `show` for a whole file at a revision, `diff` for a
unified diff against the parent commit or against the working tree.

It fetches on expand rather than on render, because git is a subprocess per read
and an entity page must not pay for history nobody opened. The same laziness is
what would make the degraded case cheap: a catalog outside git costs one failed
`rev-parse` and renders an explanation.

The file picker unions the entity's files as they exist now with the files
present at the selected revision, and marks the ones that were not there yet —
so a file added in a later commit shows as absent rather than as an error.

`DiffView` renders a unified diff as a real table, and carries the console's
colour rule into a place it is easy to break: added lines borrow the environment
hue (the only green in the system), removed lines the destructive red, so a diff
never introduces a colour that means nothing elsewhere
([0003-colour-is-ontology](srn://metaframework/product/portal/adr/0003-colour-is-ontology)).
The `+`/`-` glyphs are `aria-hidden` and each row carries a screen-reader word,
because a diff read aloud as bare source is worthless.

## Why the entity page does not use it

[entity-view](srn://metaframework/product/portal/component/console/component/entity-view)
has its own historical path and does not go through this panel or through the
HTTP route: it calls `getEntityHistory()` and `readFileAtRevision()` on the
server and drives everything off `?v=N`. So the portal has two history designs —
one server-rendered, shareable and shipped; one client-fetched, richer and
unmounted — and only the first is reachable.

Which of the two should survive is not recorded anywhere, and this document does
not decide it.

## What is absent

No environment edge. Every other UI component in this product declares
[local](srn://metaframework/environment/local), because that is where it runs;
this one runs nowhere, and claiming an environment for unreachable code would be
the one lie the entity exists to avoid. The `component-type` enum has no value
for "built but not wired", so the fact is carried here in prose.

No test, no story, no screenshot. Nothing has ever rendered it, including a test
runner.
