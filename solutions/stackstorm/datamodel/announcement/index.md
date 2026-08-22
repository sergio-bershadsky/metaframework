---
name: announcement
kind: datamodel
version: 1
title: Announcement
summary: A two-key envelope an action publishes for anyone watching the stream — the one bus message whose routing key is chosen by the person writing the automation.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - bus
  - streaming
---

The platform's own way of letting an automation say something to whatever is
listening. An action running the announcement runner hands the dispatcher a
route and a payload — the payload being the action's own parameters — and the
dispatcher wraps it with a trace context and publishes it. Nothing stores it,
nothing acts on it, and exactly one thing consumes it: the stream service, whose
unnamed exclusive queue binds the single-word wildcard and forwards each message
to every connected HTTP client as a server-sent event.

The runner that does this refuses to run unless the action passes a required
`experimental` flag. So every instance of this model on the wire was published by
an automation whose author acknowledged, in the action's own parameters, that the
mechanism is not settled.

## The routing key is content

Everywhere else on this bus the routing key is a fact the platform decides: a
status, or one of the create/update/delete triple. Here it is the runner's
`route` parameter — a pack author picks the string, and subscribers filter on it.
That makes this the one exchange whose address space is open, and it is the
reason the transport document for
[announcements](srn://stackstorm/product/platform/protocol/announcements@1)
cannot enumerate its channels the way the others can.

The open address space has a consequence the two ends do not agree about. The
runner's own parameter documentation says the route may be a list of words
delimited by dots; the only consumer binds `*`, and under AMQP 0-9-1 topic
semantics that pattern matches exactly one word. A dotted route publishes
successfully and reaches the stream not at all.

## Why `usage: exchange` and not `both`

There is no announcement collection. The record does not exist before the publish
and does not exist after the last subscriber has read it; the audit trail of an
announcement is the audit trail of the *action* that made it. This is the only
datamodel in this catalog whose instances are never at rest.

Read at `v3.9.0`:
[`st2common/st2common/transport/announcement.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/transport/announcement.py),
[`contrib/runners/announcement_runner/announcement_runner/runner.yaml`](https://github.com/StackStorm/st2/blob/v3.9.0/contrib/runners/announcement_runner/announcement_runner/runner.yaml),
[`st2common/st2common/stream/listener.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/stream/listener.py).
