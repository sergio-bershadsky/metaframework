---
name: problem
kind: datamodel
version: 1
title: Problem details
summary: RFC 9457 problem document — the single failure shape for every boundary in the solution.
status: approved
owner: team-platform
usage: exchange
abstract: false
tags:
  - foundation
  - errors
---

# Problem details

Every failure that crosses a component boundary is a problem document, whatever
the transport. One shape, so that a caller writes one error path instead of one
per callee, and so that a support agent reading a log sees the same five fields
every time.

`usage: exchange` and nothing else: a problem is never persisted as a record of
its own. Where a failure has to survive — a declined authorization, a rejected
reservation — it is a state on the aggregate that failed, not a stored problem
document.

## Shape

The fields are RFC 9457's, unextended: `type` is a URI naming the problem class,
`title` is the stable human summary, `status` mirrors the HTTP code where there
is one, `detail` is instance-specific, `instance` identifies the occurrence.
Extension members are permitted by the RFC and by this schema, which is why
`additionalProperties` stays unset.

## Where it is carried

The error steps of
[order-placement](srn://acme/product/shop/protocol/order-placement) — `payment-declined`,
`order-rejected`, `out-of-stock` — all carry it, and the protocol declares
conformance to RFC 9457 in its `conforms-to` list. The message-to-datamodel
matrix on that protocol's page is derived from those payload references, not
authored anywhere.
