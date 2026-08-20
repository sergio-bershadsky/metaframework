---
name: production
kind: environment
version: 4
title: Production
summary: Primary customer-facing target for the acme solution — EU-West with a US-East read region.
status: approved
owner: team-platform
environment-type: production
relations:
  uses:
    - /datamodel/money@1
tags:
  - eu
  - regulated
---

The only target that holds customer data of record. Everything deployed here is
`status: approved` at the version that is running; a component still in `draft`
has no business declaring `uses: /environment/production`, and the reviewer's
first question about any such edge is why.

## Guarantees

- Availability objective 99.9% monthly for the checkout path, measured at the
  public edge. The number itself is an obligation, written down as
  [p99-checkout-latency](srn://acme/product/shop/component/checkout/requirement/p99-checkout-latency).
- Data residency: order and payment data stay in `eu-west-1`. The `us-east-1`
  region serves read-only catalogue traffic and holds no payment instrument.
- Change window: schema migrations run through the
  [release-bot](srn://acme/actor/release-bot) identity only, never a human
  credential.
- Every amount crossing a boundary here is a [money](srn://acme/datamodel/money@1)
  document — decimal string plus ISO currency, never a float.

## Placement and configuration

Placement is in the sibling `topology.yaml`; the configuration surface is in
`config.yaml`. Which components run here is deliberately *not* listed in either
file — it is derived from the components' own `uses` edges, and the portal
renders that roster on this page. A topology entry for a component that has not
declared this environment is a warning, not a fact.

Secrets are named here and stored elsewhere. `config.yaml` carries a locator for
every sensitive value and never the value itself, at any status, in any branch.
