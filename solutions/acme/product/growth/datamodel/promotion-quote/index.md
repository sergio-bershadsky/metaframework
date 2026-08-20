---
name: promotion-quote
kind: datamodel
version: 1
title: Promotion quote
summary: The engine's advisory answer to "what is this cart worth" — applied discounts, declined candidates, and an expiry.
status: review
owner: team-growth
usage: exchange
abstract: false
tags:
  - promotions
  - exchange
---

The response payload of
[promotion-evaluation](srn://acme/product/growth/protocol/promotion-evaluation).
It is `usage: exchange` and nothing persists it: a quote is an opinion about a
cart at an instant, and storing opinions is how a system ends up honouring a
price it no longer offers.

## Advisory, and the schema says so

`fallback` is the field that encodes
[0002-fail-open-pricing](srn://acme/product/growth/adr/0002-fail-open-pricing).
When the engine cannot complete an evaluation — a dependency is down, the
latency budget in
[promotion-evaluation-budget](srn://acme/product/growth/requirement/promotion-evaluation-budget)
is spent — it answers anyway, with an empty `applied` list and `fallback: true`.
Checkout then prices the cart undiscounted and the customer sees no offer, which
is a worse experience and a correct one.

Making that an ordinary field rather than an HTTP status was deliberate. A
degraded answer is still an answer, and a consumer that has to distinguish "no
discounts apply" from "we could not tell" by reading a status code will get it
wrong under exactly the conditions where it matters.

## Why the union is embedded verbatim

`applied` carries whole [promo](srn://acme/product/growth/datamodel/promo@1) and
[coupon](srn://acme/product/growth/datamodel/coupon@1) documents, discriminated
by `source`, rather than a trimmed projection of the fields checkout renders.

A projection would have been smaller and would have drifted. The terms recorded
in a [redemption](srn://acme/product/growth/datamodel/redemption@1) must be the
terms that were quoted, and the cheapest way to guarantee that is for the quote
to carry the model itself. Checkout ignores `precedence` and `campaign-id`; the
cost of shipping them is bytes, and the cost of a second, drifting shape is
correctness.

The union is derivable because both subtypes declare `source` as a required
`const`. That is the only reason those tags exist — see
[0001-discount-inheritance](srn://acme/product/growth/adr/0001-discount-inheritance).

## `rejected` is customer-facing copy in disguise

The `reason` enum is closed because each value maps to one sentence in the
basket UI: "add £10 more to use this", "this code has already been used". An
open string would have let the engine emit an internal diagnostic into a
customer's screen, which happened once and is the reason the field is an enum.

`rejection` stays in `#/$defs`: it has no meaning outside a quote and no second
entity references it.

## `subtotal` is echoed, not recomputed

The engine repeats back the subtotal it was given so checkout can detect a quote
issued against a cart that has since changed. Together with the deliberately
short `expires-at` this replaces a distributed lock on the cart with two cheap
local checks — the same reason
[cart](srn://acme/product/shop/component/checkout/datamodel/cart@1) carries its
own expiry.
