---
name: operator
kind: actor
version: 1
title: Operator
summary: Whoever keeps the hosted deployment running — the first role in this solution that is answerable for something being up, and today the same person as everyone else.
status: review
owner: sergio-bershadsky
actor-type: human
goals:
  - Install the GitHub App and deploy the chart without reading the source to work out what a value means.
  - Find out why a page was slow twenty minutes ago, from traces, without attaching to a process.
  - Be told the volume is filling before a fetch fails, rather than by every branch breaking at once.
  - Rotate the App private key, and destroy the volume, without losing anything that matters.
tags:
  - hosted
  - operations
---

New with [devops](srn://metaframework/product/devops), and the reason the product
needed to exist as a product: this is the first actor in this solution who is
answerable for something being *up*.

Every other actor here reads or writes a description.
[reviewer](srn://metaframework/actor/reviewer) judges one,
[catalog-author](srn://metaframework/actor/catalog-author) writes one,
[schema-consumer](srn://metaframework/actor/schema-consumer) fetches from one,
and [git](srn://metaframework/actor/git) is a binary. None of them can be
paged. This one can — in principle.

## In principle, and not in practice

There is no on-call, no alerting, no SLO and no rota; the environments this
solution declares state in writing that they guarantee nothing, and
[0004](srn://metaframework/product/devops/adr/0004-signoz-runs-beside-the-workload)
says plainly that SigNoz here is something opened *after* somebody complains.
So the goals above describe a role that exists structurally and is, today,
performed by the same one person who wrote everything else in the repository.

Naming the role anyway is the point. A deployment with no named operator does
not have no operator — it has an unnamed one, and the questions this actor's
goals raise (what does that config key mean, where do I see why it was slow,
what happens when the disk fills) are answered badly by default when nobody is
listed as the person who will ask them.

## What distinguishes them from a reviewer

A [reviewer](srn://metaframework/actor/reviewer) is a *user* of devops: they
sign in, pick a branch, and read. That path is
[read-a-branch](srn://metaframework/journey/read-a-branch), and an operator
walks it too.

What only this actor does is everything around it — installing the App onto
repositories, supplying the private key at deploy time, choosing the volume cap,
setting trace retention, and deciding when the machine needs to be bigger.
Those are the decisions the catalog records in
[production](srn://metaframework/environment/production)'s artifacts, and this
actor is who reads them.

## The goal that is hardest to satisfy

The first one. `config.yaml` in an environment entity names keys and their
origin and never their values, which is the right rule and leaves a gap: knowing
that `GITHUB_APP_PRIVATE_KEY` comes from the deployment does not tell somebody
how to obtain one. The catalog is not a runbook and should not become one; but
this actor's first hour is spent on exactly the questions the catalog declines
to answer, and nothing in this repository currently bridges that.

## Not this actor

The **CI runner** is not modelled here and must not be — the environment kind
says so explicitly: a pipeline is not a deployment target, and a runner is
`actor-type: system` if it is modelled at all. It is not, because nothing in
this catalog needs to point at it.

GitHub is not an actor either. It is
[github](srn://metaframework/product/devops/component/github), an `external`
component, because things this solution calls are components and things that
call this solution are actors — and devops calls GitHub, not the reverse.
