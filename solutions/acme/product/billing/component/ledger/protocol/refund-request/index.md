---
name: refund-request
kind: protocol
version: 1
title: Refund request
summary: Support-facing HTTP surface for requesting and tracking a refund against a settled order.
status: review
owner: team-billing
style: request-response
participants:
  - alias: support-agent
    ref: /actor/support-agent
    role: initiator
  - alias: ledger
    ref: /product/billing/component/ledger
    role: responder
conforms-to:
  - standard: RFC 9457 Problem Details for HTTP APIs
    url: https://www.rfc-editor.org/rfc/rfc9457
  - standard: OpenAPI Specification
    version: "3.1.0"
    url: https://spec.openapis.org/oas/v3.1.0
tags:
  - finance
  - support
---

# Refund request

The one surface a human drives directly against
[billing](srn://acme/product/billing). A [support agent](srn://acme/actor/support-agent)
asks for a refund on a settled order; the [ledger](srn://acme/product/billing/component/ledger)
answers with the balanced legs it will post, and posts them.

Placement is again mechanical rather than chosen: the only component participant
is the ledger, so the nearest common ancestor of the component participants is
the ledger itself, and the protocol sits in that component's own bucket. The
actor participant does not move it — actors are solution-level and are excluded
from the calculation by construction.

## Why the spec file rather than a surface list

Unlike [order-placement](srn://acme/product/shop/protocol/order-placement), this protocol
has a real OpenAPI document, generated from the service and checked in beside
`index.md`. `transport.yaml` therefore links it under `spec` and declares no
`operations` list of its own: either the document is the source of operation
truth or the list is, and keeping both guarantees they diverge within a release.

The portal treats the linked file as an opaque attachment in v1 — it renders a
card with the format, the version, and a link, and does not parse it into an
operation table.

## Authorization

Every request carries the agent's own identity, never a shared service
credential. That is what makes the
[audit-trail](srn://acme/product/billing/requirement/audit-trail) criterion about
`changed-by` satisfiable: the handle recorded on the resulting
[ledger-entry](srn://acme/product/billing/datamodel/ledger-entry@1) is a person, and it
is the person the refund can be asked about a year later.

## Status

`review`. The refund reason taxonomy in the linked OpenAPI document is still
being agreed with the finance controller, and until it settles the operation
shape may still move.
