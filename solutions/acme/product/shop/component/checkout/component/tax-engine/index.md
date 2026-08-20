---
name: tax-engine
kind: component
version: 3
title: Tax engine
summary: Library computing tax for a cart from a versioned rate table; runs inside checkout's process.
status: approved
owner: team-checkout
component-type: library
lifecycle: released
relations:
  uses:
    - /datamodel/money@1
  exposes:
    - /product/shop/component/checkout/protocol/tax-quoting
tags:
  - tax
  - library
---

# Tax engine

A build-time artifact with no runtime of its own: it runs inside whatever
process embeds it, which today is exactly one —
[checkout](srn://acme/product/shop/component/checkout). It computes tax for a
[cart](srn://acme/product/shop/component/checkout/datamodel/cart@1) from a rate table versioned on
a legislative calendar.

## Why it declares no environment

A `library` has nowhere to run, so it never declares an environment. The
component that embeds it does, and the deployment view derives the library's
reach from that. Declaring `uses: /environment/production` here would be a
category error, and the framework treats it as one.

## The rate table

Rates are compiled in, not fetched. A tax rate that changes under a running
process is a correctness problem nobody can reproduce afterwards; embedding the
table makes the rate a property of the deployed build, and the diagnostic
accessor in [tax-quoting](srn://acme/product/shop/component/checkout/protocol/tax-quoting) exists
so an operator can ask which vintage is live.

The cost is that a legislative change requires a release of every embedder. With
one embedder that is acceptable; with three it would not be, and the honest
successor would be a service rather than a library.
