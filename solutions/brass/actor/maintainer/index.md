---
name: maintainer
kind: actor
version: 1
title: Maintainer
summary: Sole operator of the solution — builds, promotes, and hand-deploys every release from a trusted machine.
status: review
owner: sergio-bershadsky
actor-type: human
goals:
  - Ship a release by hand and know exactly which in-progress games it ends.
  - Verify a build before promoting it, rather than after.
  - Keep the cluster's admin kubeconfig off GitHub.
relations:
  uses:
    - /environment/production
    - /environment/local
tags:
  - operations
---

# Maintainer

One person, holding every operational role this solution has: author, reviewer,
release manager and on-call. There is no team structure and no OWNERS file; the
`owner: sergio-bershadsky` on every entity in this catalog is asserted from the
deployment domain (`brass.bershadsky.dev`) and the image registry namespace
(`ghcr.io/sergio-bershadsky`), not read off a source of record.

## Why deployment is a human act

The deliberate split is: [ci-runner](srn://brass/actor/ci-runner) builds and
publishes images, and never touches the cluster. The maintainer runs
`helm upgrade --install brass deploy/helm/brass -n brass --wait` from a machine that
holds the kubeconfig. That keeps an admin credential for a live Kubernetes cluster
out of GitHub secrets entirely — the credential does not exist in any automated
context, so there is nothing to leak from one.

The cost is real and is the maintainer's second goal here: promotion is a manual
step that can be forgotten, and there is no staging rehearsal between a merge and
production.

## Knowing what a deploy destroys

Every release of the server ends every in-progress game. That is not an accident of
the rollout strategy but a consequence of match state living in the pod's memory —
the Deployment uses `strategy: Recreate` precisely so that two pods never serve
games from two disjoint worlds. So the maintainer's first goal is operational, not
aspirational: before promoting, know whether anyone is mid-game. The obligation is
written down as
[single-writer-match-state](srn://brass/product/play/component/server/requirement/single-writer-match-state).

## Verification without a rehearsal target

There is no staging environment. What stands in for one is
[local](srn://brass/environment/local) plus the gates CI already ran, and after the
`helm upgrade`, three checks by hand: pods and certificate ready, server logs clean,
and `curl https://brass.bershadsky.dev/games` returning `["brass"]`. That is the
whole verification surface, and its thinness is a fact about this solution rather
than a gap in the description.
