---
name: personalized-pricing
kind: requirement
version: 2
title: Per-individual pricing from behavioural signals
summary: Recorded non-goal — acme will not price a basket differently for one named person than for their segment.
status: approved
owner: team-growth
requirement-type: functional
priority: wont
relations:
  uses:
    - /product/growth/datamodel/audience-segment@1
tags:
  - promotions
  - privacy
  - non-goal
---

The commercial team has twice asked for the ability to compute a discount for a
single account from that account's own behaviour — a bigger offer for the
customer judged most likely to abandon, a smaller one for the customer judged
certain to buy. This requirement records the request, the criteria it would have
had, and the fact that acme has declined it.

`priority: wont` is not deletion, and this entity is deliberately as detailed as
one that was accepted. The next person to ask meets a recorded answer with
reasoning they can attack, rather than an empty catalog and a conversation that
starts from nothing.

The criteria below are the ones it would have had to satisfy, had it been
accepted. They are recorded in the ordinary shape rather than as prose, because
a declined requirement is re-read against the same criteria the next time it is
proposed.

## Acceptance criteria

- A discount's value is a function of an individual account's history, evaluated
  at request time rather than materialized nightly.
- The customer can be told, on request, why they were shown the price they were
  shown, in terms a person understands.
- The same account receives the same price across sessions, devices, and
  storefronts, so the pricing is not a function of how the customer arrived.
- Two accounts with materially similar histories receive materially similar
  prices, and the similarity threshold is auditable.
- No protected characteristic, and no proxy for one, enters the computation —
  demonstrably, not by assertion.

## Rationale

Declined on three grounds, in order of weight.

The last criterion is the one nobody could commit to. Postcode is a proxy for
income and for ethnicity; time of day is a proxy for shift work; device is a
proxy for wealth. A model trained on order history absorbs all three without
naming any of them, and "demonstrably free of proxies" is not a property acme
can establish about a model it retrains weekly.

The second is nearly as hard. A price a customer cannot be given a reason for is
a price acme cannot defend to a regulator, and the reasons a gradient-boosted
model produces are not reasons in the sense the criterion means.

The third ground is smaller and decided it in practice: the commercial upside
measured in a two-market pilot was inside the noise of the segment-level
promotions acme already runs.

## What is in scope instead

Segment-level targeting, at a floor of a thousand accounts, through
[audience-segment](srn://acme/product/growth/datamodel/audience-segment@1). A
segment is a rule a marketer wrote and a reviewer can read, over five closed
facts. Its `min-size` floor exists precisely to stop this requirement being
implemented one segment at a time — a segment of three is individual pricing
with extra steps, which is why the floor is enforced in
[audience](srn://acme/product/growth/component/audience) at materialization and
not left to authoring discipline.

## Out of scope of the refusal

Personalized *recommendation* — which products a customer is shown — remains
allowed and is not described in this catalog. This requirement is about price
only. The distinction is not cosmetic: a recommendation changes what a customer
sees, and a price changes what they pay.
