---
name: tracking-event
kind: datamodel
version: 1
title: Tracking event
summary: One carrier scan, normalized — what happened to a parcel, when it happened, and where.
status: approved
owner: team-fulfilment
usage: exchange
abstract: false
tags:
  - logistics
  - event
---

# Tracking event

The atom of everything acme knows about a parcel after it leaves the dispatch
door. One scan by one [courier](srn://acme/actor/courier) or one sorting
facility, translated out of the carrier's vocabulary and into acme's.

`usage: exchange`, not `both`. Individual scans are not the system of record —
[tracking](srn://acme/product/fulfilment/component/tracking) keeps them only long
enough to fold them into a
[shipment](srn://acme/product/fulfilment/datamodel/shipment@1) status, and the
carrier remains the authority on its own scan history. Storing them as truth
would mean reconciling acme's copy against the carrier's forever.

## Two timestamps, and why both are required reading

`occurred-at` is when the courier scanned. `recorded-at` is when acme found out.
They differ by seconds when a webhook fires and by six hours when a van has been
out of coverage all afternoon, and no consumer may use one where it means the
other. Every customer-visible statement uses `occurred-at`, because that is what
happened to their parcel; every freshness measurement in
[tracking-freshness](srn://acme/product/fulfilment/requirement/tracking-freshness)
uses the gap between them, because that is acme's own latency and the only half
it can fix.

Carrier clocks are also wrong. `occurred-at` is normalized to UTC on arrival, and
a scan that claims to be from the future is clamped rather than rejected —
dropping it would lose the only evidence that a delivery attempt happened.

## Normalized status against carrier code

`status` is acme's closed vocabulary; `carrier-status-code` is whatever the
carrier sent, kept verbatim beside it. Keeping both is the deliberate redundancy:
the normalized value is what every consumer branches on, and the raw code is what
makes a bad mapping diagnosable a month later, when a carrier has quietly split
one status into three and everything is arriving as `in-transit`.

The mapping table itself lives in
[carrier-gateway](srn://acme/product/fulfilment/component/carrier-gateway), not in
this schema. A schema that encoded per-carrier mappings would need a new version
every time a carrier changed a label.

## `location` stays in `$defs`

The coarse place a scan happened — postal code, city, country — is structurally a
subset of
[delivery-address](srn://acme/product/fulfilment/datamodel/delivery-address@1), and
it deliberately does not reuse it. A scan location has no recipient, no street,
and no phone number; reusing the address model would make five personal-data
fields optional-but-present-in-the-contract on a document that must never carry
them. It stays a local `$defs` shape because exactly one entity needs it — the
same promotion rule that moved [money](srn://acme/datamodel/money@1) *out* of
`$defs` the moment a second one did.
