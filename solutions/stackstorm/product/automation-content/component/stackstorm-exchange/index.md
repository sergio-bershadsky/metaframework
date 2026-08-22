---
name: stackstorm-exchange
kind: component
version: 1
title: StackStorm Exchange
summary: The registry packs are installed from — a GitHub organisation of pack repositories, described locally because something here has to name it in an edge.
status: review
owner: sergio-bershadsky
component-type: external
lifecycle: released
criticality: 4
tags:
  - registry
  - boundary
---

Where `st2 pack install <name>` gets a pack from. It is a GitHub organisation
holding one repository per pack, with an index the platform resolves a name
against. The platform's own pack-management actions clone from it, install the
pack's dependencies, and register the result.

## Why this is an `external` component and not an `external-system` actor

The two descriptions compete directly here, and the boundary test decides it on
question three: does anything in this solution need to name it in a `uses`,
`exposes`, `depends-on` or `implements` edge?

It does.
[bundled-packs](srn://stackstorm/product/automation-content/component/bundled-packs)
contains the pack that performs installs, and that pack's whole purpose is to
fetch from here. No forward edge in the relation table accepts an actor target,
so describing the registry as an actor would leave the dependency unwriteable —
and the edge is the most important true sentence about this thing.

The contrast with [monitoring-system](srn://stackstorm/actor/monitoring-system)
is exact and worth keeping in view: that one pushes on us and nothing here names
it, so it is an actor; this one is pulled from and something here names it, so
it is a component. Same solution, opposite answers, one mechanical test.

## The boundary

A pack name resolves to a repository, a repository yields a directory tree in
the pack layout, and the platform validates that tree at registration. That is
the whole contract: a naming scheme and a file layout, with no API of this
project's design in between.

What is deliberately not described: how the registry is governed, what review a
pack passes to get in, or what is in it. The population is large, moving, and
somebody else's; the project publishes a headline count of packs and actions,
and that is a marketing figure about a registry rather than a measurement this
catalog could stand behind.

## No children, and no environment

An `external` component may not contain child components — the framework forbids
describing somebody else's insides — and none is wanted here. It declares no
environment either: it is reachable from wherever the platform has network, and
"the internet" is not a deployment target of this solution.
