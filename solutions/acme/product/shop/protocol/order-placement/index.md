---
name: order-placement
kind: protocol
version: 2
title: Order placement
summary: Synchronous order placement between the customer, checkout, inventory, and payment.
status: approved
owner: team-shop
style: request-response
participants:
  - alias: customer
    ref: /actor/customer
    role: initiator
  - alias: checkout
    ref: /product/shop/component/checkout
    role: responder
  - alias: inventory
    ref: /product/shop/component/inventory
    role: responder
  - alias: payment
    ref: /product/shop/component/checkout/component/payment
    role: responder
conforms-to:
  - standard: RFC 9457 Problem Details for HTTP APIs
    url: https://www.rfc-editor.org/rfc/rfc9457
  - standard: RFC 9110 HTTP Semantics
    url: https://www.rfc-editor.org/rfc/rfc9110
tags:
  - commerce
  - synchronous
---

# Order placement

Checkout is the only responder the customer talks to; inventory and payment are
reached behind it and never expose an edge to the browser. That is the shape the
sequence diagrams derived from `workflows/` show, and it is the reason this
protocol is `request-response` rather than a bus: the caller names the callee and
the protocol contracts a reply.

Placement follows the nearest-common-ancestor rule mechanically. The component
participants are [checkout](srn://acme/product/shop/component/checkout),
[inventory](srn://acme/product/shop/component/inventory), and
[payment](srn://acme/product/shop/component/checkout/component/payment); their nearest common ancestor is the
[shop](srn://acme/product/shop) product, which is where this directory sits. The
[customer](srn://acme/actor/customer) actor does not enter that calculation —
actors are solution-level, so counting them would collapse every protocol to the
solution root.

## Failure

Every failure that reaches the customer is an RFC 9457 problem document, so each
`error` step carries [problem](srn://acme/datamodel/problem@1). There is no
second error shape, and a component that invents one is wrong rather than
merely inconsistent.

## Idempotency

`submit-order` requires an idempotency key on the request, and the guarantee that
key buys is written down as
[idem-cap](srn://acme/product/shop/component/checkout/requirement/idem-cap). The protocol states
the field; the requirement states the behaviour, with acceptance criteria a
reviewer can check. Neither belongs in the other.

## Artifacts

`transport.yaml` binds the conversation to HTTP and enumerates the operations —
there is no OpenAPI document, so the surface list here is authoritative rather
than a duplicate of one. `workflows/place-order.yaml` is the main exchange and
`workflows/cancel-order.yaml` the compensating one; `states.json` is the state of
a single conversation as checkout sees it, not the internal state of any one
participant.

The message-to-datamodel matrix on this page is derived from those files. The
payload models are deliberately absent from `relations`.
