---
name: compose
kind: environment
version: 2
title: Compose
summary: The whole of devops on a laptop under Docker Compose, from files under docker/ — a second local environment, deliberately not a rehearsal for production.
status: review
owner: sergio-bershadsky
environment-type: local
tags:
  - hosted
  - docker
---

**Nothing runs here.** `docker/` does not exist.

`docker compose up` from the repository root brings up the whole of
[devops](srn://metaframework/product/devops) — router, syncer, the portal it fronts,
and the SigNoz stack — against a named volume and, optionally, a git repository
mounted from the host.

## Why a second `local`, rather than extending the existing one

[local](srn://metaframework/environment/local) is one `next dev` process reading
`solutions/` off the developer's disk. That is a different target in every way
that an environment entity exists to record: different topology (one process
versus five containers), different configuration surface (two knobs versus the
list in the sibling `config.yaml`), and a different thing being run. Folding
both into one entity would produce a `topology.yaml` describing two systems and
a `config.yaml` whose keys apply to one of them each.

Both are `environment-type: local` and that is correct — the type is a class, not
a name, and the class here is "a single developer's machine, nothing shared, no
data of record, anyone may break it at any moment".

## Deliberately not `staging`

The tempting reading is that this is production's rehearsal, since it runs the
same images in the same shape
([0005](srn://metaframework/product/devops/adr/0005-one-image-two-topologies)).
Typing it `staging` would be false: staging means *production-shaped, same
topology and same protocol versions, the last gate before real users*, and this
has no TLS, no ingress, no real GitHub App, no persistence guarantee and one
reader. It rehearses the process graph and nothing else.

There is no promotion path in this solution, and this entity does not create
one.

## What it is actually for

Two things, and the second is the one that keeps the product honest:

- Building the thing at all, since nothing else can run the multi-container
  shape.
- Exercising the case that has no GitHub in it. A host directory mounted in is
  the path
  [any-git-repository-is-a-catalog-source](srn://metaframework/product/devops/requirement/any-git-repository-is-a-catalog-source)
  AC-1 requires to work with no App configured and no network — and this is the
  only environment where that is convenient to check.

## What is absent

- **No TLS and no ingress.** Ports published on localhost.
- **No real GitHub App by default.** The App credentials are optional here; the
  local-mount path works without them, and the GitHub path needs an App the
  developer registers themselves.
- **No persistence guarantee.** The volume is named, so it survives
  `docker compose down` and not `down -v`, and destroying it is a supported
  operation
  ([git-state-survives-a-restart](srn://metaframework/product/devops/requirement/git-state-survives-a-restart)
  AC-3) rather than an accident.
- **SigNoz is heavy here.** The same stack that dominates the production
  instance also dominates a laptop. Whether it is in the default compose profile
  or an opt-in one is unresolved, and the answer is probably opt-in — a
  developer who wants to render a catalog should not be made to run ClickHouse.
