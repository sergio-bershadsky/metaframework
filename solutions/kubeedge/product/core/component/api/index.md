---
name: api
kind: component
version: 1
title: API types
summary: The shared type library — every custom resource's Go types, every component's configuration types, the shared defaults, and the device-management interface definition.
status: review
owner: sergio-bershadsky
component-type: library
lifecycle: released
tags:
  - types
  - contracts
x-package: github.com/kubeedge/api
---

The single place the project's contracts are declared, and the reason the
runtimes, the installer, the mappers and the console can be compiled separately
without disagreeing about what a device is.

## What is in it

Four families, and the mixture is what makes it interesting:

- **Custom resource types** — devices, device models, device status, the
  message-routing rules and endpoints, the reliable-delivery bookkeeping objects,
  the node groups and edge applications, the resolved-permission object, and the
  operations jobs.
- **Component configuration types** — the nested, API-versioned configuration
  documents the cloud and edge runtimes read, with their defaulting functions.
  Every default port, address and enable flag quoted anywhere in this catalog is
  read from here.
- **Shared constants** — the paths, ports and endpoint defaults both halves agree
  on.
- **The device-management interface definition** — the interface-definition file
  that declares both directions of the gRPC contract between the edge runtime and
  a mapper.

## The fourth family is the odd one

An interface definition is not a type library. It is a normative contract that
other people generate code from, and the project itself describes it in those
terms. A reader could reasonably argue this component should be split, with the
interface definition becoming a `component-type: specification` — a set of
normative documents whose contract surface is the text itself.

This catalog does not split it, and the reason is that the split would not
survive contact with the repository: the definition ships inside the same Go
module as the types, is tagged with them, and is consumed by importing that
module. Modelling it as a separate specification would create an entity with no
independent identity, no independent version and no independent distribution. The
strain is recorded here rather than resolved, because it is a genuine open
question about the `specification` type's boundary: a normative interface that is
distributed as a library is both things at once, and the enum makes you pick.

## One directory, two identities

Like [beehive](srn://kubeedge/product/core/component/beehive), it lives in the
main repository's staging tree and is published to its own repository with its
own tags. The `x-package` field carries the published module path; the directory
path inside the monorepo is the other identity, and the catalog can hold only
one.

## Type discipline

`library`, so no environment. Its consumers are, at minimum, both runtimes, the
installer, the admission webhook, the node-group controller and every generated
mapper — which is as close to "everything" as this catalog has.
