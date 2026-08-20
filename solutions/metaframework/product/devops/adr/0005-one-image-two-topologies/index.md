---
name: 0005-one-image-two-topologies
kind: adr
version: 1
title: One set of images, two topologies, and the compose file is the source
summary: Docker Compose under /docker is how this runs locally and the Helm chart deploys the same images to Hetzner — two placements of one artifact set, never two builds.
status: review
owner: sergio
decision-status: proposed
date: "2026-08-20"
relations:
  uses:
    - /environment/compose
    - /environment/production
tags:
  - devops
  - deployment
---

## Context

The product has to run two ways: on a laptop, with everything in Docker Compose
and every file under a `docker/` directory; and on a Hetzner instance in
Helsinki, deployed with a Helm chart. Those are different orchestrators with
different vocabularies, and the standard way this goes wrong is that they drift
until "works locally" stops predicting anything.

## Decision

Two **topologies**, one **artifact set**. The same container images, built once,
placed twice. `docker/` holds the compose file, the Dockerfiles and the local
environment template; `docker/chart/` holds the Helm chart. Neither builds
anything the other does not.

The compose file is the readable definition of what the system *is* — which
processes exist, what they talk to, what they mount. The chart is that same
graph expressed for a cluster, plus the things only a cluster has.

## Consequences

- **Two descriptions of one graph, kept in step by hand.** This is the cost and
  there is no dressing it up. Nothing generates the chart from the compose file
  and nothing checks they agree; a service added to one and forgotten in the
  other is found when a deploy misbehaves. It is the same class of defect this
  catalog already records against `console-tokens.ts` in
  [0003-colour-is-ontology](srn://metaframework/product/portal/adr/0003-colour-is-ontology),
  and it is accepted for the same reason: the alternatives cost more than the
  duplication.
- **The two environments are genuinely different and the catalog says so.**
  [compose](srn://metaframework/environment/compose) and
  [production](srn://metaframework/environment/production) are separate entities
  with separate `topology.yaml` and `config.yaml`, rather than one entity with a
  flag. That is what the environment kind is for, and it is why the deployment
  artifacts are not modelled as a component — a compose file *is* placement and
  configuration, which already have a home.
- **`docker/` is a stated constraint, so it is a requirement rather than a
  convention.**
  [deployment-files-live-under-docker](srn://metaframework/product/devops/requirement/deployment-files-live-under-docker)
  carries it, with the awkward part written down: a Dockerfile under `docker/`
  needs a build context above itself, which is a thing people get wrong once per
  project.
- **Local is not production-shaped and must not pretend to be.**
  `environment-type: local` on the compose environment is deliberate. It has no
  TLS, no ingress, no real GitHub App and no persistence guarantee. Typing it
  `staging` would claim a rehearsal this product does not perform.
- **Nothing is deployed by CI.** The repository has a CI workflow that gates the
  catalog and the tests; it does not build images and does not deploy. Deploying
  is a person running a command, and pretending otherwise on this page would be
  the same kind of aspirational claim the rest of the catalog avoids.

## Alternatives considered

- **Compose only, and run compose on the server.** Simplest possible answer, and
  for one machine it is very nearly right — no chart, no cluster, no second
  description. Rejected because a chart was asked for, and because the honest
  argument for it is real: the chart is where rollout, resource limits and
  restart policy get stated, and on compose they get stated in a runbook nobody
  reads. Recorded because if this product ever sheds the chart, this is the
  paragraph to reopen.
- **Kompose, or generating the chart from the compose file.** Removes the
  duplication above and produces a chart nobody wants to read or hand-edit,
  which loses the reason the chart exists. Rejected.
- **A single Dockerfile running everything under a supervisor.** One image, one
  process tree, no orchestration at all. Genuinely simpler to deploy and it
  collapses the process boundary that
  [worktree-lease](srn://metaframework/product/devops/protocol/worktree-lease)
  describes — which would mean the router and the syncer share a memory space
  and the lease becomes a function call. Rejected because it also collapses the
  isolation that makes the credential-holding component reviewable on its own,
  and because a supervisor inside a container is the thing every orchestrator
  exists to replace.
- **Nix, or building on the server.** Out of scope and out of character for a
  product whose deployment story should be readable by whoever inherits it.
