---
name: order-line
kind: datamodel
version: 1
title: Order line
summary: One sellable item, its quantity, and the price it was sold at — the atom of every basket and order.
status: approved
owner: team-shop
usage: both
abstract: false
tags:
  - commerce
---

# Order line

A line is the pairing of a SKU with a quantity and the price that applied when
the customer saw it. The price is captured, not looked up: a repricing after the
fact changes the catalog, never an order that has already been placed, and a
line that resolved its price at read time would silently rewrite history.

`line-total` is carried explicitly even though it equals quantity times unit
price. The redundancy is deliberate — rounding is a policy, the policy has
changed once, and a stored total makes an old order re-readable without knowing
which policy applied that year.

## Local shapes

`quantity` refers to `#/$defs/positive-int`, which stays in `$defs` because it is
structurally trivial, has no meaning of its own, and no second entity needs it.
[money](srn://acme/datamodel/money@1), by contrast, was promoted to its own
entity the moment a second model referenced it — that is the whole of the
promotion rule.

## Where it appears

Inside [cart](srn://acme/shop/checkout/datamodel/cart@1),
[order-request](srn://acme/shop/datamodel/order-request@1),
[order-placed](srn://acme/shop/datamodel/order-placed@1), and
[order](srn://acme/shop/checkout/payment/datamodel/order@3), always as an array
item and never as a base. It is a component of those models, not an ancestor of
them, which is why it appears in no inheritance tree.
