---
name: beehive
kind: component
version: 1
title: Beehive
summary: The in-process module framework both runtimes are built on — registration, lifecycle, and message passing between modules that never call each other directly.
status: review
owner: sergio-bershadsky
component-type: library
lifecycle: released
relations:
  depends-on:
    - /product/core/component/api
tags:
  - framework
  - messaging
x-package: github.com/kubeedge/beehive
---

The reason both runtimes have the shape they have. A module registers itself by
name, is started and stopped by the framework, and communicates with its
neighbours by putting a message on a bus rather than by holding a reference to
them. Nothing in either runtime calls another module's function.

## Why it is worth a component page

Because the module arrangement in
[cloudcore](srn://kubeedge/product/core/component/cloudcore) and
[edgecore](srn://kubeedge/product/core/component/edgecore) is not an
implementation habit — it is this library's contract, and every sub-component in
this catalog under either runtime is a unit **this** library defines. A reader
who does not know that will read "module" as a package boundary; it is a runtime
one, with a lifecycle and an address.

It is also the source of the message envelope everything travels in. A message
carries an identifier, a parent identifier, a routing block and an opaque
payload, and the presence of both a parent identifier and a synchronous flag is
what lets one channel carry both fire-and-forget events and correlated
request-and-reply — a fact that turns out to matter a great deal when the
cloud-edge conversation has to be given a single interaction style it does not
have.

## The word the project reaches for

Its own repository describes it as a framework for pluggable in-process
microservices (<https://github.com/kubeedge/beehive>). That phrase is the exact
concept this framework's `component-type` enum has no value for, arrived at
independently by the project it describes — which is the strongest available
evidence that the gap recorded on both runtime pages is a real one and not a
modelling preference.

## Staged, and published twice

It lives inside the main repository's staging tree and is synced out to its own
repository, where it carries its own tags. So one directory has two package
identities: an import path inside the monorepo and a published module path
outside it. The catalog has one path per component by construction, and the
`x-package` field above carries the second identity because there is nowhere else
for it — the same escape hatch an earlier catalog in this repository invented for
the same reason.

## Type discipline

`library`, so it declares no environment: it has no runtime of its own and runs
inside its consumers. `lifecycle: released` means a version is published and
consumers can depend on it, not that anything is running.
