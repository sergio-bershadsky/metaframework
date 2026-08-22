---
name: compose
kind: environment
version: 4
title: Compose
summary: Devops on a laptop under Docker Compose, from files under docker/ — a second local environment, deliberately not a rehearsal for production, and today one service of the several it describes.
status: review
owner: sergio-bershadsky
environment-type: local
tags:
  - hosted
  - docker
---

**Something runs here now, and it is one service.** `docker/compose.yaml`
exists; started on 2026-08-22 it brings up the portal, published on localhost
and reading a catalog bind-mounted read-only from the host. That is the whole
stack today.

```sh
docker compose -f docker/compose.yaml up --build
```

That is the command, from the repository root — or a bare `docker compose up
--build` from inside `docker/`. **Not** `docker compose up` from the root, which
is what this page said before it was checked: compose does not search
subdirectories, and
[deployment-files-live-under-docker](srn://metaframework/product/devops/requirement/deployment-files-live-under-docker)
AC-2 keeps every deployment file under `docker/`. Run at the root without `-f`,
compose answers "no configuration file provided: not found". The requirement was
right and the sentence here was loose.

The rest of what this page used to promise — a router, a syncer, the SigNoz
stack, a named volume — is still the intent and is still unbuilt; the section
below says what the file has instead, and why neither it nor `topology.yaml` was
edited to agree with the other.

## What actually starts, and what `topology.yaml` still claims

The two disagree, and the disagreement is left standing rather than resolved by
editing one side.

`topology.yaml` beside this file names three hosts —
[catalog-router](srn://metaframework/product/devops/component/catalog-router),
[repo-sync](srn://metaframework/product/devops/component/repo-sync) and
[signoz](srn://metaframework/product/devops/component/signoz) — and deliberately
does not name the portal. `docker/compose.yaml` has one service and it is the
portal. Both are correct about something different:

- **The topology is right about authorship and about intent.** The portal is
  absent from it because membership is authored on the component side
  ([environment.md](srn://metaframework/product/specification/component/kind-contracts)),
  and [portal](srn://metaframework/product/portal) declares no environment but
  local; a host entry here would be this file asserting a membership its member
  does not claim. The three hosts it *does* name are the graph this environment
  is for.
- **The compose file is right about what can be started.** catalog-router and
  repo-sync are `lifecycle: planned` with no code and no image, so a service for
  either would be a build that cannot build. signoz is `component-type:
  external` and deploying it is
  [0004](srn://metaframework/product/devops/adr/0004-signoz-runs-beside-the-workload)'s
  decision, not
  [0005](srn://metaframework/product/devops/adr/0005-one-image-two-topologies)'s;
  only the `OTEL_*` client surface is exposed, unset.

Two consequences of that, stated so they are not mistaken for claims:

- **The named volume at `/var/lib/metaframework` is not declared.** It belongs to
  repo-sync. A named volume nothing mounts is state nothing writes, and
  `docker compose down -v` would then destroy an empty claim rather than the
  mirror
  [git-state-survives-a-restart](srn://metaframework/product/devops/requirement/git-state-survives-a-restart)
  AC-3 is about.
- **The host mount is not
  [any-git-repository-is-a-catalog-source](srn://metaframework/product/devops/requirement/any-git-repository-is-a-catalog-source)
  AC-1 being met.** A host directory with no App and no network is AC-1's shape,
  but AC-1's path runs through repo-sync's `HUB_LOCAL_REPO` and a mirror on the
  volume. The compose file mounts the catalog one layer lower than that, because
  repo-sync does not exist. The requirement's two `implements` edges both come
  from planned components and it is still uncovered.

The fix for the first bullet of the first list is a change to
[portal](srn://metaframework/product/portal)'s own declaration, not to this
entity, and it has not been made — see that page.

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
  shape. Today it runs the one-container shape, which is the same statement with
  the other two containers missing.
- Exercising the case that has no GitHub in it. A host directory mounted in is
  the *shape*
  [any-git-repository-is-a-catalog-source](srn://metaframework/product/devops/requirement/any-git-repository-is-a-catalog-source)
  AC-1 describes — no App configured, no network — and this is the only
  environment where that is convenient to check. It is not yet AC-1 itself; the
  section above says why.

## What is absent

- **No TLS and no ingress.** Ports published on localhost.
- **No real GitHub App by default.** The App credentials are optional here; the
  local-mount path works without them, and the GitHub path needs an App the
  developer registers themselves.
- **No persistence guarantee, and at the moment no persistence.** The design is a
  named volume that survives `docker compose down` and not `down -v`, so
  destroying it is a supported operation
  ([git-state-survives-a-restart](srn://metaframework/product/devops/requirement/git-state-survives-a-restart)
  AC-3) rather than an accident. The compose file declares no volume yet, because
  the component that would own it does not exist; the only state on disk is the
  catalog the host mounts in read-only.
- **SigNoz is heavy here.** The same stack that dominates the production
  instance also dominates a laptop. Whether it is in the default compose profile
  or an opt-in one is unresolved, and the answer is probably opt-in — a
  developer who wants to render a catalog should not be made to run ClickHouse.
  Nothing decides it today: no signoz service is declared, and when one is it
  belongs behind a profile.
- **No image is pushed anywhere.** The tag the compose file builds is local, and
  the catalog still names no registry. Which registry, and under what tag
  scheme, is an open choice nobody has made — it is the same one
  [production](srn://metaframework/environment/production) is waiting on, since
  0005's "one artifact set" means both topologies must answer it once.
