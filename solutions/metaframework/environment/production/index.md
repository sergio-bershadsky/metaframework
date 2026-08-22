---
name: production
kind: environment
version: 4
title: Production
summary: A Kubernetes cluster on Hetzner in Helsinki running the public demo from a Helm chart — the first environment this solution has ever had that is not somebody's laptop, and it still guarantees nothing.
status: review
owner: sergio-bershadsky
environment-type: production
tags:
  - hosted
  - hetzner
---

**Nothing runs here. The chart now exists and has never been applied to
anything.** `docker/chart/` is in the tree and, on 2026-08-22, lints and renders
manifests, and the container spec it renders was run under Docker to check it
against the real image. That is the extent of it: no server, no cluster, no
kubeconfig, no registry, no pushed image and no DNS record, and no `helm
install` has been run against any cluster at any point. This entity still
describes an intended target, which is what an environment entity is for — "a
description of a target, not of a release".

**Kubernetes** on Hetzner in **Helsinki** (`hel1`, Hetzner's Finnish location),
running [devops](srn://metaframework/product/devops) from the Helm chart under
`docker/chart/`, per
[0005-one-image-two-topologies](srn://metaframework/product/devops/adr/0005-one-image-two-topologies).
One cluster on one machine: the orchestrator is real, the redundancy is not.

## It is a demo, and that is a statement about the audience

What runs here is the **public demo** — the deployment that lets somebody see
the framework working without cloning anything. That is why it is `production`
and not `staging`: it faces people who are not the author, and being broken in
front of them costs something.

It is *not* a reduced build. The demo runs the whole product — the GitHub App,
any granted repository, branch switching — because a demo that cannot show a
real catalog at a real branch does not demonstrate the claim the product makes.
The reduction here is in obligations, not in features: no SLO, no support, no
data anybody may rely on.

## `environment-type: production` and what that does not promise

The type says real data, real users, real SLOs — and two of those three would be
false here, so they are worth separating out rather than letting the enum imply
them.

**Real users: yes**, eventually — people other than the author, reading
descriptions of systems that are not public. That is what makes `production` the
honest value; typing it `staging` would claim a rehearsal for something that
does not exist.

**Real data: no, and deliberately.** Everything persisted is a cache of what
GitHub already holds
([git-state-survives-a-restart](srn://metaframework/product/devops/requirement/git-state-survives-a-restart)).
There is nothing of record here. Destroying the machine costs time.

**Real SLOs: no.** No availability objective, no change window, no on-call, no
alerting, no promotion path — there is nowhere to promote from, since
[compose](srn://metaframework/environment/compose) is a laptop and not a
rehearsal. Every environment this solution has ever declared has said this, and
this one says it while carrying the word "production", which is the only place
the word could mislead.

## One machine, and the arithmetic that makes that a decision

The workload and the thing observing it share the instance
([0004](srn://metaframework/product/devops/adr/0004-signoz-runs-beside-the-workload)),
and the observer is ClickHouse, which will use whatever it is given. Three
things therefore compete for one box: the portal's catalog rendering, which
grows the heap ~250MB per catalog rebuild
(`framework/portal/src/lib/catalog/index.ts`); the git volume, whose cap is a
correctness property rather than housekeeping; and the trace store.

None of the three has been sized, because there is no traffic to size against.
The `topology.yaml` beside this file states the limits as *decisions to be made*
with the reasoning attached, rather than leaving them to chart defaults — which
is the failure mode
[signoz](srn://metaframework/product/devops/component/signoz) is graded
`criticality: 4` on the assumption of avoiding.

The chart that now exists does not resolve this and does not pretend to: it
renders **no `resources` block at all**, which is the unbounded default the
paragraph above warns about. That was the least dishonest of the two options —
a number there would be sizing invented by whoever wrote the template — and the
chart makes the omission loud rather than silent, printing a warning on install
that resources are unset. **The decision is still open, and it is the one this
environment most needs made.**

## Data residency, since the location was chosen

Helsinki is in the EU, and everything this environment holds — repository names,
branch names, file paths, and traces containing all three — describes somebody's
private system. Keeping traces on the same machine
([0004](srn://metaframework/product/devops/adr/0004-signoz-runs-beside-the-workload))
means no third party holds that map. That is a consequence of the observability
decision rather than a compliance claim, and it should not be read as one: there
is no DPA, no processing agreement and no stated retention obligation, because
there is no user but the author.

## What the chart deploys, which is not what `topology.yaml` names

The two disagree, and neither was edited to make them agree.

`topology.yaml` beside this file names three hosts —
[catalog-router](srn://metaframework/product/devops/component/catalog-router),
[repo-sync](srn://metaframework/product/devops/component/repo-sync) and
[signoz](srn://metaframework/product/devops/component/signoz) — and deliberately
omits the portal, for the reason its own trailing comment argues at length:
membership is authored on the component side and
[portal](srn://metaframework/product/portal) declares no environment. The chart
templates none of those three and templates the portal.

That is not the chart being wrong. catalog-router and repo-sync are
`lifecycle: planned` with no code and no image, so a Deployment for either would
name an image that cannot be built; repo-sync also owns the volume whose cap the
sibling `config.yaml` marks unset and required, and a PVC would have to invent
the size that file refuses to state. signoz is `component-type: external`,
deployed from its own chart, and belongs to
[0004](srn://metaframework/product/devops/adr/0004-signoz-runs-beside-the-workload).
The portal is the only member of 0005's "artifact set" that exists. So the
topology is right about authorship and incomplete as a description of what can
be deployed, and the correct fix is the portal declaring this environment — a
change to that product, which has not been made.

Two claims in `topology.yaml` have no chart expression at all, and their absence
should not be read as enforcement:

- **`replicas: { min: 1, max: 1 }`.** A Deployment carries one integer; only an
  HPA has a range, and every host here says `scaling: none`, so shipping one
  would contradict the claim it encoded. The chart renders a single replica and
  refuses to render zero. It does not refuse more than one.
- **`regions: [hel1]`.** There is no Kubernetes equivalent on a single-machine
  cluster. A `topology.kubernetes.io/region` selector would match a label
  nobody set, so no node selector is rendered.

## What is absent, stated once

- **No registry, and no image anywhere but a laptop.** The chart names an image
  repository and a tag and no registry host, because the catalog has never named
  one. Choosing a registry, a tag scheme and a pull policy is one decision and it
  is unmade; until it is, the chart references a tag that no cluster could pull.
- **No TLS decision.** Whether termination is at the instance or in front of it
  is unresolved, and it is the first thing a real deployment must answer. The
  chart leaves ingress off and refuses to render one without a host rather than
  inventing a class, an issuer annotation or a TLS block.
- **No DNS name.** There is no hostname for this product anywhere in the
  repository. `https://schemas.metaframework.dev` remains what it has always
  been — an identity constant at
  `framework/portal/src/lib/schema/url.ts:46` that resolves nowhere — and it is
  not this environment.
- **No backup.** Consistent with holding nothing of record, and it is a
  deliberate consequence rather than an oversight.
- **No second region and no failover.** One machine.
- **Nothing deploys automatically.** CI gates the catalog and the tests and does
  not build images or deploy. Reaching this environment is an
  [operator](srn://metaframework/actor/operator) running a command.
