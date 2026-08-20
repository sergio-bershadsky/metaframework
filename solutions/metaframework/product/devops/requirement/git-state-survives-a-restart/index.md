---
name: git-state-survives-a-restart
kind: requirement
version: 1
title: Git state survives a restart, and is the only state that has to
summary: Mirrors and worktrees live on a named volume, so restarting a container costs a fetch rather than a re-clone — and losing the volume costs time, never data.
status: review
owner: sergio
requirement-type: non-functional
priority: should
relations:
  uses:
    - /environment/compose
    - /environment/production
tags:
  - devops
  - storage
---

Everything this product persists is a cache of something GitHub already holds.
That is the property worth protecting, and it cuts both ways: the volume must
survive a restart, because re-cloning every repository on every deploy is a
minutes-long cold start for the first reader; and losing the volume entirely
must be survivable, because a single Hetzner instance has no replica and
pretending otherwise would be the first unbacked availability claim in this
catalog.

`priority: should` rather than `must`, honestly. The product is *correct*
without persistence — it re-clones and carries on. What it loses is speed, and a
requirement that overstates itself is worse than one that admits its tier.

## Acceptance criteria

- **AC-1** Mirrors and worktrees live under a single named volume, mounted at
  one path, declared in both
  [compose](srn://metaframework/environment/compose) and
  [production](srn://metaframework/environment/production).
- **AC-2** Restarting or replacing the container leaves the volume intact: a
  branch already materialised before the restart is served afterwards without a
  re-clone.
- **AC-3** Deleting the volume is a supported operation. The product starts
  clean, re-clones on demand, and no page reports an error that outlives the
  first fetch.
- **AC-4** `git worktree prune` runs at startup. A volume that outlives its
  container can hold worktree records whose directories were removed by
  something other than
  [repo-sync](srn://metaframework/product/devops/component/repo-sync), and git then
  refuses to create a worktree that "already exists" —
  [0001](srn://metaframework/product/devops/adr/0001-a-worktree-per-branch) records
  this as the stateful edge worktrees introduce.
- **AC-5** The volume has a size cap and an eviction policy, and reaching the
  cap evicts rather than fails. A full volume breaks `git fetch`, which breaks
  every branch including ones already on disk — so this is an availability
  criterion, not a housekeeping one.
- **AC-6** No credential is written to the volume. Tokens reach git through a
  credential helper on stdin and never into `.git/config`, per
  [0003](srn://metaframework/product/devops/adr/0003-a-github-app-not-an-oauth-app).
  A persistent volume is precisely where a leaked token would persist.

## Rationale

AC-5 and AC-6 are the two that are not obvious, and they are the two that matter.

The cap, because the failure mode of an uncapped volume is not "disk full" as an
alert — it is the whole product breaking in a way that looks like GitHub being
unreachable, since every symptom is a failed fetch.

The credential clause, because persistence changes the severity of a mistake
that would otherwise be transient. A token in a container's filesystem dies with
the container; the same token on this volume outlives deploys, and is still
there when somebody copies the volume to debug something.

## What is unverified

All of it. There is no volume, no cap, no eviction and no startup sequence.

AC-3 is the criterion most likely to be quietly false in a first implementation:
"delete the volume and it works" is easy to believe and rarely exercised, and
the usual way it breaks is a startup step that assumes a directory laid down by
a previous run. It is the cheapest end-to-end test this product could have —
start, materialise a branch, destroy the volume, start again — and it is worth
being the first one written.
