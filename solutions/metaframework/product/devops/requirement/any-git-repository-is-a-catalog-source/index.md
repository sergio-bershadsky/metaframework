---
name: any-git-repository-is-a-catalog-source
kind: requirement
version: 1
title: Any git repository is a catalog source, local one included
summary: A repository holding a solutions/ directory can be read here — cloned from GitHub at a chosen branch, or mounted from the host with no GitHub involved at all.
status: review
owner: sergio
requirement-type: functional
priority: must
relations:
  uses:
    - /environment/compose
    - /environment/production
tags:
  - devops
  - git
---

The product's claim is that a catalog is readable wherever it lives, not only
where this repository happens to keep one. Two sources have to work and they
have different shapes: a **GitHub repository**, fetched and switched by branch,
and a **local git repository**, mounted from the host, which is how somebody
tries this before granting an App access to anything.

The local case is not a degraded version of the remote one. It is the case that
must work with no network, no App installation and no identity — and it is
therefore also the one that keeps the product honest about how much of it
depends on GitHub.

## Acceptance criteria

- **AC-1** A mounted host directory that is a git repository containing
  `solutions/<name>/index.md` renders, with no GitHub App configured and no
  network available.
- **AC-2** For a GitHub repository, every branch the App can see is selectable,
  and selecting one renders that branch's catalog rather than the default
  branch's.
- **AC-3** Switching branches changes what is rendered without restarting any
  process, and two readers on two branches of the same repository each see their
  own.
- **AC-4** A repository, or a branch, that holds no `solutions/` directory
  produces the `not-a-catalog` answer from
  [worktree-lease](srn://metaframework/product/devops/protocol/worktree-lease) and
  a page that says so — never an empty console.
- **AC-5** Entity version history works on both sources: `.git` is present where
  the portal runs, which
  [0009-git-backed-history](srn://metaframework/adr/0009-git-backed-history)
  requires and which
  [0001-a-worktree-per-branch](srn://metaframework/product/devops/adr/0001-a-worktree-per-branch)
  preserves by using worktrees rather than archive exports.
- **AC-6** The catalog root is discovered the way the CLI already discovers it —
  a `solutions` directory holding at least one `<name>/index.md`, per
  `resolveCatalogDir` in `framework/portal/bin/discover.mjs` — so that a
  directory that works with `metaframework` locally works here without being
  re-explained.

## Rationale

AC-1 carries the requirement. Without it the product is *a GitHub reader* and
the first sentence of this page is marketing; with it, GitHub is one source
among two and the coupling recorded on
[github](srn://metaframework/product/devops/component/github) stays a coupling
rather than the definition.

AC-4 exists because the failure it names is the one that produces a confusing
success. A catalog loader pointed at a directory with no solutions does not
error — it loads an empty catalog, and the portal renders an empty console
perfectly happily. A reader who mistyped a branch would conclude the branch is
empty rather than that they mistyped.

AC-6 is a consistency requirement rather than a behavioural one, and it is here
because the alternative is two discovery rules that diverge — the CLI's and the
devops's — for the same question a user asks once.

## What is unverified

All of it. Nothing is built; there is no test, no fixture and no measurement
behind any criterion on this page. The criteria are written to be checkable
rather than checked, and the distinction matters more here than on most pages in
this catalog, because everything else in `solutions/metaframework` describes
code that exists.

AC-3's second clause — two readers, two branches, each seeing their own — is the
one worth building a test for first, because it is the criterion whose failure
mode is a *plausible wrong answer* rather than an error, and
[0001](srn://metaframework/product/devops/adr/0001-a-worktree-per-branch) chose its
whole design around preventing it.
