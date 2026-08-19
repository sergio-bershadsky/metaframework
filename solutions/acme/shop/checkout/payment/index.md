---
name: payment
kind: component
version: 5
title: Payment
summary: Orchestrates authorization, capture, and refund against the card acquirer, and publishes settlement facts.
status: approved
owner: team-payments
component-type: service
relations:
  uses:
    - /environment/production
    - /environment/staging
    - /datamodel/money@1
  exposes:
    - ../../protocol/order-placement
    - /protocol/settlement
    - datamodel/order@3
  depends-on:
    - psp
  implements:
    - ../requirement/idem-cap
    - /requirement/gdpr-erasure
tags:
  - payments
  - pci
x-jira-epic: SHOP-142
---

# Payment

The sub-component that talks to money. It authorizes, captures, and refunds
through [psp](srn://acme/shop/checkout/payment/psp), owns the
[order](srn://acme/shop/checkout/payment/datamodel/order@3) aggregate as it
exists after authorization, and publishes the settled fact onto the
[settlement](srn://acme/protocol/settlement) bus for
[billing](srn://acme/billing) to pick up.

It is nested under [checkout](srn://acme/shop/checkout) because it is *part of*
checkout — a composition statement, not a dependency one. If tomorrow the
storefront and a call-centre application both needed it, the correct move would
be to keep it exactly where it is and have the second consumer point at it by
reference.

## Two directions of edge

`exposes` names the surfaces this component provides: the shop-level
[order-placement](srn://acme/shop/protocol/order-placement) protocol it responds
in, the solution-level [settlement](srn://acme/protocol/settlement) bus it
publishes on, and the order aggregate itself. `depends-on` names the one thing it
structurally requires, the external acquirer.

The pairing with the protocols' own participant lists is deliberate and
symmetric: the component side owns the edge and its direction, the protocol side
owns the alias that workflow steps use. Neither is derivable from the other, and
the portal cross-checks them.

## Card data

No primary account number ever reaches this component. The browser tokenizes
directly with the acquirer, and what payment holds is the token plus the last
four digits — see [card-payment](srn://acme/shop/datamodel/card-payment@1). That
is what keeps the PCI scope of this catalog to one `external` component and a
tokenized field.

## Idempotency

Payment implements the checkout-owned
[idem-cap](srn://acme/shop/checkout/requirement/idem-cap) obligation: checkout
owns the key, payment guarantees that a replay never reaches the acquirer twice.
Both halves are needed and neither is sufficient, which is why the requirement
lives one level up and both components claim it.
