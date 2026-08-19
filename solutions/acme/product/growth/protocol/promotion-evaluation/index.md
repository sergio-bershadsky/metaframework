---
name: promotion-evaluation
kind: protocol
version: 1
title: Promotion evaluation
summary: Synchronous pricing conversation — checkout asks the engine what a cart is worth and gets a short-lived quote.
status: review
owner: team-growth
style: request-response
participants:
  - alias: checkout
    ref: /product/shop/component/checkout
    role: initiator
  - alias: promotion-engine
    ref: /product/growth/component/promotion-engine
    role: responder
  - alias: audience
    ref: /product/growth/component/audience
    role: responder
  - alias: coupon-service
    ref: /product/growth/component/coupon-service
    role: responder
conforms-to:
  - standard: RFC 9457 Problem Details for HTTP APIs
    url: https://www.rfc-editor.org/rfc/rfc9457
  - standard: RFC 9110 HTTP Semantics
    url: https://www.rfc-editor.org/rfc/rfc9110
relations:
  uses:
    - /environment/production
tags:
  - promotions
  - synchronous
---

# Promotion evaluation

[checkout](srn://acme/product/shop/component/checkout) is the only initiator.
[audience](srn://acme/product/growth/component/audience) and
[coupon-service](srn://acme/product/growth/component/coupon-service) are reached
behind [promotion-engine](srn://acme/product/growth/component/promotion-engine)
and never expose an edge outside growth. It is `request-response` and not a bus
because the caller names the callee and blocks on the reply — checkout cannot
render a basket without knowing what it costs.

## Placement

The component participants span two products: checkout under
[shop](srn://acme/product/shop), the other three under
[growth](srn://acme/product/growth). Taken pair by pair their common prefix is
empty, so the nearest-common-ancestor rule places this protocol at the solution
root, next to [settlement](srn://acme/protocol/settlement).

It sits in growth's bucket today because growth authored and still unilaterally
owns the contract while the product is `incubating`; shop is a client that can
be switched off. Moving the directory to `srn://acme/protocol/promotion-evaluation`
is the first item on the graduation checklist in
[0002-fail-open-pricing](srn://acme/product/growth/adr/0002-fail-open-pricing),
and it becomes due the moment checkout authors its `uses` edge — at that point
the two products co-own the surface and the rule stops being a formality.

## The conversation is advisory

Every reply is a
[promotion-quote](srn://acme/product/growth/datamodel/promotion-quote@1),
including the degraded one. There is no error response for "the engine is
unwell": a quote with `fallback: true` and an empty `applied` list is a complete,
valid answer meaning "price this cart undiscounted", and checkout proceeds. The
reasoning is in
[0002-fail-open-pricing](srn://acme/product/growth/adr/0002-fail-open-pricing).

Problem documents do still appear, but only where a request was genuinely
malformed or a coupon genuinely refused — never to signal degradation. Those use
[problem](srn://acme/datamodel/problem@1), like every other failure that crosses
a boundary in this solution.

## Quotes expire deliberately fast

A quote binds nothing. Checkout re-quotes when the cart changes and again
immediately before it converts the cart to an order, and the second quote is the
one that becomes a
[redemption](srn://acme/product/growth/datamodel/redemption@1). The alternative —
holding a discount for a customer while they decide — would require a
distributed lock across a component that is explicitly allowed to be
unavailable.

The consequence is visible to the customer: a discount shown in the basket can
disappear at the payment step because a budget ran out in between. That was
accepted as the honest failure mode, and the `rejected` list exists so the
basket can say which one and why.

## Artifacts

`transport.yaml` binds the conversation to HTTP inside the cluster and
enumerates the three operations; there is no OpenAPI document, so that list is
authoritative rather than a copy of one. `workflows/price-cart.yaml` is the main
exchange — it is where the `loop` over candidate promotions and the
eligible/ineligible `alt` live. `states.json` describes one quote's lifecycle as
the engine sees it, not the internal state of any participant.

The message-to-datamodel matrix on this page is derived from those files; the
payload models are deliberately absent from `relations`, which carries only the
non-payload dependency on [production](srn://acme/environment/production).
