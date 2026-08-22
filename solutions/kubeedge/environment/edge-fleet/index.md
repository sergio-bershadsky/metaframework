---
name: edge-fleet
kind: environment
version: 1
title: Edge fleet
summary: The machines at sites — production obligations, no assumption of reach to the cloud, and a site count nobody enumerates.
status: review
owner: sergio-bershadsky
environment-type: edge
tags:
  - edge
  - autonomy
  - offline
---

The half of the system that has to keep working when the other half is
unreachable. An edge node is an ordinary machine at a factory, a substation, a
shop or a vehicle, enrolled once by the installer and thereafter running
containers, driving devices and answering local reads whether or not the cloud is
there.

This is the first entity in any catalog in this repository to carry
`environment-type: edge`, and the value's definition was written before any such
system was in view. It holds exactly: production obligations, geographic or
physical distribution, and only intermittent connection to the core. The
specification argues that `edge` is a shape rather than a stage because it breaks
the one assumption every other value grants for free — that a component can reach
the core synchronously and see one consistent state — and that the portal must
know it before it opens `topology.yaml`. That argument survives contact
unchanged. What did not survive is the artifact behind it.

## Why `topology.yaml` cannot describe this

The sibling file is authored, and it states something that is not quite true, on
purpose and with the untruth marked.

Placement here is: **one instance per site; sites number N; N is unbounded,
changes without a commit, and is enumerated nowhere in any repository.** The
format offers `regions[]` — a list of named places — and `replicas: {min, max}`
per host. Neither can hold that sentence:

- Enumerating regions means listing every site. The project's own published
  scalability report exercised a fleet far larger than any list a human would
  write (<https://kubeedge.io/blog/scalability-test-report/>), and in a real
  deployment the list changes when somebody installs a machine.
- Omitting `regions` is defined to mean a single unnamed region, which asserts
  one place. That is the one thing this environment definitely is not.
- `replicas` is per component per environment, so "one edgecore per node" and
  "the node count is unbounded" cannot both be said: the first is `{min: 1, max:
  1}` and the second has no field.

What the file therefore does is declare a single region whose name denotes a
**class** of site rather than a place, and say so in its own notes. That is
honest and it is not a description of a deployment. The enum value is right; the
artifact contract behind it has now met an edge deployment for the first time and
did not fit.

## What still works while disconnected, and where that had to go

Autonomy is the whole reason this environment exists, and the catalog has no
field for it. The mechanisms are real and specific:

- The edge runtime keeps a node-local store of the Kubernetes objects it has
  already seen, and serves reads from it.
- A node-local, Kubernetes-shaped HTTP surface answers those reads for workloads
  and for the installer's inspection subcommands, with no cloud round trip.
- Workloads the operator has labelled for offline autonomy are not evicted while
  the node is unreachable.
- Reconciliation happens on reconnect, on the runtime's own interval.

None of that is expressible as structured catalog content. `environment-type:
edge` grants "intermittently connected"; nothing anywhere says *what still
answers* while it is. The whole statement above is prose, and a reader who skips
prose gets an environment that looks like a production cluster with a bad
network. A degradation statement on the environment, or a naming convention for
autonomy requirements, would be the additive fix; neither exists, and this
paragraph is the workaround.

## Guarantees, at their real strength

- **Production obligations, no published objective.** Real workloads and real
  devices, and the project publishes no SLO for any of it. Nothing here invents
  one.
- **The link is expected to be down.** Not "may occasionally fail" — the design
  premise is that it is absent for meaningful periods, and every component hosted
  here is built for that.
- **The broker is local.** The MQTT broker the device path uses is installed onto
  the edge nodes themselves by the cloud chart, so the device data path never
  crosses the link at all.
- **No shared state between sites.** Two edge nodes have no reason to agree about
  anything, and the mesh agent's cross-site tunnel is the only thing that
  connects them.

## The configuration surface, and what it can and cannot see

The sibling `config.yaml` is short, and its shortness is evidence rather than
neglect — see [cloud](srn://kubeedge/environment/cloud) for the full argument.
The keys it does carry are real: the generated mapper's database-publishing
clients read their credentials from the process environment, which is the one
place in this entire system where the framework's flat, `SCREAMING_SNAKE_CASE`,
one-scalar-per-key contract describes the reality exactly.

There is one nuance the format cannot express and it is worth recording. The mesh
agent's DaemonSet sets environment variables from the Kubernetes downward API —
the node's own name, the namespace — which are variables the *manifest* injects,
not values an operator supplies. A `config.yaml` entry means "this target
provides this key, and here is where its value comes from"; there is no way to
mark a key as provided by the platform's own introspection rather than by
whoever installs it, so those keys are simply absent here.
