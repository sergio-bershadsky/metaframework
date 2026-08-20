---
name: order-line
kind: datamodel
version: 3
title: Order line
summary: One sellable item, its quantity, and the price it was sold at — the atom of every basket and order.
status: approved
owner: team-shop
usage: both
abstract: false
tags:
  - commerce
---

A line is the pairing of a SKU with a quantity and the price that applied when
the customer saw it. The price is captured, not looked up: a repricing after the
fact changes the catalog, never an order that has already been placed, and a
line that resolved its price at read time would silently rewrite history.

`line-total` is carried explicitly even though it equals quantity times unit
price. The redundancy is deliberate — rounding is a policy, the policy has
changed once, and a stored total makes an old order re-readable without knowing
which policy applied that year.

## The discount is allocated down to the line

`line-discount` is this line's share of whatever
[promotion-quote](srn://acme/product/growth/datamodel/promotion-quote@1) decided
the basket was worth, allocated at the moment the cart became an order. Most
promotions are cart-level — "£10 off orders over £50" applies to no line in
particular — so allocating is a choice, not a reading, and the choice is made
once here rather than re-derived by every consumer that needs it.

The consumer that forces it is the partial refund. A customer returning one of
five items must be refunded what they paid for that item, and what they paid is
the unit price less this line's share. Without the allocation, computing a refund
means replaying the promotion engine against a cart that no longer exists,
against campaign definitions that may since have been deleted — a reconstruction
that is wrong in exactly the cases anybody notices.

Allocation is proportional to `line-total` with the remainder pence going to the
largest line, which is arbitrary but fixed: the sum of `line-discount` across an
order equals the discount the customer was shown, and no rounding drifts into a
penny nobody can account for. `line-total` stays gross, so it means the same
thing it meant at version 1.

## Local shapes

`quantity` refers to `#/$defs/positive-int`, which stays in `$defs` because it is
structurally trivial, has no meaning of its own, and no second entity needs it.
[money](srn://acme/datamodel/money@1), by contrast, was promoted to its own
entity the moment a second model referenced it — that is the whole of the
promotion rule.

`tax` is the interesting case, because it is *not* structurally trivial and still
lives in `$defs`. It stays local for one reason: exactly one model needs it
today. The rule promotes on the second referrer, not on complexity, and promoting
early would put a shared entity in the solution bucket that only shop can
currently explain. When billing needs to reconcile per-line tax against a
[ledger-entry](srn://acme/product/billing/datamodel/ledger-entry@1), the promotion
happens then, and the swap is a `$defs` block becoming a `$ref` — a change that
accepts every instance written before it.

## Tax is captured, for the same reason the price is

`tax.rate` and `tax.amount` record what was charged, not what the current rate
table says. A rate change is a fact about the future; an order already placed was
taxed once, at a rate that a tax authority may ask about seven years later, and
recomputing it at read time would answer that question with today's arithmetic.

`tax.jurisdiction` is stored alongside because the rate alone does not identify
it — several jurisdictions share 20%, and the one that applied depends on where
the customer was, which is a fact this line no longer has access to once the
address is erased under
[gdpr-erasure](srn://acme/requirement/gdpr-erasure). The jurisdiction code
survives erasure precisely because it is not personal data, which is what keeps
the tax record intact after the address behind it is gone.

The whole object is optional. Lines written before this version carry no `tax`,
and a reader must treat its absence as "not recorded here" rather than as zero —
the two are different, and only the first is true of an order from last year.

## Where it appears

Inside [cart](srn://acme/product/shop/component/checkout/datamodel/cart@1),
[order-request](srn://acme/product/shop/datamodel/order-request@1),
[order-placed](srn://acme/product/shop/datamodel/order-placed@1), and
[order](srn://acme/product/shop/component/checkout/component/payment/datamodel/order@3), always as an array
item and never as a base. It is a component of those models, not an ancestor of
them, which is why it appears in no inheritance tree.
