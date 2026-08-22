---
name: trigger-instance
kind: datamodel
version: 1
title: Trigger instance
summary: The record the rules engine writes when an event arrives — trigger, payload, occurrence time, and a four-value processing status the audit trail is built on.
status: review
owner: sergio-bershadsky
usage: both
abstract: false
tags:
  - trigger
  - audit
---

One event, as the platform remembers it. It is created by the rules engine from
a [trigger-dispatch-message](srn://stackstorm/datamodel/trigger-dispatch-message@1),
persisted, and then read back over the REST API for the rest of its life — the
first row of every audit trail that ends in an execution.

## The status is a processing status, not an event status

The four values say what *the platform* did with the event, never what happened
in the world that produced it: pending, processing, processed, and a failure
value spelled `processing_failed`. A trigger instance that was matched by no rule
still reaches `processed`; the rule enforcement record, not this status, is where
"a rule fired" is written down.

The transitions are set by the rules engine around its own work, which is why
this is the one record in the platform whose status has no bus exchange of its
own: nothing subscribes to it. Compare
[live-action](srn://stackstorm/datamodel/live-action@1), whose every status
change is a routing key.

## `payload` stays opaque here too

The engine stores the payload as it arrived. Rule criteria are evaluated against
that object with the pack's own field names, so the shape belongs to whichever
pack registered the trigger type. This schema states the frame and refuses to
invent the picture.

## Re-emitting is a new instance

The API can re-fire a stored trigger instance. That publishes a fresh dispatch
message and therefore produces a *second* record with its own id and occurrence
time; nothing rewinds. Worth knowing before reading an audit trail with two
identical-looking rows.

Read at `v3.9.0`:
[`st2common/st2common/models/api/trigger.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/models/api/trigger.py),
[`st2common/st2common/constants/triggers.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/constants/triggers.py),
[`st2reactor/st2reactor/rules/worker.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2reactor/st2reactor/rules/worker.py).
