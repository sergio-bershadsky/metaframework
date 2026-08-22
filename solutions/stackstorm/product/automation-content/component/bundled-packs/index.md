---
name: bundled-packs
kind: component
version: 1
title: Bundled packs
summary: The packs the platform installs with itself — and the entity that shows a pack fits neither library nor content, because it is installed at runtime and then executed.
status: review
owner: sergio-bershadsky
component-type: content
lifecycle: released
criticality: 3
relations:
  depends-on:
    - /product/platform/component/st2actionrunner
    - /product/platform/component/st2sensorcontainer
    - ../stackstorm-exchange
tags:
  - packs
  - extensibility
x-type-strain: runtime-installed executable plugin bundle
x-install-root: /opt/stackstorm/packs
---

The packs that arrive with the platform rather than from the registry: the core
action set, the local-and-remote shell actions, the pack-management actions that
install everything else, the chat aliases, and a set of examples. They are
ordinary packs — the same layout, the same registration path, the same
configuration mechanism as anything an operator installs later.

## How the content reaches its host, which the `content` discipline asks for

A pack is unpacked into a directory under the install root recorded above, given
a Python virtual environment of its own into which its declared dependencies are
installed, and registered with the platform. Thereafter its **actions run inside
[st2actionrunner](srn://stackstorm/product/platform/component/st2actionrunner)**
and its **sensors run under
[st2sensorcontainer](srn://stackstorm/product/platform/component/st2sensorcontainer)**
— which is what the two `depends-on` edges above say, and why they point at
processes rather than at a package manager.

## The strain, which is the reason this entity is worth reading

Neither candidate type is true, and the failure is not a matter of emphasis.

- **`library`** means a **build-time** artifact with no runtime of its own that
  runs inside its consumers. The second half fits exactly — a pack's code
  executes inside the runner and the sensor container. The first half is simply
  false: a pack is installed while the platform is running, by a command an
  operator types, from a registry or a git URL, and no consumer of it depends on
  it at build time. Nothing about a pack is present when the platform is built.
- **`content`** — carried above, as the nearest — means versioned content
  consumed **by being read**, by a person or a model. A pack is not read. It is
  imported and executed, in a subprocess, with its own dependency tree.

The missing concept is a **runtime-installed executable plugin bundle**: a
versioned unit with its own author, its own release, its own dependencies and
its own configuration contract, installed into a running host and then executed
by it.

This is the second time this repository has landed on that gap from unrelated
code — a sibling survey of an entirely different system recorded the same
nearest-fit choice, in the same words, about a plugin format of its own. Two
catalogs sharing no content and arriving at one hole is exactly the pattern that
justified appending `content`, `application` and `specification` to the type set,
and none of those three covers this one.

## The configuration contract that cannot be authored

A pack declares what configuration it needs in a schema file inside the pack,
and instances of it land in a per-pack file at install time. Every one of those
facts violates the framework's `usage: config` discipline:

- Keys are lowercase with underscores; the discipline requires
  screaming-snake-case, because it encodes the assumption that configuration is
  environment variables.
- **Nested objects are supported and used**; the discipline requires a flat root
  of scalars.
- Secrets are marked with the pack format's own boolean; the discipline requires
  a specific JSON Schema keyword.
- Defaults sit under the pack format's own key rather than the schema keyword the
  discipline reads.

The awkward part is how close it already is. A pack's schema is JSON
Schema-shaped — `type`, `description`, `properties`, `additionalProperties`,
`default` — with two departures: requiredness is a per-property boolean rather
than a list on the parent, and secrecy is a keyword of the pack format's own
invention. So the gap between this and a `usage: config` datamodel is not a
translation problem, it is four discipline rules, three of which are about
casing and shape rather than meaning. The discipline is locked for the release
this catalog is written against and has not shipped, so it is still cheap to act
on, and this entity is the evidence.

## Fidelity, and why no documents are listed here

The `content` discipline requires this entity to list its documents as artifacts
on disk and to state what keeps them true. Neither is possible: the documents
are somebody else's files under an Apache-2.0 licence, and this catalog cites
rather than vendors them. Nothing keeps this description true of them except a
re-read. The discipline assumes content that lives in the same repository as the
entity describing it, and every surveyed catalog breaks that assumption by
construction.

## No environment

Content declares none, and here the rule produces an odd result worth naming: a
pack is installed into a specific running platform, which is the most
environment-shaped fact about it. What runs is the host, and the host declares.
