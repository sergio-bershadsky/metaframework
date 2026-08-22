---
name: webhook-ingress
kind: protocol
version: 1
title: Webhook ingress
summary: A one-way push from a system that never reads the answer, arriving on the same listener as the REST API and meaning something completely different.
status: review
owner: sergio-bershadsky
style: point-to-point
participants:
  - alias: monitoring-system
    ref: /actor/monitoring-system
    role: sender
  - alias: edge
    ref: /product/platform/component/nginx
    role: gateway
  - alias: api
    ref: /product/platform/component/st2api
    role: receiver
tags:
  - http
  - webhook
  - ingress
---

The way the outside world starts an automation. A monitoring system, a source
repository, a ticketing tool or a scheduler posts a document to a path an
operator chose, and the API turns it into a trigger instance on the bus. From the
sender's point of view the conversation is over the moment the response code
arrives; nothing tells it whether a rule matched, whether an action ran, or
whether the action worked.

It is a separate protocol entity from
[rest-api](srn://stackstorm/protocol/rest-api@1) even though the two share a
listener, a port and a proxy location. They share nothing else: a different
counterpart, a different style, a different credential story, and a payload the
platform does not interpret.

## Where it sits, and what put it there

The nearest-common-ancestor rule places a protocol at the common prefix of its
**component** participants, ignoring actors. There are two component
participants here — the API process and the reverse proxy — and they are
siblings, so the common prefix is the product and this entity lives in the
product's `protocol/` bucket.

That is worth pausing on, because it is a placement decided by a modelling
choice rather than by the conversation. Drop the proxy from the participant list
and the only component participant is the API process; the nearest common
ancestor becomes that component and the entity moves down a level, into a bucket
inside it. Nothing about the exchange changes.

The proxy stays, because it is genuinely in this conversation: it terminates the
transport security, and a sender that reaches the API's own port is talking to a
different endpoint with no security at all. The lesson is that a gateway
participant raises a protocol's placement by exactly one level, every time, and
that a catalog which is inconsistent about listing gateways will be inconsistent
about where its protocols live.

## The response is a receipt, not an answer

The published description says the successful response is an acceptance code and
echoes the body back. That is the whole reply: no execution id, no rule match
result, and no way to correlate this push with the execution it eventually
caused, except by searching the audit history for a trigger instance with this
payload.

For a protocol whose entire job is to start work, having no correlation handle is
a real property, and `style: point-to-point` is the honest value — a named
receiver and no reply contract worth the name.

## The path is content, not structure

The path segment after the prefix is chosen by whoever wrote the rule that
listens on it: creating a rule with a webhook trigger creates the endpoint, and
deleting the rule removes it. So the surface list below can name the shape of the
path and never the paths themselves, and the operation's `request` names no
datamodel because the body is whatever the sender sends — the platform records
it whole as the trigger payload.

There is a second, fixed endpoint for the platform's own generic webhook, which
does have a stable path.

## What the framework cannot say about it

That the surface is **created at runtime by an operator's content**. Every other
HTTP surface in this catalog is fixed by code; this one's address space is a
consequence of records in the document store. The mini-spec's `operations` list
is a static enumeration, and the truthful entry here is a template with a
parameter in it — which the `path` field can express — plus the fact that
instantiating the template is an authoring act, which nothing can.

## Sources

Read at `v3.9.0`:
[`st2api/st2api/controllers/v1/webhooks.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2api/st2api/controllers/v1/webhooks.py),
[`st2common/st2common/openapi.yaml`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/openapi.yaml),
[`st2common/st2common/services/triggerwatcher.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/services/triggerwatcher.py).
