---
name: coupon
kind: datamodel
version: 1
title: Coupon
summary: A discount a customer must present by code — third level of the base-record, discount, coupon lineage.
status: approved
owner: team-growth
usage: both
abstract: false
tags:
  - promotions
  - coupons
---

# Coupon

The presented half of the discount hierarchy, and the deepest model in this
catalog: `base-record → discount → coupon`, each hop a root-level `allOf` and
each hop adding exactly what its level is responsible for. Identity and creation
time come from [base-record](srn://acme/datamodel/base-record@1); label, scope,
currency, stackability and the arithmetic union come from
[discount](srn://acme/product/growth/datamodel/discount@1); the code, its
expiry, and its burn count are this model's own.

Nothing is restated on the way down. A reader who wants to know what an `id`
means on a coupon has one place to look, and a change to that meaning has one
place to be made.

## The alphabet is part of the contract

`code` is drawn from `[A-Z2-9]` — no zero, no letter O, no one, no letter I — in
two groups of four. That is not decoration. Codes are read aloud on the phone to
[support-agent](srn://acme/actor/support-agent) and typed from print, and the
four characters removed are precisely the ones that generate support contacts.
The pattern is in the schema rather than in a component because every writer of
a coupon has to agree on it, and a validator is a cheaper agreement than a code
review.

The hyphen is significant and matched literally: `ABCD-EFGH` and `ABCDEFGH` are
different strings, and a customer who omits it gets a normalization at the edge,
not a second stored form.

## Burn counting lives on the write path, not in the schema

`redemption-limit` and `redeemed-count` describe a race the schema cannot
adjudicate. Two carts submitting the last use of one code will both read
`redeemed-count = 0`, and only a lock decides which of them wins. The invariant
`redeemed-count <= redemption-limit` is therefore enforced by
[coupon-service](srn://acme/product/growth/component/coupon-service) under a row
lock, and stated with acceptance criteria in
[stackable-promotions](srn://acme/product/growth/requirement/stackable-promotions).
Writing the invariant into the schema would have looked like a guarantee and
delivered none.

`redeemed-count` is carried explicitly rather than derived by counting
[redemption](srn://acme/product/growth/datamodel/redemption@1) rows. The
redemption log is the audit record and may be archived; the counter is the
enforcement variable and must be readable in one lookup on the checkout path.

## `issued-to` and what growth refuses to know

`issued-to` holds an account identifier and nothing else — no name, no email, no
address. Growth stores who a code went to so that a personal code cannot be
shared, and stops there. What that identifier resolves to is
[account](srn://acme/product/identity/datamodel/account@1)'s to say; growth
never dereferences it, and
[personalized-pricing](srn://acme/product/growth/requirement/personalized-pricing)
records the deliberate decision not to.

An absent `issued-to` is a bearer code — printed on a leaflet, valid for anyone
who has it. That is the case `redemption-limit` exists for.
