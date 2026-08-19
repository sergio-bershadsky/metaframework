---
name: reconciliation
kind: component
version: 1
title: Reconciliation
summary: Nightly job proving that the ledger agrees with the acquirer's settlement file.
status: draft
owner: team-billing
component-type: job
relations:
  uses:
    - /environment/staging
    - /protocol/settlement
  depends-on:
    - ../ledger
  implements:
    - ../requirement/audit-trail
tags:
  - finance
  - batch
---

# Reconciliation

A scheduled worker with no inbound surface. It reads the acquirer's settlement
file, replays the [settlement](srn://acme/protocol/settlement) topic for the same
window, and reports any order where the two disagree.

## Status: draft

This description is `draft` and the component declares only
[staging](srn://acme/environment/staging), which is the honest pairing: the job
runs nightly against synthetic data while the discrepancy rules are still being
argued over with the finance controller. A `draft` component declaring
[production](srn://acme/environment/production) would be a claim nobody has
reviewed.

`status` describes this document, not the code. The code exists and runs; what is
unfinished is the agreement about what counts as a discrepancy, which is exactly
the kind of thing that belongs in a reviewed description before it belongs in
production.

## Why a job and not a service

It has no inbound surface at all — nothing calls it, and it answers no request.
That is the whole distinction the `job` type carries, and it is what tells the
portal to draw it outside the request path in the component graph.

## Open question

Whether a discrepancy should raise an alert or open a disputed settlement state.
The [settlement](srn://acme/protocol/settlement) state machine already has a
`disputed` final state, which argues for the second; the finance controller
prefers a human in the loop. Until that is settled this page stays `draft`, and
the [audit-trail](srn://acme/billing/requirement/audit-trail) obligation it
claims is only partly discharged.
