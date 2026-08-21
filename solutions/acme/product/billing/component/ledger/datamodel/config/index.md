---
name: config
kind: datamodel
version: 1
title: Ledger configuration
summary: The double-entry store's DSN and the bus it consumes from — two required keys with no defaults, because a ledger that guesses either is a ledger that is wrong quietly.
status: approved
owner: team-billing
usage: config
abstract: false
tags:
  - configuration
---

The concrete config contract of
[ledger](srn://acme/product/billing/component/ledger), the consumer side of
[settlement](srn://acme/protocol/settlement).

## What it declares

| Key               | Where it comes from                                                      |
| ----------------- | ------------------------------------------------------------------------ |
| `LOG_LEVEL`       | [platform-config](srn://acme/datamodel/platform-config)                  |
| `KAFKA_BOOTSTRAP` | [settlement-bus-config](srn://acme/datamodel/settlement-bus-config)      |
| `LEDGER_DSN`      | `for:` this component in [production](srn://acme/environment/production) |

## Two required keys, no defaults, and the reason is the same reason twice

`LEDGER_DSN` and the inherited `KAFKA_BOOTSTRAP` are both in the must-provide
set. Neither can carry a default, and the argument is not "we could not think of
one" — it is that a default here fails in the shape this component exists to
prevent. A ledger pointed at a default database writes correct double-entry rows
into the wrong book; a consumer pointed at a default broker reads nothing and
reports healthy. Both are silent, and
[audit-trail](srn://acme/product/billing/requirement/audit-trail) is the
requirement that makes silence the expensive failure.

So the environment owes ledger both keys, and `production` declares both — the
DSN scoped `for:` this component with a vault locator, the broker list
environment-wide.

## `LEDGER_DSN` and `DATABASE_URL` are two keys, not one renamed

They name different stores owned by different teams, and they are `writeOnly` in
different contracts. Nothing in this framework joins them, and nothing should:
the contract is per component, so two components reading different databases
under different key names is the ordinary case rather than a naming
inconsistency to clean up.
