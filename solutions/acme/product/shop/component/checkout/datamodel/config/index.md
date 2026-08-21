---
name: config
kind: datamodel
version: 1
title: Checkout configuration
summary: What checkout must be told before it starts — one credential it cannot invent and one log level it can, stated so an environment can be checked against it.
status: approved
owner: team-checkout
usage: config
abstract: false
tags:
  - configuration
---

The concrete config contract of
[checkout](srn://acme/product/shop/component/checkout). There is no field on the
component pointing here and no edge: the link is ownership-by-placement plus
`usage: config`, so the contract of a component is the one concrete `usage:
config` model in its own `datamodel/` bucket, or none.

## What it declares

| Key            | Source of the entry                                                                        |
| -------------- | ------------------------------------------------------------------------------------------ |
| `LOG_LEVEL`    | inherited from [platform-config](srn://acme/datamodel/platform-config)                     |
| `DATABASE_URL` | `for: /product/shop/component/checkout` in [production](srn://acme/environment/production) |

Nothing here was invented for the contract. Both keys already existed on the
environment's side of the join; what was missing was anybody stating what a
legal value is, which is why an environment could declare `DATABASE_URL` and no
check could tell whether checkout had ever heard of it.

## `DATABASE_URL` is `writeOnly`, and that is the second lock

`writeOnly: true` says *this key is a secret*: a value supplied to the catalog
and never read back out of it, which is exactly the property a credential needs
in a public git repository. It carries no `default`, no `const` and no
`examples`, because each of those would be the value itself, whatever
environment it was meant for.

The environment declares the same fact independently — `secret: true` plus a
`source:` locator that names a vault path rather than a password — and the two
statements are checked against each other. ENV8 could only ever refuse a value
on an entry that *admitted* to being secret; `writeOnly` is written by this
component's own author and turns leaving `secret: true` off into an error rather
than a habit.

The `pattern` is `^postgres(ql)?://` and it is not decoration. A DSN pasted from
the wrong environment usually still parses; a DSN pasted from the wrong *kind*
of system does not match, and that is the review this catches.

## What it does not declare

`KAFKA_BOOTSTRAP`, because checkout is not a participant of
[settlement](srn://acme/protocol/settlement) —
[payment](srn://acme/product/shop/component/checkout/component/payment) is, and
it extends [settlement-bus-config](srn://acme/datamodel/settlement-bus-config)
for exactly that reason. A contract is what a component reads, not what its
subtree reads.

`additionalProperties` stays unset, as everywhere in this kind. A process
inherits `PATH`, its runtime's whole environment and every key its orchestrator
injects; a contract that forbade them would be false about every deployment that
ever ran. An environment key this contract does not know is a warning, which is
the honest severity for a fact a contract cannot be complete about.
