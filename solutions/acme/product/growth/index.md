---
name: growth
kind: product
version: 2
title: Growth
summary: Campaigns, promotions, and coupons — everything acme runs that changes what a customer is asked to pay.
status: review
owner: team-growth
lifecycle: incubating
primary-actors:
  - /actor/marketer
  - /actor/customer
relations:
  exposes:
    - /product/growth/protocol/promotion-evaluation
    - /product/growth/datamodel/redemption@1
  depends-on:
    - /product/shop
    - /product/identity
  implements:
    - /product/growth/requirement/stackable-promotions
  uses:
    - /datamodel/money@1
tags:
  - marketing
  - promotions
x-cost-center: "4820"
---

Everything acme does to make a basket cheaper on purpose. Growth decides *what*
a discount is worth; [shop](srn://acme/product/shop) decides what the customer
is actually charged and takes the money. That split is the product boundary and
it is deliberate: a pricing engine that could also take payment would be a
second checkout, and the first bug it produced would be a charge nobody could
explain.

## Components

- [campaign-manager](srn://acme/product/growth/component/campaign-manager) — the
  authoring surface. A [marketer](srn://acme/actor/marketer) writes campaigns
  and promotions here and nowhere else.
- [promotion-engine](srn://acme/product/growth/component/promotion-engine) — the
  evaluator. Stateless, on the checkout hot path, and the only component that
  answers "what is this cart worth today".
- [coupon-service](srn://acme/product/growth/component/coupon-service) — issues,
  validates, and burns coupon codes. It is the only component in growth that
  holds a write lock on anything a customer can race.
- [audience](srn://acme/product/growth/component/audience) — the nightly job that
  turns a segment rule into a membership set.

The four are peers rather than nested because none of them is *part of* another:
promotion-engine can be scaled to zero without campaign-manager noticing, and
coupon-service outlives any single campaign. Nesting in this catalog is
composition; these are collaborators.

## The inheritance tree

Growth is where the solution's data vocabulary gets deep. Every discount acme
can express is a
[discount](srn://acme/product/growth/datamodel/discount@1) — an abstract model
that extends the solution-wide
[base-record](srn://acme/datamodel/base-record@1) and adds a tagged union of
three arithmetic kinds. Two concrete models compose it:
[promo](srn://acme/product/growth/datamodel/promo@1), which acme applies
automatically, and [coupon](srn://acme/product/growth/datamodel/coupon@1),
which a customer has to present. So the lineage is three levels deep —
`base-record → discount → coupon` — and the reason it is three rather than two
is argued in
[0001-discount-inheritance](srn://acme/product/growth/adr/0001-discount-inheritance).

Around that spine sit [campaign](srn://acme/product/growth/datamodel/campaign@1),
[audience-segment](srn://acme/product/growth/datamodel/audience-segment@1),
[redemption](srn://acme/product/growth/datamodel/redemption@1), and
[promotion-quote](srn://acme/product/growth/datamodel/promotion-quote@1).

## Where growth meets the rest of the solution

Two edges cross the product boundary, and they are not symmetric.

Growth `depends-on` [shop](srn://acme/product/shop) structurally: a discount is
meaningless without a cart to discount, and every model here speaks shop's
vocabulary — [money](srn://acme/datamodel/money@1), order lines, order
identifiers. That dependency is declared above because growth cannot be
described without it.

Shop's call *into* growth is the other direction, and it is deliberately not
declared here. Edges belong to the reusing side, so the `uses` edge toward
[promotion-evaluation](srn://acme/product/growth/protocol/promotion-evaluation)
is [checkout](srn://acme/product/shop/component/checkout)'s to author — which it
now does, so this product's inbound list is populated by an inverse rather than
by a convenient edge authored from the wrong end. That edge also has a cost this
page does not pay: the two products now co-own the surface, which is the
condition [promotion-evaluation](srn://acme/product/growth/protocol/promotion-evaluation)
names as making its relocation due.

The second boundary edge is [identity](srn://acme/product/identity). Growth
stores an opaque account identifier on a
[coupon](srn://acme/product/growth/datamodel/coupon@1) and a
[redemption](srn://acme/product/growth/datamodel/redemption@1) and nothing else
about a person; what that identifier means is
[account](srn://acme/product/identity/datamodel/account@1)'s to say. Growth
never dereferences it and holds no credential, no contact detail, and no
attribute of a human. See
[personalized-pricing](srn://acme/product/growth/requirement/personalized-pricing)
for why that restraint is a decision rather than an omission.

## Lifecycle

`lifecycle: incubating` and `status: review` are both accurate and say different
things. The components are in production for a single storefront behind a flag;
the description you are reading has not yet been signed off by the finance
controller who has to answer for promotional spend. Neither field is a proxy for
the other, and this product is a good illustration of why the framework keeps
them apart.
