---
name: single-box
kind: environment
version: 1
title: Single box
summary: The project's own reference deployment — every process, the broker, the store and the coordination backend on one host, installed by one command.
status: review
owner: sergio-bershadsky
environment-type: production
tags:
  - reference-deployment
  - single-host
---

What the project's installer produces, and what its documentation calls the
**reference deployment**: a complete StackStorm on one machine. Every supervised
process, the reverse proxy, the document store, the broker and the coordination
backend, side by side, reachable from each other over the loopback interface.

It is described here because it is the shape most installations actually have
and the shape the documentation explains the architecture in. It is not a
sandbox: the project does not describe it as one, real organisations run real
automation on it against real infrastructure, and the execution history it holds
is a record of things that happened.

## Why `environment-type: production`, and the finding underneath that choice

The enum is a ladder of **data reality and blast radius** — nobody's machine,
everybody's sandbox, production's rehearsal, production itself — and read on
that ladder this target is unambiguously the top rung. The data is real, the
users are real, and an automation that misfires here changes something outside
the box.

That answer is correct and it is not the answer a reader needs, which is the
finding. **What actually constrains a component here is topology, and the enum
has no room for topology at all:**

- One host, so every cross-process call is loopback and the broker is local.
- **No coordination backend configured by default.** The coordination URL is
  unset, and the fallback is a **no-op driver**: acquiring a lock always
  succeeds and enforces nothing, and the platform logs that race conditions are
  possible. This is the fact most likely to surprise a reader who assumes one
  host means one process — the concurrency policies an operator configures are
  best effort here, between two runners on this very machine, and not because
  of anything about the machine.
- No replication anywhere. The store, the broker and every process are single
  instances, so every one of them is a single point of failure and none of them
  is described as one anywhere in the type system.

[ha-cluster](srn://stackstorm/environment/ha-cluster) carries the **same
`environment-type`** and agrees with this target about none of the three. Two
entities, one value, and a component designing against either would want to know
completely different things. The specification argues that `edge` is a *shape*
rather than a stage and therefore does not belong on the ladder; single-host
versus clustered is a second shape, it changes what a component may assume just
as sharply, and it is invisible.

## Why there is no `config.yaml`

The environment kind's configuration surface requires keys matching
screaming-snake-case — the shape of an environment variable. This platform's
configuration is an **INI file with sections**: lowercase section names,
lowercase keys with underscores, values that are host names, ports, URLs and
paths. Not one key in it can be written as a `config.yaml` entry without being
renamed into something the software does not read.

Authoring a `config.yaml` here would therefore mean inventing keys. The file is
optional, so it is absent, and this paragraph is the declaration that its
absence is a finding rather than an omission. The same wall stops the
component-side half: a `usage: config` datamodel for any process here would have
to violate the discipline's casing rule on every property, and the pack format's
contract violates three more rules besides — argued on
[bundled-packs](srn://stackstorm/product/automation-content/component/bundled-packs).

## Guarantees, stated at their real strength

- **No availability objective exists.** The project publishes none for this
  shape and this catalog invents none.
- **Everything is a single point of failure**, by construction. That is not a
  deficiency of the deployment; it is what "one box" means.
- **Retention is off unless configured.** Almost nothing is deleted by default,
  so the store grows for as long as the platform runs. See
  [st2garbagecollector](srn://stackstorm/product/platform/component/st2garbagecollector).
- **No secret is declared by this target**, because no configuration surface can
  be declared at all. The secrets are real — a datastore encryption key, an SSH
  key, broker and store credentials — and they live in the INI file and on disk,
  where this catalog can name their existence and nothing else.

## Placement

The sibling `topology.yaml` places every hosted component. Which components run
here is not listed there and is not listed here: it is derived from each
component's own `uses` edge, and the portal renders that roster on this page.
