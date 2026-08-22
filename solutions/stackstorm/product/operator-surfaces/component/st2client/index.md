---
name: st2client
kind: component
version: 1
title: st2client
summary: One published distribution that is two things — the command-line tool an operator runs, and the Python bindings other people's code imports.
status: review
owner: sergio-bershadsky
component-type: application
lifecycle: released
criticality: 3
relations:
  uses:
    - /environment/single-box
    - /environment/dev-compose
  depends-on:
    - /product/platform/component/st2api
    - /product/platform/component/st2auth
tags:
  - cli
  - client
x-runtime: python
x-package: st2client
x-install-channel: pypi
x-second-identity: library
---

The distribution an operator installs when they install nothing else. It is
published on PyPI under the name in `x-package`, its own summary describes it as
both a client library and a command-line interface, and it is built from the
platform's repository while being released as its own package.

The `application` discipline's three requirements are met by the fields above:
package identity, install channel, and a source of truth for the version — the
package metadata on the index, which is the only place a consumer can look.

## The strain: one artifact, two component identities

This is the sharpest instance in this catalog of a type that has to be chosen
rather than determined.

- As an **application**, it is a program a person installs and runs. That is
  what an operator means by "the CLI", it is how the tool is documented, and it
  is why the distribution exists.
- As a **library**, it is the Python bindings that other code imports to talk to
  the API — including code inside packs, written by people who never invoke the
  command.

Both readings are true of the same artifact at the same time. The framework
offers no way to say so:

- Splitting it into two components would give one published distribution two
  SRNs, two version histories and two owners, which the single-ownership rule
  forbids for good reasons and which would make "who depends on st2client" an
  ambiguous question.
- Not splitting it forces one of the two types to be wrong, and the type is not
  documentation — it is an input to the graph and to the disciplines.

`application` is carried because the install channel and the run-as-one-unit
reading are the halves a reader most needs, and because the library reading
would trip the `library` rule that forbids declaring an environment, which is
false of a tool people install on a workstation. `x-second-identity` records the
other half where no check will see it.

Worth noting for the framework: `application` was appended to the type set in
order to close a gap, and on this artifact it **opened a seam** rather than
closing one — before it existed, the choice was between `library` and nothing,
and now it is between two values that are each half right.

## Environments, and the one that is missing

It is declared on the single-host deployment, where the installer puts it on the
box, and on the compose deployment, whose service list includes a container for
it. It is not declared on the clustered deployment.

The environment it most obviously runs in — an operator's own workstation — is
not an entity in this catalog and should not be: it is not a deployment target
of this solution, it is where a person keeps their tools. That absence is a real
limitation of the environment kind for any component that ships to users, and it
is the same gap that makes the local-versus-shared question hard on
[dev-compose](srn://stackstorm/environment/dev-compose).
