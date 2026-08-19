---
name: order-request
kind: datamodel
version: 1
title: Order request
summary: What a customer submits to place an order — lines, payment method, and an idempotency key.
status: approved
owner: team-shop
usage: exchange
abstract: false
tags:
  - commerce
  - wire
---

# Order request

The payload of the `submit-order` step of
[order-placement](srn://acme/shop/protocol/order-placement). It is `usage:
exchange` and nothing else — nobody stores an order request. What survives the
call is a [cart](srn://acme/shop/checkout/datamodel/cart@1) and, if the payment
is authorized, an [order](srn://acme/shop/checkout/payment/datamodel/order@3).

## The idempotency key

`idempotency-key` is required, and that is the single most consequential
decision in this schema. A client that cannot tell whether its request arrived
must be able to replay it safely, and a key the server generates cannot serve
that purpose. The behaviour the key buys is specified in
[idem-cap](srn://acme/shop/checkout/requirement/idem-cap), which is where the
retention window and the conflict rules live — a schema can demand the field and
nothing more.

## Payment method

`payment` is a [payment-method](srn://acme/shop/datamodel/payment-method@1)
document — a discriminated union, so the request carries the tag that says which
branch it is and never leaves the reader to infer it from which fields happen to
be present. Adding a third payment branch later is additive for every consumer
that switches on the tag and breaks every consumer that guessed.

The request never carries a raw card number. The card branch carries a token
issued by the acquirer plus the last four digits, which is what
[psp](srn://acme/shop/checkout/payment/psp) hands back after tokenization.
