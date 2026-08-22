---
name: mapper-framework
kind: component
version: 1
title: Mapper framework
summary: The scaffold and runtime libraries a driver author generates a mapper from — everything except the file that knows the fieldbus.
status: review
owner: sergio-bershadsky
component-type: library
lifecycle: released
relations:
  depends-on:
    - /product/core/component/api
  supersedes:
    - ../mappers-go
tags:
  - devices
  - codegen
x-package: github.com/kubeedge/mapper-framework
---

A generator and a set of runtime libraries, in one module. Run its one make
target, answer two questions — a name, and whether the device streams — and it
writes a complete Go project whose only unfinished file is the one that knows how
to talk to the hardware
(<https://github.com/kubeedge/mapper-framework/blob/v1.23.0/README.md>).

## What the scaffold contains, and what it leaves blank

The generated tree separates four concerns, and the separation is the framework's
actual contract with its
[audience](srn://kubeedge/actor/mapper-developer):

- **The process and the interface plumbing.** A main entry point, a configuration
  file carrying the device-management interface's gRPC settings, and the client
  and server halves of that interface. The author is told not to change them.
- **The device layer.** Device control, twin reporting and status reporting —
  the code that turns a reading into something the edge runtime understands.
- **The data layer.** Publishing clients for HTTP, MQTT and OpenTelemetry, and
  database clients for two time-series stores, a key-value store and a relational
  one. These are what the device resource's per-property push selection actually
  reaches, which is why the surveyed set of push targets is a fact about
  *this* directory and not about any protocol entity.
- **The driver.** Two files, one of which is a set of stubs marked as the
  author's work: open the device, read a property, write a property, close.

That last split is the whole product argument. A driver author writes a fieldbus
client and never learns the cloud-edge channel, the twin model or a custom
resource; everything above the driver is generated identically for every mapper
in existence.

## Type, and the two disciplines it satisfies awkwardly

`library`: a build-time artifact with no runtime of its own, so it declares no
environment. That much is clean — nothing deploys this.

The awkward part is the discipline's other half, which expects a library to be
depended on by at least one component. It is, by
[mapper](srn://kubeedge/product/device-integration/component/mapper) — but the
dependency is unusual in kind. A mapper does not link this library the way a
service links a shared package: the framework **copies itself into** the
generated project as source, and then the generated project imports the runtime
packages that stayed here. It is a code generator and a library at once, and the
component graph shows only the second relationship.

There is no `component-type` for a generator, and this catalog is not asking for
one: `library` is the nearest fit, the nuance is a paragraph rather than a
field, and inventing a value for a thing one component in one catalog does would
be exactly the mistake the closed enum exists to prevent.

## Staged twice, published twice

Like [beehive](srn://kubeedge/product/core/component/beehive) and
[api](srn://kubeedge/product/core/component/api), this module lives inside the
main repository's staging tree and is synced out to a repository of its own,
where it carries its own tags. Its `x-package` field above holds the published
module path, because the catalog has one path per component by construction and
there is nowhere else for a second identity to go.

Its own dependency on [api](srn://kubeedge/product/core/component/api) is the one
that matters: the generated interface code is built against the shared
device-management types, which is what keeps a mapper compiled today speaking the
same interface the edge runtime speaks.

## The `supersedes` edge, and what it is being made to mean

The edge above points at
[mappers-go](srn://kubeedge/product/device-integration/component/mappers-go), and
it is being used slightly outside its definition, deliberately.

`supersedes` is defined as the **catalog's** swap edge: an author creates a
successor entity, migrates referrers, and deprecates the predecessor's document.
Nothing like that happened here. Both entities are first-version descriptions of
two real repositories that coexist upstream, one of which stopped moving while
the other kept going.

The edge is used anyway because `lifecycle: sunset` on the predecessor asserts
that a successor exists — that is what the value means — and there is no other
field in which to say *which*. So the predecessor keeps `status: review`, since
its description is current and accurate rather than retired, and this edge
carries the one fact the lifecycle value presupposes and cannot name.
