---
name: promo
kind: datamodel
version: 1
title: Promo
summary: A discount acme offers unprompted to every eligible cart, funded by a campaign and bounded by a window.
status: approved
owner: team-growth
usage: both
abstract: false
tags:
  - promotions
---

The automatic half of the discount hierarchy. A promo composes
[discount](srn://acme/product/growth/datamodel/discount@1) with a root-level
`allOf` and adds the three things an unprompted offer needs that a presented one
does not: the campaign whose budget pays for it, the audience it is aimed at,
and the window it is live in.

Its full lineage is `base-record → discount → promo`. The
[base-record](srn://acme/datamodel/base-record@1) contribution is inherited
through discount rather than restated, which is the whole point of a chain: the
identity fields have one definition and every descendant gets the same one.

## Eligibility is a filter, never a discount

`segment-id` narrows *who* sees the promo; it does not change what the promo is
worth. That separation is why the field lives here and not in the `kind` union:
a percentage promo aimed at one segment and the same percentage aimed at
everybody differ in eligibility, not in arithmetic, and a model that conflated
the two would need one branch per segment.

An absent `segment-id` means every cart. That is not a default so much as the
common case — most promos are storewide, and requiring an "everyone" segment
would have made [audience](srn://acme/product/growth/component/audience)
materialize a membership set containing the entire customer base every night for
no reason.

## The window is half-open

`starts-at` is inclusive and `ends-at` is exclusive. Two promos scheduled
back to back therefore abut exactly, with no instant belonging to both and none
belonging to neither. Closed-closed windows were rejected after the first
handover produced a second in which two promos were simultaneously live and the
[stackable-promotions](srn://acme/product/growth/requirement/stackable-promotions)
tie-break had to arbitrate a situation nobody had intended.

## Precedence and the `source` tag

`precedence` orders promos against each other inside one campaign. It says
nothing about promos from different campaigns, which are ordered by the rule in
the requirement — deliberately, because a marketer authoring one campaign cannot
see the numbers another marketer chose.

`source` is a constant, and the only reason it exists is to make the pairing of
promo and [coupon](srn://acme/product/growth/datamodel/coupon@1) a discriminated
union rather than an opaque one. Where a consumer holds a discount without
knowing how it arrived — in
[promotion-quote](srn://acme/product/growth/datamodel/promotion-quote@1), for
instance — `source` is the field it switches on.
