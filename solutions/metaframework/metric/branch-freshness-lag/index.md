---
name: branch-freshness-lag
kind: metric
version: 1
title: Branch freshness lag
summary: How long after a push devops is still able to serve the previous commit for that branch — the number that says whether choosing leases over webhooks was right.
status: review
owner: sergio-bershadsky
metric-type: duration
target: "60s"
window: "instant"
direction: lower-is-better
relations:
  measures:
    - /product/devops/requirement/any-git-repository-is-a-catalog-source
    - /capability/shared-catalog-access
  uses:
    - /environment/production
tags:
  - hosted
  - staleness
---

**Nothing is measured.** There is no deployment, no traffic and no reading. This
entity describes what would be observed and what would make the design wrong,
which is the only useful thing a metric can be before its subject exists.

[repo-sync](srn://metaframework/product/devops/component/repo-sync) refreshes on
demand, under a lease with a maximum staleness, rather than on a webhook. That
is a deliberate trade — the first read of a branch after a push waits, and every
read after it is a directory that is already correct — and it is the kind of
trade that is defensible only while the number it produces stays small. This is
that number.

## Definition

The interval between a commit landing on a branch at GitHub and the first moment
this deployment would no longer serve the previous commit for it.

It is **not** the fetch duration. A fetch that takes four seconds contributes
four seconds of lag to the reader who triggered it and zero to everyone after;
what this measures is the window in which a reader could be shown a commit that
is no longer the branch's tip.

Derived from traces rather than sampled: the lease span records the worktree's
last-fetch time and whether the request forced a fetch
([every-request-is-traced](srn://metaframework/product/devops/requirement/every-request-is-traced)
AC-2), and the commit's own timestamp is in the repository. Nothing needs to
poll GitHub to compute it.

## Why the target is 60 seconds and why that is arbitrary

It is the configured `max-age` on the lease, and no more defensible than that
value is. It is written here as a target so that the two move together and a
reader can see the design decision as a number instead of as a paragraph.

What would make it wrong in either direction:

- **Too high** if a reviewer ever pushes a fix and reloads to find the old
  description. That is the failure this metric exists to catch, and it is a
  *correctness* failure in a product whose claim is that the description matches
  the thing.
- **Too low** if fetches dominate. At a `max-age` short enough, nearly every
  request forces a fetch and the design has quietly become "fetch on every
  read", which is the cost the lease was introduced to avoid.

## Known distortions

- **It cannot be zero, and a webhook would make it nearly so.** That is the
  honest framing of the alternative: this metric being consistently poor is the
  evidence for reversing
  [repo-sync](srn://metaframework/product/devops/component/repo-sync)'s choice, not
  a reason to tune the number.
- **`window: instant`, because nothing samples anything.** The same reading
  [catalog-load-errors](srn://metaframework/metric/catalog-load-errors) takes:
  aggregating over a period would describe a collection practice that does not
  exist. Here it is worse than there — that metric can at least be read by
  running a command, and this one cannot be read at all.
- **The local-mount path has no lag and is not in scope.** A host directory
  mounted read-only is whatever is on disk; there is nothing to be stale
  relative to. Including it would drag the average toward zero and describe
  nothing.
- **It says nothing about whether a reader saw the stale commit.** A window in
  which staleness is *possible* is not an incident count. Measuring actual
  stale reads needs the tip commit at read time, which needs the call to GitHub
  the design exists to avoid — so the cheaper proxy is measured and the gap is
  recorded here rather than quietly closed.
