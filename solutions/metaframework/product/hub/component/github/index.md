---
name: github
kind: component
version: 1
title: GitHub
summary: The system this product is coupled to and does not own — identity, repository permission, and the git remotes everything here is a view of.
status: review
owner: sergio
component-type: external
lifecycle: released
criticality: 1
tags:
  - external
  - github
---

`component-type: external` — "a system this solution does not own, described
locally so edges can point at it"
([component.md](srn://metaframework/product/specification/component/kind-contracts)).
`lifecycle: released` is GitHub as *we* see it and is not a claim about
anybody's roadmap.

This page exists so that the coupling is a node in the graph rather than a
sentence in a paragraph. [hub](srn://metaframework/product/hub) is named
generically on purpose and criticised for it on its own page; the mitigation is
that the specific dependency is right here, at `criticality: 1`, where a reader
scanning the tree meets it.

## What this product actually uses

Narrow, and worth enumerating because the width of a third-party dependency is
usually discovered rather than decided:

- **An identity.** Who the reader is, established once per session.
- **A permission answer.** May this identity read `{owner}/{repo}`. Never cached
  beyond the session — see
  [catalog-router](srn://metaframework/product/hub/component/catalog-router)
  for the staleness that buys.
- **A repository and branch listing**, to populate the two pickers.
- **A git remote**, fetched over HTTPS with a short-lived token.

Nothing else. No issues, no pull requests, no checks, no webhooks, no Actions,
no GraphQL. If a feature here ever wants a PR's diff, that is a new dependency
and deserves a new decision, not an extra scope on the existing one.

## The coupling is real and is not hidden behind an abstraction

There is no `VcsProvider` interface with GitHub as the first implementation.
That would be the reflex, and it would be a lie of the kind this catalog exists
to catch: the auth model here is *installation-scoped*
([0003](srn://metaframework/product/hub/adr/0003-a-github-app-not-an-oauth-app)),
which is a GitHub concept with no counterpart in GitLab's or Gitea's, and an
interface spanning them would either leak GitHub's model or lose it.

The honest position is that supporting a second forge is a project, not a
configuration value, and
[any-git-repository-is-a-catalog-source](srn://metaframework/product/hub/requirement/any-git-repository-is-a-catalog-source)
is deliberately written so that the *local* path does not go through here at
all — which is the only "not GitHub" case actually supported.

## What its absence does

Unlike [git](srn://metaframework/actor/git), whose absence the portal is built
to survive, there is no degraded mode here. GitHub down means no sign-in, no
permission answer and no fetch; already-materialised worktrees would still
render for already-signed-in readers, and that is an accident of the design
rather than a designed behaviour. Nobody has decided whether to make it one.
