---
name: ship-a-release
kind: journey
version: 1
title: Ship a release
summary: The operator's path from a merged change to a live one — four gate steps that are not his, one hand deploy that ends every game in progress, and three checks.
status: review
owner: sergio-bershadsky
actor: /actor/maintainer
relations:
  uses:
    - /environment/production
tags:
  - operations
  - cross-product
---

The only path in this catalog nobody plays. A change merges,
[ci-runner](srn://brass/actor/ci-runner) typechecks and tests it and pushes two
images to GHCR, and then a person on a laptop runs `helm upgrade` and looks at
three things. There is no staging rehearsal between those two halves and no
automated promotion between them, and both absences are deliberate.

## Outcome

The new images are serving `https://brass.bershadsky.dev`, and the maintainer
knows what the deploy destroyed.

That second clause is not decoration. `strategy: Recreate` with match state in
the pod's heap means every release ends every in-progress game
([single-writer-match-state](srn://brass/product/play/component/server/requirement/single-writer-match-state)),
so "did anyone lose a match to this?" is a question with an answer only before
the command is run.

## Why the deploy is a human step

The split is the security position, not an unfinished pipeline:
[ci-runner](srn://brass/actor/ci-runner) builds and publishes and holds no
credential that can reach the cluster, while the maintainer holds the kubeconfig
on a trusted machine. An admin credential for a live Kubernetes cluster
therefore does not exist in any automated context, so there is nothing to leak
from one.

The cost is `steps[4]`: promotion is a manual step that can be forgotten, and
nothing rehearses it first.

One caveat worth carrying here rather than discovering later. The repository
already contains `deploy/ci-rbac.yaml` — a `brass-deployer` ServiceAccount, a
namespace-scoped Role and a long-lived token — applied by hand for a CD job that
does not exist. If that job is ever written, this journey gains a step, loses its
last two, and the actor column changes; that would be a swap, not an edit.

## The two crossings are a build tool walking a workspace

`steps[1]` leaves `play` for `agent-play` and `steps[2]` comes back, and both say
`protocol: none`. That is the documented negative and it is the right claim: no
conversation happens between the two products in CI. `pnpm -r typecheck` sweeps
every package in the monorepo, which is the *only* gate
[mcp-server](srn://brass/product/agent-play/component/mcp-server) gets — no unit
suite of its own, no image, no deployment. The second product's whole CI story is
a recursive flag.

## What the gates do not cover

The Playwright suite. `pnpm e2e` appears in no workflow, and three of its five
specs reference selectors the client no longer carries
([e2e-harness](srn://brass/product/play/component/e2e-harness) is `draft` for
exactly that reason). So nothing in this path exercises two browsers against one
server, and `steps[6]` — one `curl` — is the entire end-to-end verification a
release receives.

## Out of scope

A rollback. Every previous build is still in GHCR under its short-sha tag, so
one is possible; nothing in the repository states a procedure for it, and
inventing the steps here would describe a path nobody has walked. A failed
verification at `steps[5]` or `steps[6]` is a second outcome and would be a
second journey.
