---
name: sepa-payment
kind: datamodel
version: 1
title: SEPA payment
summary: The SEPA direct debit branch of the payment-method union — an IBAN and the mandate authorizing it.
status: approved
owner: team-shop
usage: both
abstract: false
tags:
  - payments
---

# SEPA payment

The `method: sepa` branch of
[payment-method](srn://acme/product/shop/datamodel/payment-method@1): a direct debit
against an account the customer has mandated acme to charge.

The mandate identifier is required, not optional. A debit without a mandate on
file is unauthorized, and the customer's bank will reverse it up to thirteen
months later at acme's cost — so the schema refuses to describe an instrument
that lacks one. The mandate itself lives with the acquirer;
[psp](srn://acme/product/shop/component/checkout/component/payment/component/psp) issues the reference this field
carries.

## Why it is a separate entity rather than optional fields

Card and SEPA share no field but the tag. Modelling them as one object with
everything optional would make every consumer re-derive which instrument it is
holding by testing for presence — the exact failure the union tag exists to
prevent. Two entities, one union, one tag.

## Settlement consequences

A SEPA debit is not final when it is accepted. That difference is invisible in
this schema and visible in
[settlement](srn://acme/protocol/settlement), where a later reversal is a new
fact rather than a correction of the old one, and in
[ledger-entry](srn://acme/product/billing/datamodel/ledger-entry@1), which records both
legs rather than editing the first.
