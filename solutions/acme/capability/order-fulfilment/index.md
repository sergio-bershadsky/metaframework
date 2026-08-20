---
name: order-fulfilment
kind: capability
version: 1
title: Fulfil an order
summary: Get paid-for goods to the customer who ordered them, on a date acme named, or say truthfully why not.
status: approved
owner: team-commerce
tags:
  - commerce
  - customer-facing
---

Acme can turn an order into a parcel a customer has taken from a courier's
hands. It can hold the stock while the payment clears, decide what travels in
which box and by whose van, get a carrier to accept it, and keep the customer
told where it is until it arrives. When it cannot be done — the stock was
oversold, no carrier would take the parcel, the address does not exist, the
scan stream went quiet — acme can say so, name the reason, and stop the
customer finding out by waiting.

The failure path is inside the sentence deliberately. A fulfilment description
that covers only the happy case is exactly the description under which a
customer ends up with no goods, no money back, and no explanation, and that is
the case the business is actually judged on. It is why
[carrier-failover](srn://acme/product/fulfilment/requirement/carrier-failover)
and
[delivery-promise-accuracy](srn://acme/product/fulfilment/requirement/delivery-promise-accuracy)
read as obligations on this capability rather than as features of a component.

Rebuild every system underneath — a different carrier network, a different
orchestrator, a warehouse acme operates itself — and this paragraph does not
change. That invariance is the test, and it is the only reason this entity
exists separately from
[fulfilment](srn://acme/product/fulfilment), which is the product currently
carrying most of it.

## Boundaries

- **Starts at the intent to buy, not at the settled payment.** The reservation
  [inventory](srn://acme/product/shop/component/inventory) holds for 120 seconds
  is inside this capability even though it happens before any money moves: a
  promise acme cannot keep has already been broken at that moment, and
  discovering it at dispatch only changes who has to apologise. That is why two
  components in [shop](srn://acme/product/shop) — the one that holds the stock
  and the one that turns a basket into the order to be fulfilled — realize a
  capability whose remaining realizers all sit in
  [fulfilment](srn://acme/product/fulfilment). Each carries a slice; the catalog
  does not try to say how large a slice, because nobody could check the answer.
- **Ends at delivery, or at a parcel written off.** What happens to the money
  afterwards is [billing](srn://acme/product/billing)'s, and a refund is a
  different doing with a different team answering for it.
- **Says nothing about which carrier.** The third party is described as an
  external component
  ([parcel-carrier](srn://acme/product/fulfilment/component/carrier-gateway/component/parcel-carrier))
  and may be swapped without a word of this page changing. The portal's
  "Realized by" list is where the current answer lives, and it is derived.
- **Warehouse operations are out of scope for the whole solution**, so they are
  out of scope here. This capability starts with a parcel that has a weight and
  a destination, as the fulfilment product does.

## Not this

- *Take payment* is upstream and separate. An order can be paid for and never
  fulfilled — that is precisely the case this capability's failure path is
  written to cover, and folding the two together would hide it.
- *Track a parcel* is not a second capability. It is the "keep the customer
  told" clause of this one, read from the customer's side; the fact that
  [tracking](srn://acme/product/fulfilment/component/tracking) is a separate
  component is an implementation split, and this page is deliberately blind to
  implementation splits.
- *Deliver on the promised date* is not a capability either — it is a statement
  that must be true, which makes it a requirement
  ([delivery-promise-accuracy](srn://acme/product/fulfilment/requirement/delivery-promise-accuracy)),
  and a number that says whether it holds, which makes it a metric
  ([delivery-on-time-rate](srn://acme/product/fulfilment/metric/delivery-on-time-rate)).
