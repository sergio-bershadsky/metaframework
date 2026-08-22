---
name: monitoring-system
kind: actor
version: 1
title: Monitoring system
summary: Any external alerting or monitoring product that pushes an event into StackStorm over a webhook and never hears from it again.
status: review
owner: sergio-bershadsky
actor-type: external-system
goals:
  - Deliver an alert to something that will act on it, and get an acknowledgement.
  - Not be told anything about what the automation subsequently does.
tags:
  - inbound
  - integration
---

The canonical inbound counterpart, and the reason the platform has a webhook
surface at all. Something outside notices a condition — a monitoring product, a
CI system, a cloud provider's event feed — and posts it. From that moment the
event is a trigger instance and the sender is out of the conversation.

## Why an actor and not an external component

By the boundary test the actor kind sets: nothing in this solution needs to name
a monitoring system in a `uses`, `exposes`, `depends-on` or `implements` edge.
The dependency runs the other way. The platform offers a surface, the sender
finds it, and no component of ours would fail if no monitoring system ever
existed — it would simply have nothing to react to. That is precisely the case
where an `external-system` actor is right and an `external` component would be
an edge nobody can author.

The contrast worth reading beside this is
[stackstorm-exchange](srn://stackstorm/product/automation-content/component/stackstorm-exchange),
which fails the same test in the opposite direction and is therefore a
component.

## One actor for an open set

This entity deliberately names a *class* of sender rather than a product. There
is no list of supported monitoring systems to enumerate: the surface is an HTTP
endpoint with a JSON body, and what is on the other end is unknown to the
platform by design. Creating one actor per vendor would be inventing an
integration inventory the software does not have.

## What this actor never gets

An outcome. The webhook surface answers that the event was accepted, not that
anything was done about it. Anything a sender learns afterwards, it learns
because a rule was written to tell it — which makes that a second, outbound
conversation with a different counterpart, not a reply on this one.
