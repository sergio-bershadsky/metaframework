---
name: install-a-pack
kind: journey
version: 1
title: Install a pack
summary: Somebody else's integration becomes part of a running platform — a path that crosses all three products and whose middle step is an execution installing the thing that will run executions.
status: review
owner: sergio-bershadsky
actor: /actor/automation-operator
relations:
  uses:
    - /environment/single-box
tags:
  - content
  - cross-product
---

The path that makes this platform extensible, and the one that most clearly shows
why [automation-content](srn://stackstorm/product/automation-content) is a
product rather than a folder. An author publishes an integration; an operator
installs it into a system that is already running; the actions and sensors inside
it start being executed by processes that were started before the pack existed.

## Outcome

A pack the platform had never heard of is installed, configured with this
organisation's own credentials, and visible as actions an operator can run.

## The loop in the middle

`steps[2]` is the interesting one. Installing a pack is itself an **execution**:
the API answers with the execution that is doing the installing, so the operator
then watches an ordinary run whose effect is to change what runs. Nothing in the
path distinguishes it from any other execution, which is exactly the design.

## Where the configuration contract lands

`steps[4]` is where the operator writes the values the pack declared it needs.
The declaration is a
[pack-config-schema](srn://stackstorm/datamodel/pack-config-schema@1) — a real
configuration contract that the framework's own `usage: config` discipline
cannot express, for four separate reasons set out on that entity. This journey is
where a reader meets it as a thing a person does rather than as a schema
complaint.

Secrets go in here too, which is why that step and no other in this catalog
involves a value that must never reach the catalog.

## Preconditions

The operator can reach the registry, or has the pack on disk. An air-gapped
installation walks the same path with a different `steps[0]` — a file rather than
a registry — and the journey would be a different entity, which is the
[no-branching](srn://metaframework/product/specification) rule doing its job.

## Out of scope

Writing the pack. That is
[pack-author](srn://stackstorm/actor/pack-author) work and it happens entirely
outside this solution — an editor, a git repository, and a test run on a laptop.
The journey starts where the pack becomes something another person can install.
