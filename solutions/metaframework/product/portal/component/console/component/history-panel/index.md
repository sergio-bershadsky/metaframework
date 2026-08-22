---
name: history-panel
kind: component
version: 3
title: History panel
summary: The commit list, file picker and diff view over /api/history — the endpoint's only client, and since 5c865d3 a closed disclosure at the foot of every entity page.
status: review
owner: sergio
component-type: ui
lifecycle: released
relations:
  uses:
    - /environment/local
    - /product/portal/protocol/catalog-history
tags:
  - ui
  - history
---

`src/components/history/history-panel.tsx` and `diff-view.tsx` beside it. It is
the only code in the repository that fetches `/api/history`, and it renders on every entity page.

## It was not mounted, and now it is

Through v2 this document said the opposite, and said it with evidence: grepping
`src` for `HistoryPanel` returned its own definition and nothing else, and
`git log -S HistoryPanel` returned exactly one commit — `4aa3f68`, the commit
that created `src/components/history/`. Both facts were true when written.

Commit `5c865d3` wired it. `src/app/(console)/catalog/[...srn]/page.tsx`
imports `HistoryPanel` and renders it at the foot of the article, unconditionally,
for every entity in every solution. The entity document was not touched in that
commit and stayed stale for a day, carrying `lifecycle: in-development`, a
`dead-code` tag, and a paragraph explaining why declaring an environment would
be a lie.

`W_COMP_NO_ENVIRONMENT` is what found it. The check reads T2 — a `ui` SHOULD
declare at least one environment — and had no way to know the omission was
argued for in prose two screens below; it asked the question anyway, and the
answer had changed. That is the whole case for a warning whose fix is sometimes
"the description is out of date" rather than "add the edge": the edge is the
only half a machine can compare against the code.

## What it does

Four read-only operations against
[history-service](srn://metaframework/product/portal/component/history-service),
each one `op=`: `log` for the commit list of an entity directory, `files` for
what a commit touched, `show` for a whole file at a revision, `diff` for a
unified diff against the parent commit or against the working tree.

It fetches on expand rather than on render, because git is a subprocess per read
and an entity page must not pay for history nobody opened. The same laziness is
what makes the degraded case cheap: a catalog outside git costs one failed
`rev-parse` and renders an explanation. `initialHistory` is the one exception
and it is free — the page already read the log to build its version picker, so
handing that result down labels the closed disclosure ("4 revisions", or why
there are none) without adding a git call.

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

## Two history designs, both now reachable

[entity-view](srn://metaframework/product/portal/component/console/component/entity-view)
keeps its own historical path and does not go through this panel or the HTTP
route: it calls `getEntityHistory()` and `readFileAtRevision()` on the server and
drives everything off `?v=N`. That path is server-rendered and shareable; this
one is client-fetched and richer, and the same page now carries both — the
picker in the header answers "show me v2", the disclosure at the foot answers
"what actually changed, and when".

Which of the two should survive is still not recorded anywhere, and this
document still does not decide it. What has changed is that the question is no
longer academic: both are shipped, and a reader meets both.

## What is still absent

No test, no story, no screenshot. `src/components/history/` has no test file
beside it, and the panel's behaviour — the fetch-on-expand, the file-picker
union, the `HistoryReason` branches — is exercised by nothing but a person
opening it. That gap did not close when the mount landed, and it is now a gap in
shipped UI rather than in unreachable code.
