---
name: read-a-branch
kind: journey
version: 1
title: Read a branch
summary: A reviewer opens a link, signs in with GitHub, picks the branch a change was proposed on, and reads the description as it would be — five steps, none of which exist yet.
status: review
owner: sergio-bershadsky
actor: /actor/reviewer
relations:
  uses:
    - /environment/production
tags:
  - hosted
  - review
---

**Nothing in this walk is implemented.** Every step crosses a component that is
`lifecycle: planned` inside a product that is `lifecycle: concept`.

Somebody is asked to review a proposed change to a described system. Today that
means cloning a repository, installing a Node toolchain and running a server —
which is why
[audit-a-catalog](srn://metaframework/journey/audit-a-catalog) begins with the
reviewer already in front of a running portal, and quietly assumes the hardest
part is done. This journey is that assumption, written down and paid for.

## Outcome

The reviewer reads the catalog **as the branch proposes it**, not as a diff, and
can reach any entity on it by link. What they cannot do is respond: there is no
comment, no approval and no write path anywhere in this product. They go back to
GitHub for that.

## Preconditions

A deployed hub, a GitHub account, and — the one that bites — the App already
installed on the repository by somebody with admin rights on it. That
installation step is not part of this walk and cannot be performed by this
actor; it belongs to [operator](srn://metaframework/actor/operator) and to
whoever owns the repository.
[0003-a-github-app-not-an-oauth-app](srn://metaframework/product/hub/adr/0003-a-github-app-not-an-oauth-app)
records it as the largest piece of friction the product accepts, and this
journey is where the cost is actually felt: a reviewer who follows a link to an
uninstalled repository gets a request-somebody-else form rather than a catalog.

## Where it can be slow, and why that is by design

Step three is the one that blocks. Selecting a branch nobody has read recently
forces a `git fetch` before anything renders, and on a cold repository it forces
the clone —
[repo-sync](srn://metaframework/product/hub/component/repo-sync) chose that over
a webhook deliberately, and
[branch-freshness-lag](srn://metaframework/metric/branch-freshness-lag) is the
number that says whether the choice was right. Every subsequent step reads a
directory that is already correct.

The second place it can be slow is invisible to the reader and visible in a
trace: whether the render paid for a catalog rebuild or was served off the
fingerprint cache — ~18ms against ~2.2s on the loader's own measurements.
[every-request-is-traced](srn://metaframework/product/hub/requirement/every-request-is-traced)
AC-2 exists so that this journey's slow steps are attributable after the fact.

## What this journey deliberately does not do

- **It does not diff.** Reading the branch's catalog is not comparing it to the
  base, and nothing here renders a comparison. That is the whole point of
  [0012-review-is-git-native](srn://metaframework/adr/0012-review-is-git-native):
  the diff is GitHub's job and the *state* is this one's.
- **It does not end in a verdict.** Same limit
  [audit-a-catalog](srn://metaframework/journey/audit-a-catalog) records — the
  portal can say what the system is and which rules the catalog breaks, and
  cannot say whether the description is any good.
- **It has no step for the change itself.** A reviewer who wants something
  altered leaves.

## The honest gap

Steps four and five are the same two surfaces `audit-a-catalog` already walks,
and this journey adds nothing to them. That is correct — the hub's contribution
is *getting there*, and once a reader is on an entity page the experience is the
portal's, unchanged. A journey whose last steps duplicate another journey's is
usually a sign of over-modelling; here it is the accurate shape, because the new
capability is access and not reading.
