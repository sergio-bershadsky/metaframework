---
name: config
kind: datamodel
version: 1
title: Payment configuration
summary: An acquirer credential, a broker address and a kill switch — the three things payment cannot start, publish or ship a pilot without.
status: approved
owner: team-payments
usage: config
abstract: false
tags:
  - configuration
---

The concrete config contract of
[payment](srn://acme/product/shop/component/checkout/component/payment). It is
the only component in this catalog that extends both mixins, because it is the
only one that both logs like everything else and speaks on the
[settlement](srn://acme/protocol/settlement) bus.

## What it declares

| Key                       | Where it comes from                                                      |
| ------------------------- | ------------------------------------------------------------------------ |
| `LOG_LEVEL`               | [platform-config](srn://acme/datamodel/platform-config)                  |
| `KAFKA_BOOTSTRAP`         | [settlement-bus-config](srn://acme/datamodel/settlement-bus-config)      |
| `ACQUIRER_API_KEY`        | `for:` this component in [production](srn://acme/environment/production) |
| `FEATURE_INSTANT_REFUNDS` | `for:` this component in [production](srn://acme/environment/production) |

The join reads the **flattened** contract, so the two inherited keys are this
component's obligations exactly as if they were written in this file. Nothing
about the check is aware that inheritance happened — which is what makes a mixin
safe to use for a required key.

## The must-provide set is two keys, not four

`required` is `ACQUIRER_API_KEY` plus the two inherited requirements, and
`FEATURE_INSTANT_REFUNDS` is not required at all: a kill switch that has to be
set is not a kill switch. Subtract every key carrying a `default` and what an
environment actually owes payment is:

```text
required        = { LOG_LEVEL, KAFKA_BOOTSTRAP, ACQUIRER_API_KEY }
defaulted       = { LOG_LEVEL, FEATURE_INSTANT_REFUNDS }
must-provide    = { KAFKA_BOOTSTRAP, ACQUIRER_API_KEY }
```

Both are declared in `production` — the broker address environment-wide, the
credential scoped to this component — so the environment is complete and
`W_ENV_CONFIG_MISSING` has nothing to say. Drop either entry and it does.

## `FEATURE_INSTANT_REFUNDS` is typed `boolean`, and the environment writes `"false"`

That is deliberate on both sides. The contract states the type the component
reads; the environment's entry is a YAML string, because every `value:` written
before config contracts existed is one. The check reads a quoted scalar in the
declared type's own literal form, so `"false"` and `false` both satisfy
`{"type": "boolean"}` — and `"1"` does not, because a truthiness table belongs
to a runtime's parser rather than to a catalog's checker.

## `ACQUIRER_API_KEY`

`writeOnly: true`, no `default`, no `examples`. The environment declares it
`secret: true` with a vault locator and a 90-day rotation note; this file says
the same thing from the component's side, in the component's own bucket, so
neither author can quietly disagree with the other. A rotated credential changes
nothing in git, which is the property the three-layer rule is for: contract in
git, declaration in git, value nowhere in the catalog at any status.
