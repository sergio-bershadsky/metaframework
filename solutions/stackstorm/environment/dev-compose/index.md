---
name: dev-compose
kind: environment
version: 1
title: Dev compose
summary: The project's container-compose deployment — the whole stack brought up together, published by its own repository as explicitly not for production.
status: review
owner: sergio-bershadsky
environment-type: dev
tags:
  - compose
  - containers
  - disposable
---

One container per process, brought up together from a compose file the project
publishes in a repository of its own. Every supervised process is there, the
three infrastructure systems are there, the web interface and the command-line
tool are there, and the ChatOps bridge is there as a service like any other.

Its own repository states its purpose without hedging: it is **not designed to
be used in production**; it exists to try StackStorm out and to develop packs
against it. That sentence is what types this entity, and it is the only sentence
in this catalog that settles an `environment-type` outright.

## Why `dev` and not `local`

This is the first entity in any catalog in this repository to carry
`environment-type: dev`, and the value was defined before any candidate for it
was in view. It reads: shared and integrated, disposable, synthetic data only,
components may be `draft` here. The rival value, `local`, reads: a single
developer's machine, no shared state, no data of record, ephemeral, anyone may
break it at any moment.

Three of the four tests decide it, and they decide it the same way:

- **Integrated.** This is the whole platform standing up together — not one
  process a developer runs. That is what distinguishes the two values most
  sharply, and it is unambiguous here.
- **Disposable, synthetic data only.** The upstream repository says so in as
  many words: it exists to test the platform out, and it disclaims production
  use rather than merely omitting to recommend it.
- **Components may be `draft` here.** This is where a pack under development
  runs before it is fit for anywhere else, which is the vendor's stated reason
  for shipping it.

The fourth test — **shared or one person's machine** — is the one that does not
decide, and the reason is worth naming rather than smoothing over: it is not a
property of this artifact at all. A compose file runs wherever a container
runtime runs, which may be a laptop or a box a team keeps for the purpose, and
nothing in the file knows which. The half of the `dev`/`local` distinction that
depends on *who else can reach it* is a fact about a deployment, and what this
entity describes is a published artifact.

So `dev` is carried on the three tests that the artifact itself answers, and
this paragraph is the record of the one it cannot. The framework's own
observation stands and is sharpened by it: `dev` has been empty across every
catalog here because those catalogs describe software that is **shipped** rather
than **operated**, and their integration happens either in CI — which the
specification routes to an actor, not to an environment — or in installations
the solution does not run. This target is the exception because the project
ships the integrated deployment itself.

## What it is not

Not a rehearsal for production. `staging` means production-shaped: same
topology, same protocol versions, non-production data — and this target's
topology is deliberately not production's. It is one container per process on
one container host, with none of the replication
[ha-cluster](srn://stackstorm/environment/ha-cluster) has and none of the
package-managed arrangement
[single-box](srn://stackstorm/environment/single-box) has. It is a third shape,
which is the same point those two entities make between them.

## Why there is no `config.yaml`

Unchanged from the other two targets: this platform's configuration is an INI
file with lowercase sectioned keys, and the environment kind's key grammar
admits only screaming-snake-case. The compose deployment adds its own layer —
container environment variables that generate that INI file — and those *would*
fit the grammar, which makes the omission a judgement rather than an
impossibility. It is omitted because declaring the generator's variables while
being unable to declare the configuration they generate would describe the
wrapper and not the thing, and would put this target's configuration surface in
a different vocabulary from the other two.

## Guarantees

- **None, and that is the point.** No availability objective, no data of record,
  no promise that a container that stops will come back with anything in it.
- **Secrets appear to be generated locally.** The compose file carries a helper
  service alongside the platform's own, whose name states that it makes them;
  this catalog is reading a service name rather than the script behind it, and
  says so. The arrangement it implies — credentials minted on the host at
  bring-up rather than supplied by an operator — is fine here and would be
  unacceptable on either other target.

## Placement

The sibling `topology.yaml` lists one instance of each service. Membership is
derived from the components' own `uses` edges.
