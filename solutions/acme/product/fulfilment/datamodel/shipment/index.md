---
name: shipment
kind: datamodel
version: 2
title: Shipment
summary: One parcel's whole life — what is in it, where it is going, who is carrying it, and how far it has got.
status: approved
owner: team-fulfilment
usage: both
abstract: false
tags:
  - logistics
  - aggregate
---

# Shipment

The aggregate this product exists to maintain. It extends
[base-record](srn://acme/datamodel/base-record@1) for identity and creation time,
carries a [delivery-address](srn://acme/product/fulfilment/datamodel/delivery-address@1)
and a [money](srn://acme/datamodel/money@1) cost, and holds the lines it is
carrying as [order-line](srn://acme/product/shop/datamodel/order-line@3) — shop's
model, referenced across the product boundary rather than restated here.

## Why an order's line model, unchanged

A shipment line and an order line are the same fact seen twice, and the moment
they are two models they start to disagree about price. The reuse costs
something honest: fulfilment now depends on a model owned by `team-shop`, and a
change to it is a change to this product's wire shape. That is the correct
price, and it is visible — a copied definition would have made the coupling
invisible instead of removing it.

The relationship is *composition*, not inheritance: lines are an array item
here, exactly as they are in
[order-placed](srn://acme/product/shop/datamodel/order-placed@1). Nothing in this
model claims to be an order.

## One order, many shipments

`order-id` is not unique in this model, and that is the single most consequential
thing about it. A five-item order that splits across two warehouses is two
shipments with two tracking numbers, two promised dates, and two independent
delivery lifecycles, and a customer will be told about both. A model with one
shipment per order would have forced the split to be represented as a mutation
of one record, and the second parcel's history would have overwritten the
first's.

`parcel-index` and `parcel-count` were added because the customer-facing half of
that sentence had nowhere to live. "Your order is arriving in two parcels; this
is the first" is a sentence the notification has to be able to write, and
reconstructing it means querying every shipment sharing an `order-id` and
imposing an order on the result — a query the notification path should not be
making and a sort key it would have to invent.

Both are stamped by
[delivery-orchestrator](srn://acme/product/fulfilment/component/delivery-orchestrator)
at split time, when the count is known and final, and neither is ever rewritten.
A parcel that later fails and is rebooked keeps its index: the customer was told
"1 of 2", and renumbering to keep a contiguous sequence would change a sentence
they have already read. The consequence is that indexes can have gaps, which is
the correct trade — the sequence describes what was promised, not what survives.

They are optional, so the shipments written before this version validate
unchanged; absent means "not split, or split before we recorded it", and a
consumer must render that as a bare parcel rather than as "1 of 1".

The reverse — one shipment covering several orders — is deliberately not
representable. Consolidation is a warehouse optimization; if it ever reaches
this catalog it will be a new entity above this one, not a nullable field
inside it.

## `status`, and its relationship to the state machine

The `status` enum mirrors the states in
[carrier-booking](srn://acme/product/fulfilment/protocol/carrier-booking)'s
`states.json`, and the duplication is intentional rather than sloppy. The state
machine describes one *conversation* and is the normative source of what may
follow what; the enum is the projection of that conversation a consumer reads
off a stored record without replaying anything. They are checked against each
other by review, not by a tool, and the state machine wins.

## Evolution

Every field beyond the five required ones is optional, so a shipment that has
been created but not yet booked validates just as well as a delivered one.
That is what lets one model serve `usage: both` — the same shape is stored by
[delivery-orchestrator](srn://acme/product/fulfilment/component/delivery-orchestrator)
and published on
[tracking-events](srn://acme/product/fulfilment/protocol/tracking-events) — instead
of a stored aggregate and a separate exchange projection that drift.
