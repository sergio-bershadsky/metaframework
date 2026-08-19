---
name: delivery-address
kind: datamodel
version: 1
title: Delivery address
summary: Where a parcel is going, in a shape every carrier can be handed and no carrier dictates.
status: approved
owner: team-fulfilment
usage: both
abstract: false
tags:
  - logistics
  - personal-data
---

# Delivery address

A destination as acme records it: a recipient, up to three unstructured street
lines, and the four structured fields every carrier in every market actually
agrees on — postal code, city, region, country.

## Why the street is unstructured

Every attempt to structure it fails on the second market. House numbers precede
the street in some countries and follow it in others; Ireland had no postcodes
until recently and still has addresses that resolve by townland; Japanese
addresses are block-and-lot rather than street-and-number. A schema with
`street` and `house-number` forces a parse at the boundary, and a parse that is
wrong 2% of the time produces undeliverable parcels at a rate nobody can debug
from the data.

So the lines are opaque and the *structured* fields are only the ones carriers
route on. Structure where routing needs it, free text where humans need it.

## Country and the closed-set temptation

`country` is a two-letter ISO 3166-1 code constrained by pattern, not by an
`enum`. The enum was tried: it means a code list update is a schema change, a
schema change is an entity version, and the first time acme shipped to a
territory not on the list the model rejected a perfectly valid address. The
pattern accepts codes acme does not serve; refusing to *ship* to them is
[delivery-orchestrator](srn://acme/product/fulfilment/component/delivery-orchestrator)'s
job, and a runtime rule with a real error message is a better place for it than
a validation failure three layers down.

## Personal data

This is the most sensitive model in the product and the reason
[fulfilment](srn://acme/product/fulfilment) carries the solution-wide
[gdpr-erasure](srn://acme/requirement/gdpr-erasure) obligation at all. An address
is erasable; a [shipment](srn://acme/product/fulfilment/datamodel/shipment@1) that
carried one is not, because the carrier's records of it are outside acme's
control and the accounting record of the delivery has to survive. Erasure
therefore blanks the address in place and leaves the shipment, which is a
deliberate compromise and is written down as such.

## Not a billing address

Deliberately a separate concept, not a shared "address" model with a `type`
discriminator. The two diverge on the field that matters: a billing address is
matched against a card issuer's record and must not be normalized, while a
delivery address is normalized aggressively so the carrier accepts it. One model
would have to satisfy both rules at once, and every consumer would have to know
which half it was holding.
