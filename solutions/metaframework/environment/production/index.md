---
name: production
kind: environment
version: 1
title: Production
summary: A Kubernetes cluster on Hetzner in Helsinki running the public demo from a Helm chart — the first environment this solution has ever had that is not somebody's laptop, and it still guarantees nothing.
status: review
owner: sergio-bershadsky
environment-type: production
tags:
  - hosted
  - hetzner
---

**Nothing runs here.** There is no server, no cluster, no chart and no DNS
record; this entity describes an intended target, which is what an environment
entity is for — "a description of a target, not of a release".

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

## Data residency, since the location was chosen

Helsinki is in the EU, and everything this environment holds — repository names,
branch names, file paths, and traces containing all three — describes somebody's
private system. Keeping traces on the same machine
([0004](srn://metaframework/product/devops/adr/0004-signoz-runs-beside-the-workload))
means no third party holds that map. That is a consequence of the observability
decision rather than a compliance claim, and it should not be read as one: there
is no DPA, no processing agreement and no stated retention obligation, because
there is no user but the author.

## What is absent, stated once

- **No TLS decision.** Whether termination is at the instance or in front of it
  is unresolved, and it is the first thing a real deployment must answer.
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
