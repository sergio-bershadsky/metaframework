---
name: carrier-gateway
kind: component
version: 4
title: Carrier gateway
summary: One normalized surface in front of every carrier — rating, booking, label retrieval, and scan ingest.
status: approved
owner: team-fulfilment
component-type: gateway
lifecycle: released
relations:
  uses:
    - /environment/production
    - /environment/staging
    - /datamodel/money@1
  exposes:
    - /product/fulfilment/protocol/carrier-booking
    - /product/fulfilment/protocol/tracking-events
    - /product/fulfilment/datamodel/carrier-quote@1
  depends-on:
    - /product/fulfilment/component/carrier-gateway/component/parcel-carrier
  implements:
    - /product/fulfilment/requirement/carrier-failover
    - /product/fulfilment/requirement/tracking-freshness
  realizes:
    - /capability/order-fulfilment
tags:
  - logistics
  - third-party
x-runtime: go
---

# Carrier gateway

Every carrier acme uses has a different API, a different status vocabulary, a
different idea of what a weight is, and a different opinion about whether a
booking is idempotent. This component absorbs all of it and offers one shape
upward: quote, book, cancel, and a normalized scan stream.

`component-type: gateway` and not `service`, because that type carries the one
claim that matters here — it holds no domain state of its own. Its stores are a
carrier credential set, a status mapping table, and an idempotency ledger that
exists only to keep a retry from booking twice. Delete all three and nothing
about a shipment is lost;
[delivery-orchestrator](srn://acme/product/fulfilment/component/delivery-orchestrator)
still knows what was shipped.

## Both ends of the same protocol

It is the `responder` in
[carrier-booking](srn://acme/product/fulfilment/protocol/carrier-booking) toward the
orchestrator and the caller toward
[parcel-carrier](srn://acme/product/fulfilment/component/carrier-gateway/component/parcel-carrier)
in the same conversation. One protocol, two hops, one transport — both hops are
HTTP, which is what makes the single-transport rule hold rather than being
worked around.

The retry budget is spent on the second hop, inside this component, and the
first hop sees one answer. That asymmetry is deliberate: an orchestrator that had
to know how many carriers had been tried would be re-implementing the failover
policy it delegated.

## Why the carrier's API is not described in this catalog

`transport.yaml` links an `openapi.yaml`, and that document describes *acme's*
booking surface only. The carrier's own API is versioned by the carrier, changes
without notice, and differs per carrier — restating it here would mean a catalog
entity whose accuracy acme cannot maintain and whose staleness would be invisible.
The gateway exists precisely so that exactly one thing needs to know it, and
that thing is code, not a description.

## Scan ingest, and why the publisher is here

Carrier webhooks land on this component's ingress, are authenticated per carrier,
de-duplicated, mapped onto acme's status vocabulary, and published as
[tracking-event](srn://acme/product/fulfilment/datamodel/tracking-event@1) on
[tracking-events](srn://acme/product/fulfilment/protocol/tracking-events). The
publisher is here rather than in
[tracking](srn://acme/product/fulfilment/component/tracking) so that the mapping
happens once, at the boundary, before anything downstream has had a chance to
branch on a raw carrier code.

That places [tracking-freshness](srn://acme/product/fulfilment/requirement/tracking-freshness)
partly on this component: the ingest hop is the one acme controls, and its share
of the freshness budget is the only share that can be engineered.

## Nesting the carrier beneath it

[parcel-carrier](srn://acme/product/fulfilment/component/carrier-gateway/component/parcel-carrier)
sits inside this component rather than beside it, because composition here is
literal — the carrier is reachable only through the gateway, and no other
component in the solution may hold a carrier credential. If a second consumer
ever appeared it would point at the gateway, never past it.

## Multi-carrier, single node

One component, several carriers, and no per-carrier entity. The alternative —
one `external` component per carrier — was rejected: it multiplies the catalog
by the commercial department's contract count, and the description of each would
be identical except for a name. What differs between carriers is configuration,
and configuration is not an ontology.
