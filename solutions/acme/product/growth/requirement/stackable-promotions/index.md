---
name: stackable-promotions
kind: requirement
version: 1
title: Deterministic stacking of multiple discounts
summary: Two carts identical in every input receive identical discounts, in the same order, at the same total.
status: approved
owner: team-growth
requirement-type: functional
priority: must
relations:
  uses:
    - /datamodel/money@1
    - /product/growth/datamodel/promotion-quote@1
tags:
  - promotions
  - determinism
---

When more than one discount could apply to a cart, the outcome must be a
function of the inputs alone — not of evaluation order, not of which replica
answered, not of the order a customer happened to type codes in. Two carts
identical in lines, currency, account, and instant receive the same discounts,
applied in the same sequence, arriving at the same payable total.

This is the product's central correctness property. A discount is a price, a
price a customer can reproduce is a price acme can defend, and every support
contact that begins "it was cheaper five minutes ago" is a violation of this
requirement rather than a curiosity.

## Acceptance criteria

- **AC-1** Given a cart and a set of candidate discounts, evaluation produces the
  same `applied` list — same members, same order — on every replica and on every
  repetition within the staleness window.
  - **Given** cart `c-1` and candidates `p-1`, `p-2`, `k-9`
  - **When** the cart is priced twice against unchanged campaign definitions
  - **Then** both quotes carry identical `applied` and identical
    `discount-total`
- **AC-2** The stacking order is: non-stackable before stackable; then by scope,
  `line` before `order` before `shipping`; then by `precedence` ascending; then
  by discount id ascending. The last clause is a total order, so no tie is ever
  resolved by chance.
- **AC-3** A non-stackable discount that wins ends the evaluation. No further
  candidate is applied, and every remaining candidate appears in `rejected` with
  reason `not-stackable`.
- **AC-4** `discount-total` never exceeds `subtotal`, and no discount produces a
  negative amount. A fixed-amount discount larger than the total it is scoped to
  is clamped, and the clamped figure is what a
  [redemption](srn://acme/product/growth/datamodel/redemption@1) records.
- **AC-5** Rounding is applied once, at the end, half-up, to the currency's minor
  unit. Intermediate percentages are carried at full precision, so applying two
  10% discounts and applying one 19% discount differ by at most one minor unit
  and the difference is explainable.
- **AC-6** A coupon may be burnt at most once beyond its `redemption-limit`
  under no circumstances: two concurrent orders presenting the last use of one
  code result in exactly one
  [redemption](srn://acme/product/growth/datamodel/redemption@1), and the loser
  receives `already-redeemed` in `rejected`.
- **AC-7** A campaign definition changed by a marketer takes effect within 60
  seconds. Within that window the previous definition may still serve, and a
  quote issued under it is honoured if converted before it expires.

## Rationale

AC-2 exists because the first implementation ordered candidates by whatever the
database returned, and two replicas with different query plans gave two
customers different totals for the same basket on the same afternoon. The tie
break on discount id is the ugly, necessary clause: without a total order the
requirement is unfalsifiable.

AC-5 was added after the finance controller asked which of two arithmetically
defensible totals was the right one. The answer is neither in general and this
one in particular, and writing it down cost less than the second argument would
have.

AC-7 is the honest form of "a marketer can stop a promotion immediately". They
cannot; the caches in
[promotion-engine](srn://acme/product/growth/component/promotion-engine) make it
60 seconds. Stating the real bound is more useful than an aspiration nobody
measures against.

## Out of scope

Which discounts acme *should* combine — a commercial judgement made per campaign
by a [marketer](srn://acme/actor/marketer), not a property of the system. This
requirement says the outcome is deterministic, never that it is generous.
