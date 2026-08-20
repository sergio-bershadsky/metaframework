---
name: promotion-engine
kind: component
version: 5
title: Promotion engine
summary: Stateless evaluator on the checkout hot path — decides what a cart is worth and answers within a budget.
status: review
owner: team-growth
component-type: service
lifecycle: released
relations:
  uses:
    - /environment/production
    - /environment/staging
    - /datamodel/money@1
    - /product/growth/datamodel/campaign@1
    - /product/growth/datamodel/promo@1
    - /product/shop/component/checkout/datamodel/cart@1
  exposes:
    - /product/growth/protocol/promotion-evaluation
    - /product/growth/datamodel/promotion-quote@1
  depends-on:
    - /product/growth/component/campaign-manager
    - /product/growth/component/coupon-service
    - /product/growth/component/audience
  implements:
    - /product/growth/requirement/promotion-evaluation-budget
    - /product/growth/requirement/stackable-promotions
  realizes:
    - /capability/promotion-pricing
tags:
  - promotions
  - hot-path
  - privacy
x-runtime: rust
---

Answers one question: given this cart and this account, which discounts apply
and what are they worth. It holds no state of its own, writes nothing, and can
be scaled to zero and back without anybody noticing except by the latency it was
absorbing.

It is the only component in growth that
[checkout](srn://acme/product/shop/component/checkout) talks to, and the only one
whose failure a customer can feel — which is why the whole of
[0002-fail-open-pricing](srn://acme/product/growth/adr/0002-fail-open-pricing)
is about what this component does when it cannot answer properly.

## Stateless, and what that costs

Campaign and promo definitions are read from
[campaign-manager](srn://acme/product/growth/component/campaign-manager)'s store
through a refreshed in-process cache, not on the request. Segment membership
comes from [audience](srn://acme/product/growth/component/audience), coupon
validity from
[coupon-service](srn://acme/product/growth/component/coupon-service). Nothing is
persisted here.

The price is a staleness window: a promo paused by a marketer keeps serving
until the cache turns over. That window is bounded and stated in
[stackable-promotions](srn://acme/product/growth/requirement/stackable-promotions),
and it was preferred to a read-through cache because a cache miss on the
checkout path is exactly the failure mode the latency budget cannot absorb.

## The dependency the cache hid

[campaign-manager](srn://acme/product/growth/component/campaign-manager) is now a
`depends-on`, and its absence from the first version of this page was a mistake
worth explaining rather than quietly fixing. The argument for leaving it out was
that no request touches it: the definitions are already in memory, the cache
refreshes on its own schedule, and a dependency nothing on the hot path exercises
did not feel like one.

That reasoning confuses the request path with the lifecycle. A process that
starts with an empty cache cannot answer at all until campaign-manager responds,
so the dependency is real and simply moved to the least visible moment — startup,
where it is also least tested. Scaling to zero and back, which this component
does routinely, turns "least visible" into "several times an hour".

The edge being stated changes what a reader concludes from an incident. With it,
"promotion-engine returned fallback for four minutes after a deploy" has an
obvious first suspect; without it, the page positively argued against looking
there. A dependency that is only exercised at startup is still a dependency, and
the graph should say so.

## Two dependencies, two edge kinds

The component edge toward campaign-manager and the datamodel edges toward
[campaign](srn://acme/product/growth/datamodel/campaign@1) and
[promo](srn://acme/product/growth/datamodel/promo@1) are not a duplication. The
first says "this process cannot start without that process"; the second says
"this process is written against those shapes". They come apart in both
directions, and the pair is what makes each one falsifiable.

They came apart here on purpose once already. The cache was loaded from a
snapshot file during an incident in which campaign-manager was unreachable, and
the engine served correct prices from it for an hour — the component dependency
was gone, the datamodel dependency was exactly as binding as ever. Recording only
the component edge would have made that hour unexplainable.

The pins are `@1` because that is what the parser was written against, and they
will move when someone reads the newer revision rather than when it appears. A
pin that tracks latest by default records nothing; the whole value of the number
is that a human put it there.

## Why it reads shop's cart model

`uses` names [cart](srn://acme/product/shop/component/checkout/datamodel/cart@1)
directly, across the product boundary. The engine does not own a cart, cannot
mutate one, and never sees one it did not receive in a request — but it has to
speak the same vocabulary as the thing it is pricing, and inventing a parallel
"priceable basket" model would have produced two shapes that drift.

That edge is the concrete form of growth's product-level `depends-on` toward
[shop](srn://acme/product/shop). The inverse edge — checkout's `uses` of
[promotion-evaluation](srn://acme/product/growth/protocol/promotion-evaluation) —
is checkout's to author, and the portal will show it here as an inverse once it
exists.

## Both request-path dependencies are allowed to fail

Campaign-manager is not one of them — it is a startup dependency, as above. The
two that are reached while a customer waits are audience and coupon-service.

The engine calls audience and coupon-service on the request path, and treats a
timeout from either as a rejection rather than an error: an account whose
segment membership cannot be established is not in the segment, and a coupon
that cannot be validated is not applied. Every such outcome appears in the
quote's `rejected` list with a reason, so the degradation is visible to the
basket UI instead of being inferred from a missing discount.

Only when the engine cannot complete the evaluation *at all* does it set
`fallback: true` and return an empty result. The distinction between "declined
these, applied those" and "could not tell" is load-bearing and is the reason
[promotion-quote](srn://acme/product/growth/datamodel/promotion-quote@1) carries
both fields.

## The non-goal is enforced by shape, not by policy

[personalized-pricing](srn://acme/product/growth/requirement/personalized-pricing)
records that acme will not price a basket differently for one named person than
for their segment. This component is where that would have to happen, and the
reason it cannot is structural rather than a rule somebody follows.

The only thing it ever learns about an account is a boolean per segment:
[audience](srn://acme/product/growth/component/audience) answers "is this account
in this segment", never "what is this account like". No purchase history, no
propensity score, no feature vector of any kind crosses that boundary, and the
`is-member` call in `workflows/price-cart.yaml` has no shape in which one could.
Per-individual pricing is therefore not a feature the engine declines to use — it
is a computation it has no inputs for.

That is the difference worth writing down. A policy holds until someone with a
deadline reads it as advice; an interface that cannot express the thing holds
until someone changes the interface, which is a reviewable act with a name on it.
The `privacy` tag is on this page for the same reason: the constraint lives here,
in the component, and not only in the requirement that asked for it.

## Written in Rust, and why that is in the catalog at all

`x-runtime` is an `x-` extension precisely because the framework has no opinion
about implementation language. It is recorded here because the p99 in
[promotion-evaluation-budget](srn://acme/product/growth/requirement/promotion-evaluation-budget)
was the reason for the choice, and a future reader asking why this one component
differs from the rest of acme's JVM estate deserves the answer next to the
requirement that forced it.
