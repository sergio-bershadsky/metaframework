---
name: idem-cap
kind: requirement
version: 2
title: Idempotent payment capture
summary: A payment capture replayed with the same idempotency key must charge the customer exactly once.
status: approved
owner: team-payments
requirement-type: functional
priority: must
relations:
  uses:
    - /product/shop/protocol/order-placement
    - /product/shop/component/checkout/component/payment/datamodel/order@3
tags:
  - payments
  - reliability
---

A client that cannot tell whether its capture request arrived must be able to
retry it safely. Checkout accepts an idempotency key on every capture and
guarantees that a replay of the same key produces the same outcome and no
additional charge — including when the original request failed *after* the
acquirer had already authorized it, which is the case that actually hurts.

The obligation is the customer's, not the client's. A duplicate charge is a
refund, a support contact, and a chargeback risk, in that order, and the customer
experiences all three before anyone at acme notices.

## Acceptance criteria

- **AC-1** A capture repeated with the same idempotency key charges the card once.
  - **Given** a capture for order `o-1` with key `k-1` that reached the acquirer
  - **When** the same request is replayed within the retention window
  - **Then** no second authorization reaches the acquirer
- **AC-2** A replay returns the original capture result, byte-identical.
- **AC-3** An idempotency key is honoured for at least 24 hours after first use.
- **AC-4** A capture reusing a key with a different amount or order is rejected
  with a distinguishable error, not silently accepted.
- **AC-5** The guarantee holds across a checkout restart — key state is not held
  in process memory.

## Rationale

AC-5 exists because the first attempted fix kept keys in memory and the next
deploy re-opened the hole. AC-4 exists because the second attempted fix treated
any replay as a success, which turned a duplicate charge into a silently dropped
one — the opposite failure, equally expensive.

The requirement is owned by the checkout component even though
[payment](srn://acme/product/shop/component/checkout/component/payment) implements half of it: checkout owns
the key, and the obligation is that the *pair* behaves correctly.

## Out of scope

Idempotency of refunds. A refund is a new fact on the
[settlement](srn://acme/protocol/settlement) bus with its own identity, and
consumers there are idempotent on `order-id` for a different reason.
