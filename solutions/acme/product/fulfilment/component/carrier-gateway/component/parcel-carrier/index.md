---
name: parcel-carrier
kind: component
version: 1
title: Parcel carrier
summary: The third-party carrier network that actually moves parcels — booked, tracked, and never operated by acme.
status: approved
owner: team-fulfilment
component-type: external
relations:
  uses:
    - /environment/production
    - /environment/staging
  exposes:
    - /product/fulfilment/protocol/carrier-booking
tags:
  - logistics
  - third-party
---

# Parcel carrier

The company with the vans. It rates a parcel, accepts or refuses a booking,
issues a label and a tracking number, moves the parcel, and emits scans along the
way. Acme describes it only as far as the boundary requires, which is: what it
answers, how slowly, and how it fails.

## One node for several carriers

This single entity stands for whichever carriers acme has contracts with this
quarter — not for one named company. That is a modelling choice with a cost: the
catalog cannot say that one carrier is slower than another, and the failover
order lives in configuration rather than here. The benefit is that a commercial
change — dropping a carrier, adding a regional one for the Nordics — is not a
catalog change, and a description that needed editing every time procurement
signed something would be wrong most of the time.

Where a specific carrier's behaviour genuinely matters, it is re-stated as an
obligation on acme's side. That is why
[carrier-failover](srn://acme/product/fulfilment/requirement/carrier-failover) is
written as a budget acme keeps rather than as a promise any carrier makes.

## Why a component and not an actor

The same reason [psp](srn://acme/product/shop/component/checkout/component/payment/component/psp)
is one: `depends-on` accepts components and never actors, so the moment
[carrier-gateway](srn://acme/product/fulfilment/component/carrier-gateway) must
declare a structural dependency on the carrier, the carrier has to be a
component. The human on the doorstep is a different participant with a different
type — [courier](srn://acme/actor/courier) — and modelling both as one node would
lose the distinction that matters most in an incident: a carrier API outage and a
courier misdelivery share nothing except the invoice they arrive on.

## What is deliberately not described

Its network topology, its sorting hubs, its own retry semantics, its rate cards,
and its scan vocabulary. The last of those is the interesting omission: the
mapping from carrier codes to acme's status enum is real, necessary, and lives in
the gateway's configuration, because it changes when a carrier decides it does —
which is to say without a review, a version bump, or a warning.

## Two environments

It declares [production](srn://acme/environment/production) and
[staging](srn://acme/environment/staging), which for an external component
distinguishes a live network from a sandbox. As with the card acquirer, they are
genuinely different systems, and the sandbox is worse than useless for timing:
it books instantly, never refuses, and has never once run out of capacity in the
week before Christmas.
