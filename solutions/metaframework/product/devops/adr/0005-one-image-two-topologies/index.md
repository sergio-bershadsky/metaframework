---
name: 0005-one-image-two-topologies
kind: adr
version: 2
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
- **"One artifact set" was tested against Score, and the pair this record names
  is not the pair Score covers.** The prototype
  [0016-topology-format-deferred](srn://metaframework/adr/0016-topology-format-deferred)
  left open now exists under this product's `_score/` directory — two workload
  files, run through `score-compose` 0.45.0 and `score-k8s` 0.16.0 on
  2026-08-21. All 14 configuration keys the two components' contracts declare
  survived into both outputs, and secrets arrived in Kubernetes as
  `valueFrom.secretKeyRef` rather than as values. Three things did not.
  `score-helm` is deprecated by its own README, so the chart half of this
  record is uncovered and the prototype exercises *compose file* and *raw
  manifests* instead — and rendering those manifests into a chart produces the
  unreadable chart the Kompose alternative was rejected for. `score-k8s` ships
  no `environment` provisioner and refuses to generate at all without a custom
  one, so the deploy-time-configuration half of this product costs a file
  before anything runs. And one `type: volume` resource became a durable named
  volume under compose and `emptyDir: {}` under Kubernetes — the same drift
  this record accepts as its cost, except with **one** description rather than
  two, and located below the artifact where reading it cannot reveal it. The
  duplication above is therefore still the honest position, and the prototype
  changes nothing on this page beyond recording that it was measured.

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
