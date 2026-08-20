---
name: deployment-files-live-under-docker
kind: requirement
version: 1
title: Every deployment file lives under docker/
summary: One directory holds the compose file, the Dockerfiles, the chart and the environment templates — so the deployment surface is a place a reviewer can list rather than a pattern they have to know.
status: review
owner: sergio
requirement-type: non-functional
priority: must
relations:
  uses:
    - /environment/compose
    - /environment/production
tags:
  - hub
  - deployment
---

An owner constraint, stated as given: all of it under `docker/`. It is worth
having as a requirement rather than a convention because the value is
enumerability — `ls docker/` is the complete answer to "what does deploying this
involve", and that property is destroyed by exactly one stray file at the
repository root.

It also matters for what this repository has been claiming. Both
[local](srn://metaframework/environment/local) and the solution index assert, in
writing, that there is "no Dockerfile" anywhere in the tree, and those sentences
were true when written. This requirement is what makes the replacement checkable
instead of vague.

## Acceptance criteria

- **AC-1** `docker/` holds the compose file, every Dockerfile, the Helm chart
  and the environment templates for both
  [compose](srn://metaframework/environment/compose) and
  [production](srn://metaframework/environment/production).
- **AC-2** No Dockerfile, compose file, chart or Kubernetes manifest exists
  outside `docker/`. Checkable in one command:
  `find . -path ./node_modules -prune -o \( -iname 'Dockerfile*' -o -iname 'docker-compose*' -o -iname 'Chart.yaml' \) -print`
  returns nothing whose path does not start with `./docker/`.
- **AC-3** No secret value appears in any file under `docker/`. Templates name
  keys and say where the value comes from; the GitHub App private key
  ([0003](srn://metaframework/product/hub/adr/0003-a-github-app-not-an-oauth-app))
  is supplied at deploy time and is never committed.
- **AC-4** The compose stack starts from a clean checkout with one command and
  no manual step beyond filling in the environment template.
- **AC-5** The chart deploys the same images the compose file runs — one
  artifact set, two topologies, per
  [0005](srn://metaframework/product/hub/adr/0005-one-image-two-topologies).

## The part that is easy to get wrong

A Dockerfile under `docker/` still needs a **build context above itself**,
because it copies from `framework/portal`. So the build is run from the
repository root with `-f docker/<name>.Dockerfile`, and the compose file's
`build:` block sets `context: ..` with `dockerfile:` relative to it.

Getting this wrong does not fail loudly — it produces a build that cannot see
the source it needs, and the error names a missing path rather than a wrong
context. It is written here because it is the single most likely way AC-4 gets
quietly violated by moving one file "to tidy up".

## What this requirement does not say

Nothing about **what** is deployed, how it scales, or where. Placement is
[production](srn://metaframework/environment/production)'s `topology.yaml` and
the configuration surface is its `config.yaml`; this requirement is only about
where the files sit. Keeping it that narrow is deliberate — a requirement that
also described the topology would be a second copy of the environment entity,
and the two would disagree.

## What is unverified

All of it. `docker/` does not exist. AC-2 is the only criterion here that could
be enforced mechanically today, and nothing enforces it: the repository's CI
gates the catalog, the types, the lint and the tests, and has no opinion about
file placement. If this requirement is approved, AC-2 is a three-line CI step
and is the cheapest thing on this page to make real.
