---
name: operator
kind: actor
version: 2
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

## No protocol names this actor

`W_ACTOR_ORPHAN` is raised against this page, and it stands for the same reason
as on [git](srn://metaframework/actor/git): the finding is true and the fix would
be a lie. The one devops protocol,
[worktree-lease](srn://metaframework/product/devops/protocol/worktree-lease), is a
conversation between the router and the sync loop with no human on either lane.
The four journeys this solution holds are led by
[reviewer](srn://metaframework/actor/reviewer) twice, by
[catalog-author](srn://metaframework/actor/catalog-author), and by
[ai-author](srn://metaframework/actor/ai-author); no step in any of them hands a
move to this one.

An operator does walk [read-a-branch](srn://metaframework/journey/read-a-branch),
as the section above says — but a journey has one `actor`, and changing it here
would rewrite whose journey it is to clear a warning about a different entity.
The accurate statement is the one this page already makes: the role exists
structurally, nothing in the described system talks to it yet, and the day
something does — an alert, a lease it has to break by hand — the warning goes on
its own.
