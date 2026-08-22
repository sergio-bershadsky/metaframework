---
name: carrier-booking
kind: protocol
version: 4
title: Carrier booking
summary: Synchronous booking of one parcel with one carrier, including the retry across carriers when the first refuses.
status: approved
owner: team-fulfilment
style: request-response
participants:
  - alias: orchestrator
    ref: /product/fulfilment/component/delivery-orchestrator
    role: initiator
  - alias: gateway
    ref: /product/fulfilment/component/carrier-gateway
    role: responder
  - alias: carrier
    ref: /product/fulfilment/component/carrier-gateway/component/parcel-carrier
    role: responder
conforms-to:
  - standard: RFC 9457 Problem Details for HTTP APIs
    url: https://www.rfc-editor.org/rfc/rfc9457
  - standard: OpenAPI Specification
    version: "3.1.0"
    url: https://spec.openapis.org/oas/v3.1.0
  - standard: RFC 9110 HTTP Semantics
    url: https://www.rfc-editor.org/rfc/rfc9110
relations:
  uses:
    - /environment/production
tags:
  - logistics
  - synchronous
---

Acme asks for a parcel to be taken, and waits. It waits because there is nothing
useful to do until the answer arrives: a booking either yields a label and a
tracking number or it does not, and a shipment without a label cannot leave the
building. That is the whole justification for `request-response` here, in a
product whose other protocol is a bus.

## Three participants, two hops, one transport

[orchestrator](srn://acme/product/fulfilment/component/delivery-orchestrator) →
[gateway](srn://acme/product/fulfilment/component/carrier-gateway) →
[carrier](srn://acme/product/fulfilment/component/carrier-gateway/component/parcel-carrier).
Both hops are HTTP, so the single-transport rule is satisfied honestly rather
than by pretending the second hop is out of scope.

The external lifeline is in the diagram deliberately. The retry budget in
`workflows/book-shipment.yaml` is spent against *it*, and a workflow that stopped
at the gateway would show a `loop` whose body was invisible — the one thing a
reader most needs to see when a booking took eleven seconds.

Placement is mechanical. The component participants are the orchestrator, the
gateway, and the carrier nested beneath the gateway; their common pair prefix is
`product/fulfilment`, so this directory sits at the product's protocol bucket
rather than inside the gateway.

## What the OpenAPI document covers, and what it does not

`transport.yaml` links `openapi.yaml` under `spec` and declares no `operations`
list of its own — the file is the single source of operation truth for the
surface it describes, and maintaining both would guarantee divergence within a
release.

That surface is **acme's side only**: the booking API the gateway offers upward.
The carrier's own API is not described anywhere in this catalog and will not be.
It is versioned by the carrier, it differs per carrier, and it changes without
notice; a checked-in description of it would be stale in a way no reviewer could
detect. The gateway exists so that exactly one thing has to track it, and that
thing is code.

## Idempotency

The booking request carries the shipment id as its idempotency key, and the
guarantee is stronger than the usual one: a replay must not produce a *second*
parcel at the carrier, because the second parcel physically exists and someone
pays to move it. The gateway keeps an idempotency ledger for exactly this, and
it is the only state that component holds.

Carriers themselves are inconsistent about this — some honour an idempotency
header, some deduplicate on a customer reference, some do neither — which is
why acme keeps its own ledger instead of relying on any of them.

## Failure

Every failure reaching the orchestrator is an RFC 9457
[problem](srn://acme/datamodel/problem@1) document, and `no-carrier-available` is
the terminal one: the retry budget in
[carrier-failover](srn://acme/product/fulfilment/requirement/carrier-failover) is
spent and a human owns it now. Nothing about that failure travels back toward
[shop](srn://acme/product/shop) — the order is paid, and a customer is not told
their purchase failed because a van was full.

## Artifacts

`transport.yaml` binds the conversation to HTTP and defers the surface to
`openapi.yaml`. `workflows/book-shipment.yaml` is the main exchange, with the
carrier retry as a `loop` and the repricing notice as an `opt`;
`workflows/cancel-booking.yaml` is the compensating one. `states.json` is the
delivery lifecycle of one parcel as this conversation sees it — `booked` →
`in-transit` → `delivered`, with `returned` and `failed` reachable under guards.

That machine is the state of the *conversation*, not of any participant. The
carrier has its own internal states, acme has never seen them, and the
[shipment](srn://acme/product/fulfilment/datamodel/shipment@1) `status` enum is a
projection of this machine rather than a second opinion about it.

## The Arazzo description

`arazzo.yaml` re-describes this exchange as the delivery orchestrator drives it,
in the OpenAPI Initiative's
[Arazzo](https://spec.openapis.org/arazzo/latest.html) format, grounded in
`openapi.yaml` — a booking and its cancellation, with the response codes that
document declares standing in for the `alt` fragments of the workflow files.
`requestQuotes` and `getBooking` get no step: no workflow file shows the
orchestrator calling either, and this description covers only operations one
does.

An Arazzo Description has a single executor, so it describes one participant's
path and never the whole exchange: `workflows/` stays the authoritative
choreography, and the sequence diagrams on this page derive from it alone. The
file is unvalidated — snapshotted with the entity, served as authored, and
judged by nothing: the framework states no rule about its contents. The portal
reads it to draw a step graph of each workflow, which checks nothing.
