---
name: 0001-a-worktree-per-branch
kind: adr
version: 1
title: A worktree per branch, so branch switching is choosing a directory
summary: Branch switching is implemented as git worktrees over a bare mirror, because the portal already reads a directory — which makes the feature a filesystem question rather than a renderer question.
status: review
owner: sergio
decision-status: proposed
date: "2026-08-20"
relations:
  uses:
    - /product/hub/component/repo-sync
tags:
  - hub
  - git
---

## Context

The product has to show the same catalog at different branches, switchable by
the reader, concurrently for several readers. The renderer it is built around
reads one directory: `catalogDir()` in
`framework/portal/src/lib/catalog/index.ts:21` resolves a path, and everything
downstream walks it.

So there are two shapes available. Teach the renderer about refs, or arrange for
the directory to already contain the right thing.

## Decision

The directory. One **bare mirror** per repository, and one **worktree** per
branch a reader has asked for, materialised on demand and evicted when idle. The
renderer is handed a path and is never told a branch exists.

## Consequences

- **Branch switching costs nothing in the renderer.** No git dependency there,
  no ref concept, no cache keyed by commit. The entire feature is
  [repo-sync](srn://metaframework/product/hub/component/repo-sync) plus a path.
- **Readers cannot disturb each other.** The obvious cheap alternative — one
  checkout per repository, `git checkout` on switch — makes two readers on two
  branches fight over one working tree, and the loser sees the other's branch
  without any error. Worktrees make that structurally impossible rather than
  unlikely.
- **Disk is now a resource with a policy.** A worktree is a full checkout. A
  repository with many branches, browsed, materialises many of them, so
  eviction and a size cap stop being hygiene and become correctness — a full
  volume breaks fetching, which breaks everything.
- **`.git` is present and history works.** The portal's historical reads shell
  out to git and need a repository where they run
  ([0009-git-backed-history](srn://metaframework/adr/0009-git-backed-history)).
  A worktree satisfies that: `.git` is a file pointing into the mirror, and
  `git log` works normally through it. A tarball extraction or an archive export
  would not have, and the version picker would have silently degraded to "not a
  repository" on every page.
- **The mirror is a single writer.** Fetches for different branches of one
  repository serialise on git's own lock whether or not this design cooperates,
  so concurrency is per-repository, not per-branch. At the expected traffic this
  is invisible; at ten times it is the first bottleneck.
- **Worktrees are stateful in a way containers are not.** `git worktree` records
  administrative files inside the mirror, so a volume that survives a restart
  can hold worktree records whose directories were removed by something other
  than this component. `git worktree prune` on startup is not optional, and
  forgetting it produces a repository that refuses to create a worktree that
  "already exists".

## Alternatives considered

- **`git archive` into a temp directory per request.** Simplest to reason about
  and stateless. Rejected on two counts: it produces no `.git`, so history dies
  across the whole product, and it re-extracts an entire catalog per request
  where a worktree is already correct.
- **One process per repository with `git checkout` on switch.** The cheapest to
  build, and wrong for the reason above — concurrent readers on different
  branches silently show each other's branch. A bug that produces a *plausible*
  wrong answer is worse than one that produces an error.
- **Read blobs from the object database and never touch a working tree.**
  Elegant, and it deletes the disk problem entirely. Rejected because it means
  the loader no longer reads a filesystem, which is not a small change to the
  portal — it is a rewrite of the assumption the whole catalog format rests on
  ([0002-filesystem-is-the-database](srn://metaframework/adr/0002-filesystem-is-the-database)).
  Worth revisiting only if disk becomes the binding constraint.
- **Shallow or blobless clones.** Not an alternative to this decision but a
  modifier of it, deliberately unresolved: `--filter=blob:none` would cut disk
  substantially, and it interacts with history reads in ways nobody has
  measured. Named in
  [repo-sync](srn://metaframework/product/hub/component/repo-sync) as open.
