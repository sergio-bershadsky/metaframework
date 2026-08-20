---
name: audience
kind: component
version: 2
title: Audience
summary: Materialized segment membership — rebuilt nightly, read on the checkout path, never enumerable by a human.
status: draft
owner: team-growth
component-type: datastore
lifecycle: in-development
relations:
  uses:
    - /environment/staging
    - /product/growth/protocol/redemption-events
  implements:
    - /requirement/gdpr-erasure
tags:
  - promotions
  - privacy
---

Holds one membership set per
[audience-segment](srn://acme/product/growth/datamodel/audience-segment@1), keyed
by account. It answers two questions and refuses every other one: *is this
account in that segment* — on the checkout path, in single-digit milliseconds —
and *how large is that segment*, for
[campaign-manager](srn://acme/product/growth/component/campaign-manager)'s
authoring screen.

## Why a datastore and not a job

The nightly rebuild is the obvious part of this component and the least
important one. What justifies its existence as a separate component is the read
surface: a membership test that
[promotion-engine](srn://acme/product/growth/component/promotion-engine) can
afford inside the budget in
[promotion-evaluation-budget](srn://acme/product/growth/requirement/promotion-evaluation-budget).
A component whose defining property is the shape of the data it serves is a
datastore, whatever else it also does on a schedule.

Compare [reconciliation](srn://acme/product/billing/component/reconciliation),
which is a `job` precisely because nothing calls it. Something calls this.

## Membership is never enumerable

There is no operation that returns the accounts in a segment — not to a
marketer, not to campaign-manager, not to an internal tool. The store answers
membership as a boolean and size as an integer, and that asymmetry is the
component's main design decision.

An enumerable segment is a mailing list waiting to be exported, and once
exported it outlives the consent that justified it. Refusing the operation at
the component boundary is enforceable in a way that a policy about how the
operation is used is not. The prohibition it serves is written down as
[personalized-pricing](srn://acme/product/growth/requirement/personalized-pricing).

The `min-size` floor is applied here rather than in the schema, because it is a
property of the materialization: a rule that was above the floor last week may
fall below it this week, and the refusal has to happen when the set is built.

## Consuming redemptions

It `uses`
[redemption-events](srn://acme/product/growth/protocol/redemption-events) to keep
a small number of behavioural facts current between nightly rebuilds — a
`days-since-last-order` clause is useless if it is up to 24 hours stale for the
segment "lapsed customers we just won back". Only facts derivable from a
redemption are updated this way; everything else waits for the rebuild.

## Status: draft, and staging only

This description is `draft` and the component declares only
[staging](srn://acme/environment/staging), which is the honest pairing. The
nightly rebuild runs against production data; the *read* surface that
promotion-engine depends on is still behind a flag while the membership test's
tail latency is measured against the budget. A `draft` component declaring
[production](srn://acme/environment/production) would be a claim nobody has
reviewed.

The open question is whether an approximate membership test — a filter with a
bounded false-positive rate — is acceptable. A false positive gives a discount to
someone outside the segment, which costs money; an exact test costs latency the
budget may not have. That trade has not been made, and until it is this page
stays `draft`.
