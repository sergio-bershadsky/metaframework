---
name: history-service
kind: component
version: 2
title: History service
summary: Four read-only git operations behind /api/history — live, reachable, and with zero callers inside the application today.
status: review
owner: sergio
component-type: service
lifecycle: released
relations:
  exposes:
    - /product/portal/protocol/catalog-history
  depends-on:
    - ../git-history
  uses:
    - /environment/local
tags:
  - http
  - history
---

# History service

`src/app/api/history/[...path]/route.ts`, 90 lines. `GET` only, `runtime =
'nodejs'` because `child_process` rules out the edge runtime, `dynamic =
'force-dynamic'`.

Like [schema-service](srn://metaframework/product/portal/component/schema-service)
it takes `component-type: service` as the nearest available value and is not
one: it is a route handler in the console's own process.

## Four operations

| `op`    | Needs        | Returns                                    |
| ------- | ------------ | ------------------------------------------ |
| `log`   | —            | the entity's revisions and version index   |
| `files` | `commit`     | the entity's files at that commit          |
| `show`  | `commit?`    | one file's content at a revision           |
| `diff`  | `commit`     | a diff against `parent`, `worktree`, or another hash |

Everything is a whitelist: `safeCatalogPath()` on the catch-all segments (not
re-decoded — Next has already decoded them once), `isCommitHash()` on `commit`
and on `against`, a closed `switch` on `op`, and a 400 with a reason for
anything else. `Cache-Control` splits on whether the answer can change: a
commit-pinned read is `private, max-age=600`, a worktree read is `no-store`.

## The reason this component exists as an entity

**Nothing in the application calls it.** The only code in `src` that fetches
`/api/history` is `components/history/history-panel.tsx`, and nothing imports
that file. `grep -rn HistoryPanel src` returns three hits, all inside its own
definition; `git log -S HistoryPanel` returns exactly one commit, `4aa3f68`,
which is also the only commit that ever touched `src/components/history/`. It
was added and never mounted.

So this route is live, reachable, tested only through its dependency's suite,
and has no in-app caller. The entity page does not use it either: the version
picker reads history **server-side** through
[git-history](srn://metaframework/product/portal/component/git-history) and
keeps the selected version in `?v=N`, deliberately, so a historical view is a
shareable URL rather than client state.

Recording that is the point. A catalog that quietly omitted an endpoint with no
callers would be describing a tidier system than the one in the repository, and
the conversation it participates in —
[catalog-history](srn://metaframework/product/portal/protocol/catalog-history) —
is modelled precisely so the gap has an address.

## What is missing

No test file. No rate limit, no auth, and none is warranted while the only
reachable deployment is `localhost`. No write operation of any kind, by design:
the portal is a read-only renderer over the tree, and review is git-native.
