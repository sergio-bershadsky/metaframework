---
name: trigger-dispatch-message
kind: datamodel
version: 1
title: Trigger dispatch message
summary: The three-key wrapper every sensor, timer, webhook and re-fire publishes onto the trigger exchange — a trigger reference, an opaque payload, and a trace context.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - bus
  - trigger
---

The message that starts everything. Every source of events in this system — a
sensor process, the timer engine, an inbound webhook, an inquiry response, a
notifier, an operator asking for a re-fire — publishes this exact wrapper onto
one exchange with one fixed routing key, and the rules engine is the only thing
that consumes it.

It is a wrapper and not a record, and the distinction is the interesting part of
this entity.

## The record is created by the receiver, not the sender

Nothing on the wire is a
[trigger-instance](srn://stackstorm/datamodel/trigger-instance@1). The sender
publishes a *reference* to a trigger plus an opaque payload; the rules engine
creates the trigger instance record when it takes the message off the queue, and
it does so **before acknowledging** it, so a failure to create the record leaves
the message unacknowledged rather than losing it. The id, the occurrence time
and the status all come into existence on the consumer's side.

That is why two datamodels describe what a careless reading would call one
thing, and why the message × datamodel matrix on
[trigger-dispatch](srn://stackstorm/product/platform/protocol/trigger-dispatch@1)
names this model and not the record.

## `trigger` is a reference or an object, and the code says so

The dispatcher's own parameter documentation admits both a reference string —
the `pack.name` form — and an object. Every shipped caller passes one or the
other, and no discriminator distinguishes them, so the schema states the union
that the sender is allowed to send rather than the one this catalog would prefer.
There is no version, no schema id and no content type inside the message: what
the payload means is decided entirely by which trigger the reference names.

## `payload` is a hole by design

A trigger's payload shape is declared by the trigger *type*, which is registered
at runtime by whichever pack shipped it. The dispatcher validates only that the
payload is a mapping. So `payload` here is `type: object` with no properties, and
that is not a modelling shortcut — it is the contract: this exchange carries
arbitrary user-defined shapes, and the rule that matches them is written by the
operator against fields the platform has never heard of.

Read at `v3.9.0`:
[`st2common/st2common/transport/reactor.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/transport/reactor.py),
[`st2reactor/st2reactor/rules/worker.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2reactor/st2reactor/rules/worker.py).
