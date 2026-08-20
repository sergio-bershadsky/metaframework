---
name: git-history
kind: component
version: 1
title: Git history
summary: Every historical read in the portal, shelled out to git through an argv array, classified into four failure reasons, and never permitted to throw.
status: review
owner: sergio
component-type: library
relations:
  depends-on:
    - ../catalog-loader
  implements:
    - /product/portal/requirement/catalog-renders-without-git
tags:
  - git
  - history
---

# Git history

`src/lib/history/git.ts`, 895 lines, the single largest module in `src/lib`.
The catalog keeps only current versions on disk, so every historical read goes
through git.

## Why a subprocess and not a library

What the portal needs from git is deliberately tiny: `log` with a path filter,
`show` of a blob at a commit, and `diff`. That fits the CLI exactly, so this
module shells out rather than adding a libgit binding and a native build step to
a Next.js application.

Every call goes through `execFile` with an **argv array**, never a shell string,
so no catalog path and no commit-ish can be interpreted as shell syntax.
`safeCatalogPath()` rejects control characters, backslashes, absolute paths, any
segment starting with `.` and any segment starting with `-` — the last as
defence in depth, because `--` guards every pathspec the module builds and a
forgotten one must still not reach git as an option. `isCommitHash()` is a
4-to-40 hex test. The environment is pinned read-only: `GIT_OPTIONAL_LOCKS=0` so
`diff` cannot refresh and thus rewrite the index, `GIT_TERMINAL_PROMPT=0` so a
credential prompt cannot hang a request, `GIT_PAGER=cat`, and `LC_ALL=C` because
this module matches on git's own stderr wording. 15-second timeout, 32 MB
buffer.

## The two pins that encode a spec rule

`-c log.follow=false` is set explicitly on every invocation. Not because
following renames is slow, but because
[evolution.md](srn://metaframework/product/specification/component/core-contracts)
forbids moving an entity at all, and the version→commit index does not follow
renames — a user's global `log.follow = true` would silently change what a
pinned `@N` resolves to. `core.quotepath=false` keeps non-ASCII paths readable.

The version→commit index is built **oldest to newest**, so the *last* commit
carrying a given `version` wins. That is the executable form of evolution.md's
status-only follow-up rule: a commit that changes only `status` does not bump
`version`, and the pin must resolve to the final state of that version rather
than to its first appearance.

`E_VER_REGRESSION` is raised when a version decreases, or jumps by more than
one, between consecutive revisions — and is **suppressed when the 200-commit log
cap truncated the history**, because a regression at an invisible boundary is an
artefact of the cap rather than a defect.

## Nothing here throws

That is the contract, and it is what
[catalog-renders-without-git](srn://metaframework/product/portal/requirement/catalog-renders-without-git)
claims. Every failure is classified into one of four values:

```ts
type HistoryReason = 'no-git-binary' | 'not-a-repository' | 'not-committed' | 'git-error'
```

A portal running from a tarball, a shallow clone, or an image with no git binary
still renders the catalog and says why the past is unreachable. Naming
[git](srn://metaframework/actor/git) as an actor is what makes that a
*describable* set of outcomes rather than an implied one.

## What it does not use, and why no protocol describes it

There is no protocol entity between this module and the git binary. The
transport `kind` enum is `http | grpc | amqp | kafka | websocket | in-process`
and none of those is a local subprocess exec; forcing `in-process` plus an `x-`
nuance field would manufacture a conversation out of a library calling a
program. The degradation story that such a protocol would have carried lives
here and in the requirement.

The diff parser is hand-rolled — unified diff into hunks, with a 4,000-line
render cap — rather than a dependency, and a root commit is diffed against git's
canonical empty tree.

## The reader nobody has

`getEntityHistory()` and `readFileAtRevision()` are called **server-side** by
the entity page, which drives its historical view off `?v=N` in the URL so a
past state is a shareable link. The HTTP surface over this module,
[history-service](srn://metaframework/product/portal/component/history-service),
has a different story, and it is on that page.
