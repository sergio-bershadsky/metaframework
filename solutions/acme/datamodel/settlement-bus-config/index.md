---
name: settlement-bus-config
kind: datamodel
version: 1
title: Settlement bus configuration
summary: Where a settlement participant finds the brokers — the one key shared by the publisher and the consumers of the settlement bus, and by nothing else.
status: approved
owner: team-billing
usage: config
abstract: true
tags:
  - settlement
  - configuration
---

`KAFKA_BOOTSTRAP` is declared once, environment-wide, in
[production](srn://acme/environment/production)'s `config.yaml`, with the
description *bootstrap servers for the settlement bus*. That sentence names the
consumers precisely, and they are the participants of
[settlement](srn://acme/protocol/settlement):
[payment](srn://acme/product/shop/component/checkout/component/payment) publishes,
[ledger](srn://acme/product/billing/component/ledger) and
[reconciliation](srn://acme/product/billing/component/reconciliation) consume.

Two of those three run in `production` and both extend this mixin, so an
environment-wide entry is checked against both contracts rather than against
every hosted component in the solution. That is the difference a mixin makes to
the join: without it the key would either be copied into two files, which drift,
or promoted into
[platform-config](srn://acme/datamodel/platform-config), which would claim that
[checkout](srn://acme/product/shop/component/checkout) needs a broker address it
has never opened a connection with.

`reconciliation` is the third participant and has no contract, because it runs
only in [staging](srn://acme/environment/staging) and staging declares no
`config.yaml` at all. Writing one for it would be describing a configuration
surface no environment in this catalog provides — the contract is the half a
component owns, and it is worth authoring when there is an environment on the
other side of the join to check it against.

## No default, and that is the finding

`KAFKA_BOOTSTRAP` is `required` and carries no `default`, so it is in the
**must-provide** set of every contract that extends this one. An environment
hosting `payment` or `ledger` and declaring no bootstrap list is a process that
starts, connects to nothing, and looks healthy — which is precisely the failure
`W_ENV_CONFIG_MISSING` exists to find in review rather than at 3am. A default
would be worse than none: a client that guesses a broker fails at first publish,
with a message about a name that nobody chose.

The `pattern` is `host:port`, comma-separated, because that is the shape the
Kafka clients parse and a value that fails it fails at connect time rather than
at read time. It is deliberately not a `format`: formats are annotation-only in
this framework, and this constraint is meant to reject.
