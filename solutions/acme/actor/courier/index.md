---
name: courier
kind: actor
version: 2
title: Courier
summary: The carrier's driver who collects, moves, and hands over a parcel, and whose scans are acme's only ground truth.
status: approved
owner: team-fulfilment
actor-type: human
goals:
  - Collect a parcel from the dispatch point within the booked collection window.
  - Record a scan at every custody change, including a failed delivery attempt.
  - Hand a parcel to the named recipient, or return it when nobody can take it.
  - Capture a signature where the service level demands one, from whoever
    actually takes the parcel rather than from whoever was expected to.
tags:
  - logistics
  - external-facing
---

# Courier

A person employed or contracted by a carrier, never by acme. They are in this
catalog for one reason: every fact acme knows about a parcel in motion
originates with a scan they made, and a description of
[tracking-events](srn://acme/product/fulfilment/protocol/tracking-events) that
started at the carrier's webhook would be starting one hop too late.

## Why this actor holds no edges

Every other actor in this solution declares `uses` against something acme runs.
This one declares nothing, and the omission is the description rather than a
gap: the courier operates the carrier's own handheld device, on the carrier's
network, against the carrier's software. There is no acme surface they touch,
so there is no edge to author, and inventing one — pointing them at
[tracking](srn://acme/product/fulfilment/component/tracking), say — would claim
an interaction that has never existed.

Their participation is declared protocol-side only, as the `courier` alias in
[tracking-events](srn://acme/product/fulfilment/protocol/tracking-events), which
is exactly the split the framework intends: the component side owns edges, the
protocol side owns aliases. Actors are exempt from the back-edge cross-check for
this reason.

## The signature goal is about a stranger

The fourth goal is worded around "whoever actually takes the parcel" because that
is nearly never the customer. A neighbour signs, a concierge signs, a colleague
signs; acme's own record in
[shipment](srn://acme/product/fulfilment/datamodel/shipment@3) says `signed-for-by`
and not `signed-for-by-recipient` for exactly this reason.

The alternative goal — "obtain the recipient's signature" — describes a world
where the courier verifies identity, and no courier does. They ask for a name and
write down what they are told. Stating the goal as it is performed keeps acme from
building anything on a verification that never happened, and it explains why the
field is shown to a support agent and never matched against an account.

It also puts a boundary on the personal data acme takes in. The name belongs to a
person who has no relationship with acme at all and never agreed to one, which is
why it is blanked on erasure alongside the address and carries a shorter retention
than the shipment it sits on.

## Human, not external-system

`actor-type: human` even though acme only ever sees them through an API. The
type describes what the participant *is*, not the wire it reaches us on. The
distinction earns its keep in the failure analysis: a courier mis-scans, guesses
a safe place, marks "attempted" from the depot, and hands a parcel to a
neighbour — failure modes that no timeout budget or retry policy addresses, and
that the [delivery-promise-accuracy](srn://acme/product/fulfilment/requirement/delivery-promise-accuracy)
requirement has to absorb rather than fix.

The carrier's *systems* are a different participant with a different type:
[parcel-carrier](srn://acme/product/fulfilment/component/carrier-gateway/component/parcel-carrier),
an `external` component. One company, two nodes, because they fail in unrelated
ways and neither substitutes for the other.

## Boundary

Acme does not identify, schedule, rate, or communicate with couriers, and holds
no record of them beyond whatever free-text name a scan happens to carry. That
name is personal data arriving unbidden from a third party, which is why the
[tracking-event](srn://acme/product/fulfilment/datamodel/tracking-event@1) model
treats the courier note as opaque and short-lived rather than as a field to
build on.
