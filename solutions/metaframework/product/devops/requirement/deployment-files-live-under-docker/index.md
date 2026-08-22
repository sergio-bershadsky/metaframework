---
name: deployment-files-live-under-docker
kind: requirement
version: 3
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
  - devops
  - deployment
---

An owner constraint, stated as given: all of it under `docker/`. It is worth
having as a requirement rather than a convention because the value is
enumerability — `ls docker/` is the complete answer to "what does deploying this
involve", and that property is destroyed by exactly one stray file at the
repository root.

It also matters for what this repository has been claiming. Both
[local](srn://metaframework/environment/local) and the solution index asserted,
in writing, that there was "no Dockerfile" anywhere in the tree; those sentences
were true when written and stopped being true on 2026-08-22, and both pages have
been corrected rather than left to rot. This requirement is what made the
replacement checkable instead of vague.

## Acceptance criteria

- **AC-1** `docker/` holds the compose file, every Dockerfile, the Helm chart
  and the environment templates for both
  [compose](srn://metaframework/environment/compose) and
  [production](srn://metaframework/environment/production).
- **AC-2** No Dockerfile, compose file, chart or Kubernetes manifest exists
  outside `docker/`. Checkable in one command:

  ```sh
  find . -name node_modules -prune -o -name .git -prune -o \
    \( -iname 'Dockerfile*' -o -iname 'compose.y*ml' -o -iname 'compose.*.y*ml' \
       -o -iname 'docker-compose*' -o -iname 'Chart.yaml' \) -print
  ```

  returns nothing whose path does not start with `./docker/`. The command
  written here before `docker/` existed was wrong twice, which is what happens
  to a check nobody has run: `-path ./node_modules` prunes only a root-level
  `node_modules` and this repository's is at `framework/portal/node_modules`, so
  it returned Monaco's Dockerfile grammars and could never come back clean; and
  no pattern in it matched `compose.yaml`, which is what the compose file is
  actually called. It caught the file it was written to catch and would have
  missed the one it was written for. The version above is the one that ran.

  It still checks only the half a filename can settle. A Kubernetes manifest is
  a YAML document with `apiVersion` and `kind` and may be named anything, so
  that clause of the criterion is read by a human.
- **AC-3** No secret value appears in any file under `docker/`. Templates name
  keys and say where the value comes from; the GitHub App private key
  ([0003](srn://metaframework/product/devops/adr/0003-a-github-app-not-an-oauth-app))
  is supplied at deploy time and is never committed.
- **AC-4** The compose stack starts from a clean checkout with one command and
  no manual step beyond filling in the environment template.
- **AC-5** The chart deploys the same images the compose file runs — one
  artifact set, two topologies, per
  [0005](srn://metaframework/product/devops/adr/0005-one-image-two-topologies).

## The part that is easy to get wrong

A Dockerfile under `docker/` still needs a **build context above itself**,
because it copies from `framework/portal`. So the build is run from the
repository root with `-f docker/Dockerfile`, and the compose file's `build:`
block sets `context: ..` with `dockerfile:` relative to that context rather than
to the compose file.

Getting this wrong does not fail loudly — it produces a build that cannot see
the source it needs, and the error names a missing path rather than a wrong
context. It is written here because it is the single most likely way AC-4 gets
quietly violated by moving one file "to tidy up".

There is a second consequence of the same shape, found by building rather than
by reasoning, and it is the reason `docker/` holds a file with an odd name.
BuildKit looks for an ignore file **beside the Dockerfile** as
`<dockerfile>.dockerignore`, and otherwise at the **context root** — which here
is the repository root. A `docker/.dockerignore` is therefore read by
nothing, and the build silently ships the whole tree — the catalog, every
`node_modules`, and whatever else is lying around. Measured on 2026-08-22 in a
throwaway context rather than reasoned about: an ignore file at
`sub/.dockerignore` excluded nothing, and the identical file at
`sub/Dockerfile.dockerignore` excluded what it named. The repository root is not
an alternative place to put it — `repo-hygiene`'s allowed root files are
exhaustive and AC-2 keeps deployment files under `docker/` — so the odd name is
load-bearing, and it has to be renamed in step if the Dockerfile ever is.

## What this requirement does not say

Nothing about **what** is deployed, how it scales, or where. Placement is
[production](srn://metaframework/environment/production)'s `topology.yaml` and
the configuration surface is its `config.yaml`; this requirement is only about
where the files sit. Keeping it that narrow is deliberate — a requirement that
also described the topology would be a second copy of the environment entity,
and the two would disagree.

## What was checked on 2026-08-22, and what still nothing enforces

`docker/` exists, so this page stops being a plan. Each criterion, with how it
was settled and where the settling is weak:

- **AC-1 — holds, with one reading declared.** `docker/` holds `Dockerfile`,
  `compose.yaml`, `chart/` and `.env.example`. "The environment templates for
  both environments" is met by reading the chart's `values.yaml` as
  [production](srn://metaframework/environment/production)'s template, which is
  what a values file is; if the intent was a second `.env`-shaped file, this
  criterion is not met and the reading is the thing to argue with.
- **AC-2 — holds, by the command above**, which returns the Dockerfile, its
  ignore file, `compose.yaml` and `Chart.yaml`, all under `./docker/`.
- **AC-3 — holds by inspection.** Every secret key in `.env.example` is present
  and empty, and no key-looking name anywhere under `docker/` carries a value.
  This is a grep and a read, not a scanner.
- **AC-4 — held once, on one machine.** The image built from the committed
  Dockerfile and `docker compose -f docker/compose.yaml up -d` brought the
  portal up serving the catalog with no `.env` file present, which is "no manual
  step beyond filling in the environment template" satisfied by not needing the
  template at all. It was *not* run from a clean checkout: this machine already
  had a layer cache and an installed `node_modules`.
- **AC-5 — holds at defaults, and nothing keeps it holding.** The chart and the
  compose file resolve to the same image reference and the same `CATALOG_DIR`,
  compared by rendering both rather than by reading them. They are two strings
  in two files that no check compares, which is precisely the cost
  [0005](srn://metaframework/product/devops/adr/0005-one-image-two-topologies)
  writes down and accepts.

**Nothing here is enforced.** CI gates the catalog, the types, the lint and the
tests, and has no opinion about file placement, builds no image and lints no
chart. AC-2 is still a three-line CI step and is still the cheapest thing on
this page to make real; AC-5 is a second one, and it is the criterion most likely
to go quietly false, because the image reference is edited in one file at a time.

The `implements` edge that clears `W_REQ_UNIMPLEMENTED` now exists and is
authored by [devops](srn://metaframework/product/devops) itself, which is what
the previous version of this page said would happen "once `docker/` lands". It
is on the product rather than on a component on purpose: this is a constraint on
the product's own shape, and none of
[catalog-router](srn://metaframework/product/devops/component/catalog-router),
[repo-sync](srn://metaframework/product/devops/component/repo-sync) or
[telemetry](srn://metaframework/product/devops/component/telemetry) has any code
with which to satisfy it. The edge is a claim about a directory layout that a
reader can check in one command, not a claim that the product is deployed.
