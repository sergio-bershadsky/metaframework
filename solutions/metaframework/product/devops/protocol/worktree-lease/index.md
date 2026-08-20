---
name: worktree-lease
kind: protocol
version: 1
title: Worktree lease
summary: The router asks for a filesystem path holding a repository at a branch, fresh enough to serve, and holds a lease on it for the life of a render.
status: review
owner: sergio
style: request-response
participants:
  - alias: router
    ref: /product/devops/component/catalog-router
    role: client
  - alias: sync
    ref: /product/devops/component/repo-sync
    role: server
tags:
  - internal
  - git
---

Not built. The only conversation inside
[devops](srn://metaframework/product/devops), and it is internal: nothing outside the
product may speak it and it is not reachable from the ingress.

It sits at the product rather than under either participant because a protocol
lives at the nearest common ancestor of everyone in it, and the two participants
are sibling components.

## The conversation

Two questions and one obligation.

**Acquire.** *Give me a path holding `{owner}/{repo}` at `{branch}`, no staler
than `{max-age}`.* The answer is a path plus a lease id, and producing it may
take as long as a `git fetch` — this is a call that blocks on the network by
design, and
[repo-sync](srn://metaframework/product/devops/component/repo-sync) explains why
that trade was chosen over a webhook.

**Release.** *I am done with lease `{id}`.* Not optional and not best-effort:
an unreleased lease is a worktree eviction cannot reclaim, and enough of them
fill the volume. Leases therefore expire on the server's clock as well, so the
protocol is correct even when the client dies mid-render — which it will.

The obligation is on the server side: while a lease is live, the path it names
must keep pointing at the same commit. A fetch that fast-forwards the branch
under a live lease would change what a half-rendered page is describing, and a
catalog that changes during its own render is exactly the drift this framework
exists to remove.

## Why leases and not a lock

A lock would serialise readers of the same branch, which is the common case —
two people reviewing the same pull request. A lease is a reader count with a
deadline: many concurrent holders, eviction deferred while any of them lives,
and no holder able to block another.

## Failure is a stated set, not an exception

The four answers a caller must handle, chosen so that
[catalog-router](srn://metaframework/product/devops/component/catalog-router) can
turn each into a page rather than a 500:

- **no-such-branch** — the ref does not exist on the remote, which after a fetch
  is a fact and not a transient.
- **fetch-failed** — the remote was unreachable or refused the credentials.
  Distinct from the above because one is the reader's mistake and the other is
  ours.
- **no-space** — the volume is full and eviction could not free enough. The only
  answer that is an operator's problem rather than a reader's.
- **not-a-catalog** — the branch resolved, but holds no `solutions/` directory.
  The CLI already answers this question for a local tree
  (`resolveCatalogDir` in `framework/portal/bin/discover.mjs`), and the same
  distinction has to survive here or a reader who mistyped a branch gets an
  empty console instead of a sentence.

This mirrors what
[git-history](srn://metaframework/product/portal/component/git-history) already
does with its four `HistoryReason` values, and for the same reason recorded
there: an unnamed dependency produces unnamed failures.

## Transport

HTTP/JSON between two containers on a private network — see the sibling
`transport.yaml`. It is not `in-process`: the two participants are separately
deployed, which is the whole reason the conversation needs describing.

## What is not decided

Whether `max-age` is the caller's to choose at all. The alternative is a single
server-side freshness policy, which removes a knob the router could get wrong
and also removes the ability to say "this render must be current" for a page
that has just been pushed to. Left open deliberately.
