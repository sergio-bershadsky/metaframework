---
name: first-purchase
kind: journey
version: 2
title: First purchase
summary: A new customer's path from the storefront to a parcel in their hands — three products, one account they did not have this morning, and not one system conversation between them.
status: review
owner: team-commerce
actor: /actor/customer
relations:
  uses:
    - /environment/production
tags:
  - commerce
  - cross-product
---

The path acme is judged on. Somebody who has never bought here before arrives at
the storefront, ends up with an account, an order they have paid for, and a
parcel they have watched turn into "delivered". It crosses
[shop](srn://acme/product/shop), [identity](srn://acme/product/identity) and
[fulfilment](srn://acme/product/fulfilment), in that order, and every one of
those crossings is a place where the catalog can be true inside each product and
say nothing about what happens between them.

## Outcome

The customer holds the parcel, has an account they can sign back into, and can
see what they paid and when it arrived without contacting support.

## Preconditions

None. That is what makes this journey worth naming rather than
`place-an-order`: the account does not exist at step 0, and the two steps that
create it are the two a returning customer skips. A returning customer's path is
a shorter, different journey and is not written down yet.

## Every product crossing here is carried by the customer

Three steps change product, and all three name `protocol: none`. That is a claim
and it deserves the paragraph:

- **steps[1], shop to identity.** The customer follows a "create an account"
  link and types their details into identity's own form. Nothing passes between
  the storefront and [registration](srn://acme/product/identity/component/registration);
  the customer is the integration.
- **steps[3], identity back to shop.** The customer returns to the basket
  holding an opaque session token in their browser
  ([0002-opaque-session-tokens](srn://acme/product/identity/adr/0002-opaque-session-tokens)).
  Nothing flows from
  [authentication](srn://acme/product/identity/component/authentication) to
  [checkout](srn://acme/product/shop/component/checkout) at that moment either.
- **steps[5], shop to fulfilment.** The confirmation mail carries a tracking
  link, and the customer clicks it. Shop does not know fulfilment exists — that
  asymmetry is declared on
  [fulfilment](srn://acme/product/fulfilment) and is deliberate.

`none` is a narrow claim, and steps[3] is where the narrowness matters. It says
that nothing travels between authentication and checkout when the customer walks
back. It does **not** say that checkout never asks identity anything — and what
checkout does with the token it receives is not written down anywhere in this
catalog. Checkout declares no edge toward
[authorization-check](srn://acme/product/identity/protocol/authorization-check),
and that protocol lists no shop component among its participants. The gap is
real, it is older than this journey, and this page is only the first thing to
point at it.

## Why the courier appears

`steps[6]` belongs to the [courier](srn://acme/actor/courier). It is the one
step the customer does not take, and the only one that moves the parcel
anywhere. It is written out
rather than folded into the step around it because a reader who skims the actor
column should stop there: everything before it is somebody choosing to buy, and
everything after it is somebody watching a fact that was created by a person
acme does not employ.

## Out of scope

Returns and refunds, which start where this path ends.
[billing](srn://acme/product/billing) — the fourth product, which the customer's
money passes through and which never appears in a single step. That absence is
accurate and is worth noticing: the ledger is on the other side of a bus, and
nothing the customer does waits for it.
