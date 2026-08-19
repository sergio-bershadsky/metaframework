---
name: psp
kind: component
version: 1
title: Card acquirer (PSP)
summary: The third-party card acquirer acme authorizes, captures, and refunds through.
status: approved
owner: team-payments
component-type: external
relations:
  uses:
    - /environment/production
    - /environment/staging
tags:
  - payments
  - third-party
---

# Card acquirer (PSP)

A system acme does not own, described here only as far as the boundary requires.
It tokenizes cards in the customer's browser, authorizes and captures on request
from [payment](srn://acme/shop/checkout/payment), and reverses on refund.

## Why it is a component and not an actor

Because something needs to point at it. `depends-on` and `uses` accept
components, products, datamodels, protocols, and environments — never actors — so
the moment [payment](srn://acme/shop/checkout/payment) has to declare a
structural dependency on the acquirer, the acquirer must be a component. An
`external` component is exactly that: a node at the boundary, described locally,
with no claim that acme understands its insides.

Modelling the same third party twice — once as a component and once as an actor —
would produce two nodes for one company and is a review defect the portal cannot
detect for you.

## Two environments, two systems

It declares both [production](srn://acme/environment/production) and
[staging](srn://acme/environment/staging), which for an external component is how
a live endpoint is distinguished from a sandbox. They are genuinely different
systems: the sandbox approves any card ending in an even digit and has never had
an outage, which is why load and failure behaviour observed against it means
nothing.

## What is deliberately not described

Its internal states, its retry semantics, and its settlement file format. Where
those matter they are re-stated as obligations on acme's side — see
[idem-cap](srn://acme/shop/checkout/requirement/idem-cap), which exists precisely
because this component's timeouts are not trustworthy.
