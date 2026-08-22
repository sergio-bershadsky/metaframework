---
name: dashboard-ui
kind: component
version: 1
title: Dashboard UI
summary: The browser front end — a server-rendered TypeScript application that used to be the whole console and is now the half a person looks at.
status: review
owner: sergio-bershadsky
component-type: ui
lifecycle: in-development
criticality: 4
relations:
  uses:
    - /environment/single-machine
  depends-on:
    - ../dashboard-bff
tags:
  - ui
  - console
x-runtime: node
---

The only surface in this catalog a person points at.
[cluster-operator](srn://kubeedge/actor/cluster-operator) is the actor who
reaches it, and it is the second of the two surfaces that actor declares — the
first being a command-line program, which tells you most of what you need to know
about how this system is actually driven.

## What it is, measured

A TypeScript application built on a React framework, rendered by a Node server
rather than exported as static files, using a component library, a data-fetching
layer, a form library with schema validation, and an internationalisation
framework
(<https://github.com/kubeedge/dashboard/blob/v0.2.0/modules/web/package.json>).
It ships a container image definition of its own. Its development environment
carries a switch that turns on mocked responses, which is a fair description of
where the project is with it.

What it can show is bounded by what the backend serves, and that surface is
enumerated on
[dashboard-bff](srn://kubeedge/product/console/component/dashboard-bff)'s page
rather than guessed at from screen names here: the KubeEdge custom resources —
device models, devices, routing rules and their endpoints, node groups and edge
applications — and the ordinary Kubernetes objects around them.

## Why it is `in-development` and not `released`

This is the component where the open-source lifecycle evidence rule this catalog
uses points somewhere uncomfortable, so the reasoning is stated rather than the
conclusion.

`released` means a version shipped and someone outside the building team depends
on it. Measured against the repository at the surveyed tag: two tags exist,
`v0.1.0` and `v0.2.0`; **no** GitHub release accompanies either, so there is no
published artifact; there is no deployment manifest and no chart anywhere in the
repository; and the project's own README opens by saying the project is in
development. The documented way to run it is to install dependencies and start
it from source.

`in-development` — code exists, nothing has shipped in a form a consumer can
depend on — is the accurate reading. The product it belongs to is `incubating`
for the same underlying reason, and the two fields are answering different
questions on the same evidence: whether the position is still being funded into
shape, and whether this particular artifact has shipped.

## Why it declares only the local target

Because that is the only environment the repository describes. There is no
manifest to read, no chart to install, and the backend it talks to binds
loopback by default; the project's own instructions run both halves on a
developer's machine against a named cluster endpoint. Declaring
[cloud](srn://kubeedge/environment/cloud) would be a claim that a console is
deployed into the cluster it manages, which nothing in any KubeEdge repository
supports at this tag, and a placement view showing it there would be showing an
invention.

## What it lost when the backend arrived

At `v0.1.0` this application **was** the console: a single front end at the
repository root, talking to the cluster from the browser. At `v0.2.0` the
repository became a workspace with a separate backend module beside it, and the
front end stopped being the whole thing.

That is a real architectural moment and it is why the console product carries a
`gateway` component at all. This page keeps `version: 1` and no `supersedes`
edge, because the change happened upstream before this catalog described
anything: there is no predecessor entity here to swap away from, and
manufacturing one to record somebody else's refactor would put a fiction in the
history.
