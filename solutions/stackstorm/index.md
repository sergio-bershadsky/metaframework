---
name: stackstorm
kind: solution
version: 1
title: StackStorm
summary: Event-driven operations automation — sensors, rules, actions and workflows over a topic-exchange message bus — described from the project's public sources.
status: review
owner: sergio-bershadsky
vision: |
  One described universe for an automation platform this catalog did not write: a
  ring of supervised processes that talk to each other almost entirely over a
  broker, three surfaces an operator touches, and a content format that is
  installed at runtime and then executed inside the processes that host it. The
  description exists to test the ontology against a system whose centre of
  gravity is a message bus — the first in this repository — and to record, on
  the entity that hits it, every place the framework's own vocabulary had no
  word for what the code does. Nothing here is a proposal. It is one reviewer's
  reading of a system that already runs, in production, at organisations this
  catalog has never met.
scope:
  in:
    - The st2 server processes, the shared Python package they are built from, and the workflow engine beside it.
    - The infrastructure the reference deployment installs alongside them, described as external components.
    - The operator surfaces — web UI, CLI and Python bindings, and the ChatOps bridge.
    - The pack format, the packs the project bundles, and the registry packs are installed from.
    - The three deployment shapes the project publishes for itself.
  out:
    - The contents of any pack the project does not ship.
    - The RBAC and LDAP authentication backends, which are separate distributions and were not surveyed.
    - The behaviour of the machines StackStorm acts on — they are actors, not components.
    - Any statement about how a particular organisation operates StackStorm.
contacts:
  - role: surveyor
    handle: sergio-bershadsky
  - role: upstream-project
    handle: stackstorm
    channel: https://github.com/StackStorm/st2/issues
tags:
  - automation
  - event-driven
  - amqp
  - surveyed
---

A description of software this catalog does not own. StackStorm is an Apache-2.0
project — verified against the GitHub API for `StackStorm/st2` and for every
sibling repository named below — and everything here was read from its public
repositories, its published release artifacts, and its own documentation site.
No upstream prose, README text or source was copied; every fact below is a name,
a structural claim, or a constant restated in this catalog's own words.

## The release this describes, and the ref facts were read at

The release train this describes is **v3.9.0**, published 2026-01-12
(<https://github.com/StackStorm/st2/releases/tag/v3.9.0>). The version is pinned
once, here; no entity below restates it, because a per-entity version would be a
second clock that disagrees with this one inside a release.

Two things follow, and both are stated rather than smoothed over. First, the
source facts on the component pages — port numbers, section names, exchange
names — were read from `master`, not from the v3.9.0 tag, so any entity quoting
one says where it came from. Second, the repositories are on **separate release
trains**: `StackStorm/st2`, `StackStorm/st2web`, `StackStorm/orquesta`,
`StackStorm/st2chatops`, `StackStorm/st2-docker` and
`StackStorm/stackstorm-k8s` each move independently, and the pages of the
components that come from them say so where it matters.

## What the system does, in one paragraph

A **sensor** watches something outside StackStorm and emits a **trigger
instance**. A **rule** matches trigger instances against criteria and maps their
payload onto an **action**'s parameters. An action is a Python plugin or a script
that runs somewhere — locally, or over SSH or WinRM on a machine StackStorm does
not otherwise describe — and several actions stitched together are a
**workflow**. Every one of those handoffs is a message on a topic exchange, and
every one of them is recorded, which is why the audit trail is a first-class
feature rather than a log. The whole product is that loop plus the surfaces from
which a human drives and inspects it.

## Three products, and why the line sits there

- [platform](srn://stackstorm/product/platform) — the supervised server
  processes, the package they share, the workflow engine, the reverse proxy and
  the three infrastructure systems the reference deployment installs. One
  repository, one release train, one group of maintainers.
- [operator-surfaces](srn://stackstorm/product/operator-surfaces) — the web
  UI, the CLI and Python bindings, and the ChatOps bridge. Three different
  repositories, three different languages, three different distribution
  channels, and one shared consumer: a person.
- [automation-content](srn://stackstorm/product/automation-content) — the
  packs the project bundles and the registry the rest are installed from. This
  is the product whose unit of delivery is not a process at all.

The split follows what the project actually publishes rather than the picture
its architecture page draws. A cloud/edge-style functional split would cut
`st2common` in half; a per-process split would create eleven products with one
owner between them.

## Where the protocols live

The three HTTP surfaces an operator reaches — the REST API, the authentication
endpoint and the event stream — are exposed by `platform` and consumed by
`operator-surfaces`, so their nearest common ancestor is the **solution root**.
The bus protocols are internal to `platform` and sit inside it.

That reproduces, from a completely different architecture, the finding
[brass](srn://brass) records about its own protocol placement: the product that
looks like the centre of the system exposes almost no protocol that is only its
own, because the second product speaks every surface the first one offers. Two
catalogs, no shared content, the same shape.

## What this catalog deliberately does not model

- **The insides of MongoDB, RabbitMQ and Redis.** All three are `external`
  components. The solution owns their *deployment* and not their *software*, and
  the type set splits on ownership of the software.
- **Any pack the project does not ship.** The registry is described as the
  boundary it is; what an operator installs from it is theirs.
- **Any throughput, latency or fleet number.** None was measured, none is
  published in a form this catalog could cite, and the project's own marketing
  count of packs and actions is a claim about a registry rather than a
  measurement of anything in a repository.

## Where the ontology did not fit

The strains are recorded on the entities that hit them rather than collected
here, so a reader meets each one with the evidence in front of it. The five
worth knowing about before reading anything else:

- A **pack** fits neither `library` nor `content`: it is installed at runtime
  and then executed inside its host. See
  [bundled-packs](srn://stackstorm/product/automation-content/component/bundled-packs).
- **Deployment packaging** — a Helm chart — has no `component-type` at all. See
  [stackstorm-k8s](srn://stackstorm/product/platform/component/stackstorm-k8s).
- **`environment-type` measures data reality**, and the fact that decides what a
  component may assume here is topology. Two of the three targets below carry
  the same value and agree about almost nothing. See
  [single-box](srn://stackstorm/environment/single-box).
- **One distribution, two component identities** — the CLI and the Python
  bindings are one package. See
  [st2client](srn://stackstorm/product/operator-surfaces/component/st2client).
- **A correctness constraint on replica count** has no home in the component
  contract. See
  [st2timersengine](srn://stackstorm/product/platform/component/st2timersengine).

Nothing in this catalog crosses `srn://stackstorm`.
