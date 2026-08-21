---
name: platform-config
kind: datamodel
version: 1
title: Platform configuration
summary: The one configuration key every hosted acme component reads — a mixin, because a log level written into three contracts is a log level that will disagree with itself.
status: approved
owner: team-platform
usage: config
abstract: true
tags:
  - foundation
  - configuration
---

`usage: config`: an instance of this model is not a record and not a message, it
is **one process environment** — a flat map of environment-variable names to
scalars, which is what a component reads before it reads anything else.

`abstract: true` for the reason every mixin here is abstract: no component's
contract is *this*. It is the shape several contracts share, reached with a root
`allOf` branch, and the bucket rule that says a component has at most one config
contract counts concrete models only — so a mixin may sit at solution level,
where a solution-wide surface belongs.

## Why `LOG_LEVEL` is here and `KAFKA_BOOTSTRAP` is not

[production](srn://acme/environment/production)'s `config.yaml` declares both
without a `for:`, which reads as "environment-wide" and says nothing about who
consumes them. The two are not the same fact:

- Every hosted component logs. The entry's own description says so — *root log
  level for every hosted component* — so the key belongs to a surface all of
  them share.
- Only the [settlement](srn://acme/protocol/settlement) participants speak to a
  broker. That surface is
  [settlement-bus-config](srn://acme/datamodel/settlement-bus-config), and
  putting its key here would tell [checkout](srn://acme/product/shop/component/checkout)
  it needs a Kafka client it has never opened.

An environment-wide entry is checked against every hosted contract that declares
the key, so this split is exactly what decides which components
`LOG_LEVEL: warn` is graded against.

## `required` and `default` together

`LOG_LEVEL` is both, and the pair is the whole point of the join. The key is
always present in the resolved configuration — the process supplies `info`
itself if nobody else does — so it is `required`; and because it carries a
`default` it drops out of the **must-provide** set, which is `required` minus
every defaulted key. An environment that declares no log level is therefore
correct rather than incomplete, and
`W_ENV_CONFIG_MISSING` stays quiet about it.

There is no `writeOnly` key here. A log level is not a credential, and marking
one secret would be an outage nobody can debug rather than security — which is
why the environment side treats that disagreement as an error.
