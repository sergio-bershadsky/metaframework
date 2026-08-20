---
name: repo-sync
kind: component
version: 1
title: Repo sync
summary: The only thing here that writes — GitHub credentials in, a bare mirror and a worktree per branch out, on a volume that outlives the container.
status: review
owner: sergio
component-type: service
lifecycle: planned
criticality: 1
relations:
  exposes:
    - /product/devops/protocol/worktree-lease
  depends-on:
    - ../github
    - ../telemetry
  implements:
    - /product/devops/requirement/any-git-repository-is-a-catalog-source
    - /product/devops/requirement/git-state-survives-a-restart
  realizes:
    - /capability/shared-catalog-access
  uses:
    - /environment/production
    - /environment/compose
tags:
  - git
  - github
  - state
---

Not built. `lifecycle: planned`, and the paragraphs below are a specification to
implement against rather than a description of code.

Everything in this product that touches a disk or a credential is here, on
purpose: it is the one component with a blast radius worth the
`criticality: 1`, and concentrating the write path into a single reviewable
surface is worth more than a tidier decomposition would be.

## The shape of the state

Per repository, one **bare mirror**; per branch a reader has asked for, one
**worktree** checked out from it.

```text
/var/lib/metaframework/                 # the volume, see requirement git-state-survives-a-restart
├── mirror/
│   └── github.com/{owner}/{repo}.git   # bare, --mirror, the only thing fetched into
└── worktree/
    └── github.com/{owner}/{repo}/{branch-slug}/   # what the portal is pointed at
```

A worktree is what makes this work at all, and the reasoning is in
[0001-a-worktree-per-branch](srn://metaframework/product/devops/adr/0001-a-worktree-per-branch).
The short version: the portal already reads a directory, so the entire
branch-switching feature reduces to *choose a different directory* — no portal
concept of a branch, no git library in the renderer, and a `git checkout` in one
reader's session cannot disturb another's.

The branch name is slugged rather than used raw. Branch names may contain `/`,
may differ only by case on a case-insensitive filesystem, and may be up to
255 bytes; a path built naively from one is a directory-traversal bug waiting
for `feature/../../etc`. The slug is a sanitised prefix plus a hash of the exact
name, which is collision-safe and still greppable by a human staring at the
volume.

## What it exposes, and to whom

One protocol,
[worktree-lease](srn://metaframework/product/devops/protocol/worktree-lease): the
[catalog-router](srn://metaframework/product/devops/component/catalog-router) asks
for "a filesystem path holding {owner}/{repo} at {branch}, fresh enough", and
gets back a path plus a lease. It is not a public surface — nothing outside this
product may call it, and it is not reachable from the ingress.

`component-type: service` is honest here in a way it is not everywhere in this
solution: this really is a separate process with an inbound surface, unlike
[schema-service](srn://metaframework/product/portal/component/schema-service),
which is a route handler inside the renderer and says so on its own page.

## Freshness is a lease, not a watch

There is no webhook and no polling loop. A lease carries a maximum staleness;
when the router asks for a path whose worktree was last fetched longer ago than
that, the fetch happens before the answer comes back, and the reader waits.

This is the deliberate trade recorded in
[branch-freshness-lag](srn://metaframework/metric/branch-freshness-lag): the
first read of a branch after a push is slow, and every read after it is a
directory that is already correct. A webhook would invert that — fast reads,
plus a public inbound endpoint, a shared secret to rotate, and a whole class of
"we missed the event and served stale for an hour" failures. For a catalog whose
readers arrive in ones and twos, waiting a second is cheaper than being wrong
silently.

Concurrent requests for the same worktree collapse onto one fetch. Concurrent
requests for *different* worktrees of the same mirror serialise on the mirror's
own lock, which git enforces whether this component cooperates or not.

## Eviction, and why it is a correctness property

Worktrees are evicted on an idle timer, oldest first, under a total-size cap.
Without a cap, a repository with three hundred branches and a reader who clicks
through them fills the volume, and a full volume is not a degraded
deployment — it is one where `git fetch` fails, which is indistinguishable from
one that serves
the wrong thing.

Eviction must not remove a worktree under a request that is reading it, which is
what the lease is for on the other side: the path comes with a lease the router
holds for the life of the render, and eviction skips leased worktrees rather
than waiting on them.

## Credentials

Never on disk and never in a log. `repo-sync` asks
[github](srn://metaframework/product/devops/component/github) for a short-lived
installation token per fetch and passes it to git through a credential helper on
stdin rather than in a URL, because a token embedded in a remote URL is written
into `.git/config` and into every error message git produces about that remote.
The reasoning for installation tokens over user tokens is
[0003-a-github-app-not-an-oauth-app](srn://metaframework/product/devops/adr/0003-a-github-app-not-an-oauth-app).

Every git invocation follows the pattern
[git-history](srn://metaframework/product/portal/component/git-history) already
established and which should be copied rather than reinvented: `execFile` with
an argv array and never a shell string, `GIT_TERMINAL_PROMPT=0` so a credential
prompt cannot hang a request, an explicit timeout, and `--` before every
pathspec.

## What is unresolved

- **Private repositories a signed-in user can read but the App is not installed
  on.** GitHub's model is installation-scoped, so the answer is "ask the user to
  install the App on that repository", and that is a worse first-run experience
  than it sounds. Nobody has walked it.
- **Large repositories.** There is no blob filter, no shallow clone and no size
  limit in this description. `--filter=blob:none` is the obvious lever and is
  deliberately not specified until somebody has measured a real catalog
  repository against the Hetzner instance's disk.
- **Submodules, LFS, and annotated-tag catalogs.** Out of scope, unstated
  behaviour, and each will surface as a confusing empty catalog rather than an
  error unless handled.
- **Nothing here is tested, because nothing here is written.** The portal has
  zero component tests today; a component that writes to a shared volume and
  holds credentials cannot be shipped on the same terms.
