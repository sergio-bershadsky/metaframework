---
name: redemption
kind: datamodel
version: 1
title: Redemption
summary: The immutable fact that one discount was applied to one order, and what acme paid for it.
status: approved
owner: team-growth
usage: both
abstract: false
tags:
  - promotions
  - finance
---

Growth's public surface. Everything else in this product is internal machinery;
a redemption is the fact other products and the finance function consume. It
says that a specific discount was applied to a specific order at a specific
instant and cost a specific amount, and it never says anything else.

It composes [base-record](srn://acme/datamodel/base-record@1) and
[auditable](srn://acme/datamodel/auditable@1). The mixin is here because a
reversal is a change to a financial record and a controller is entitled to know
who made it.

## Denormalized on purpose

`source`, `kind`, and `coupon-code` are all recoverable from `discount-id` by a
lookup. They are stored anyway, and the reason is the same one that makes
[order-line](srn://acme/product/shop/datamodel/order-line@1) carry a
`line-total`: a redemption from 2024 must stay readable when the coupon it
refers to has been archived and the arithmetic branch it used has been
superseded. A record that resolves its own meaning at read time silently
rewrites history.

`amount-off` is the figure after every cap and clamp — what acme actually gave
away, not what the discount nominally offered. A capped 20% promo on a large
basket records the cap, and the difference between the two numbers is not
recoverable from this record. That is accepted: the question finance asks is
what it cost.

## Reversal is a new field, not a deletion

`reversed-at` is set when the order behind the redemption is cancelled or
refunded. The row is never deleted and the amount is never rewritten, so a
campaign's gross and net cost are both answerable from the same log. This is the
same discipline the ledger applies to
[ledger-entry](srn://acme/product/billing/datamodel/ledger-entry@1) and for the
same reason — a correction is a fact, not an edit.

`redeemed-at` is the instant the *order* was placed, not the instant the quote
was issued. A quote that was never converted produces no redemption at all,
which is why a redemption count is a conversion figure and a quote count is not.

## Identifiers growth does not own

`order-id` addresses an order in [shop](srn://acme/product/shop) and `account-id`
an [account](srn://acme/product/identity/datamodel/account@1) in
[identity](srn://acme/product/identity). Both are opaque here: growth stores
them, joins on them, and never dereferences them. Growth holding an order aggregate
would make it a second checkout, and growth holding a person would make it
subject to a privacy review it has been designed to stay outside of — see
[personalized-pricing](srn://acme/product/growth/requirement/personalized-pricing).

Erasure replaces `account-id` with a stable pseudonym and leaves every other
field intact, which keeps campaign totals correct through an erasure exactly as
[gdpr-erasure](srn://acme/requirement/gdpr-erasure) requires of the ledger.

## On the wire

Published as an event on
[redemption-events](srn://acme/product/growth/protocol/redemption-events), where
[campaign-manager](srn://acme/product/growth/component/campaign-manager)
consumes it to advance a campaign's `spent` figure. The publishing edge is
declared on
[coupon-service](srn://acme/product/growth/component/coupon-service), not here —
a datamodel never knows who transmits it.
