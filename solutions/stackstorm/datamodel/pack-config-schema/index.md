---
name: pack-config-schema
kind: datamodel
version: 1
title: Pack config schema
summary: The real configuration contract in this system — a map of snake_case attributes in a modified draft-04 dialect, and the shape the framework's usage:config discipline cannot hold.
status: review
owner: sergio-bershadsky
usage: both
abstract: false
tags:
  - packs
  - configuration
  - ontology-strain
---

Every pack may ship a file declaring what it needs to be told: credentials, an
endpoint, a region, a path. The platform reads that file at install time, stores
it against the pack, serves it over the REST API, renders a form from it in the
web UI, and validates the operator's answers against it before any action in that
pack runs. It is a configuration contract in the full sense the framework means —
declared before the process starts, checked against what a deployment provides,
with secrets marked as such.

And the framework cannot describe it. This entity is `usage: both` rather than
`usage: config` for a reason worth reading in full, because the reason is a
finding about the ontology rather than about the project.

## What the file actually is

The root of the file is **not** a JSON Schema object. It is a bare map from
attribute name to attribute descriptor — no `type: object`, no `properties`
wrapper. The platform stores that map under an `attributes` field beside the
pack's name, which is the model this entity describes.

Each descriptor is written in a dialect the project vendors and modifies: JSON
Schema **draft-04**, extended with three keywords of its own — `secret`,
`position`, `immutable` — and with `required` **redefined as a boolean on the
property**, which is draft-03's spelling rather than draft-04's array. Nested
objects are supported, used, and tested; a fixture in the project's own test
corpus nests three levels deep.

The vendored meta-schema still declares its `$schema` and its `id` as
`http://json-schema.org/draft-04/schema#`. So a document that is not draft-04
identifies itself as draft-04 — the exact failure mode this framework's own
dialect-header contract exists to prevent, found in the wild, in the file that
defines the dialect.

## Why `usage: config` was refused, rule by rule

The framework's config discipline states five shape rules. This contract breaks
four of them, and the fifth does not apply:

- **Root `type` is `object`** — the authored file has no root type at all; it is
  a map whose members are descriptors.
- **Every property name matches `^[A-Z][A-Z0-9_]*$`** — the names are
  snake_case, because they are read as Python keyword arguments and rendered as
  form labels, never exported into an environment.
- **Every property is a scalar** — nested objects are a supported and exercised
  feature.
- **`writeOnly: true` marks a secret** — this dialect marks secrets with
  `secret: true`, which the platform reads to decide encryption at rest and
  masking on read.
- **At most one concrete contract per bucket** — vacuous here, because the
  contract is per pack and packs are installed at runtime.

The discipline's own justification says it encodes the shape of a process
environment, and that is exactly right and exactly the limit: this configuration
is not a process environment. It is a document, per installed unit of content,
that outlives the process and is edited by a different person than the one who
deployed it.

## The second contract, which is also not a process environment

The platform's own settings are an INI file with sections — a messaging section,
a database section, one per service. Lowercase keys, sectioned, never
environment-variable shaped. It has no entity here at all, because the framework
has no artifact for it: a `usage: config` contract could not carry the section
names, and an environment's own config artifact describes what a target provides
rather than what the software reads.

So this system has two configuration contracts, both real, both checkable by the
software itself, and the ontology can hold neither.

## What this entity does describe

The stored form: a pack reference plus the attribute map, with the descriptor
shape stated as far as it is closed. `$defs/attribute` below states the
descriptor's own recursion — a descriptor may carry `properties` whose members
are descriptors — which is legal here as a local pointer and is the only way to
say "nested, arbitrarily deep" without inventing a bound.

Read at `v3.9.0`:
[`st2common/st2common/models/api/pack.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/models/api/pack.py),
[`st2common/st2common/util/schema/__init__.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/util/schema/__init__.py),
[`st2common/st2common/util/schema/custom.json`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/util/schema/custom.json),
[`st2common/st2common/util/config_loader.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/util/config_loader.py),
[`contrib/examples/config.schema.yaml`](https://github.com/StackStorm/st2/blob/v3.9.0/contrib/examples/config.schema.yaml).
