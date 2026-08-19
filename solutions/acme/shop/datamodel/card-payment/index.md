---
name: card-payment
kind: datamodel
version: 1
title: Card payment
summary: The card branch of the payment-method union — a tokenized instrument, never a card number.
status: approved
owner: team-shop
usage: both
abstract: false
tags:
  - payments
---

# Card payment

The `method: card` branch of
[payment-method](srn://acme/shop/datamodel/payment-method@1). It carries a token
issued by the acquirer, the scheme, and the last four digits — and deliberately
nothing else.

No primary account number, no expiry, no security code appears in this schema or
anywhere else in this catalog. The browser exchanges the card for a token
directly with [psp](srn://acme/shop/checkout/payment/psp) before
[checkout](srn://acme/shop/checkout) ever sees the request, so the sensitive
data never enters a system acme describes. That is a scope decision as much as a
security one: what is not in the catalog cannot be leaked by it.

## The last four digits

`pan-last4` is not an identifier and must never be used as one. It exists so a
support agent can confirm with a customer which card they used, and so a
confirmation email can say something more human than a token. Two customers
routinely share the same four digits.

The token is per-acquirer and per-merchant. Moving acquirers invalidates every
stored token at once, which is a migration this schema cannot help with and the
reason the field is documented as opaque.
