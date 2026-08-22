---
name: automation-operator
kind: actor
version: 1
title: Automation operator
summary: The SRE or platform engineer who installs StackStorm, writes the rules that fire, and answers for what the automation did at three in the morning.
status: review
owner: sergio-bershadsky
actor-type: human
goals:
  - Turn a recurring manual remediation into something that runs without being woken up for it.
  - See exactly what an automated run did, with the trigger that caused it, after the fact.
  - Stop a misbehaving automation without stopping the platform.
  - Install and upgrade the platform without becoming an expert in its message bus.
relations:
  uses:
    - /product/operator-surfaces/component/st2client
    - /product/operator-surfaces/component/st2web
tags:
  - sre
  - primary
---

The role the product exists for. An automation operator is whoever owns the
runbooks at an organisation — an SRE, a platform engineer, an ops lead — and
StackStorm's proposition to them is that a runbook can stop being a document and
become a rule plus an action.

## Why this is one actor and not three

The obvious split is *installer*, *rule author* and *incident responder*, and it
is the wrong cut here. All three reach the same two surfaces with the same
credentials, and at the scale StackStorm is typically deployed they are the same
person on different days. Splitting them would produce three actors with
identical `uses` edges and no protocol that distinguishes them, which is exactly
the shape the actor kind warns about.

The one role that genuinely is different has its own entity:
[pack-author](srn://stackstorm/actor/pack-author) writes integrations for other
people to install, and answers to a registry rather than to an incident.

## What this actor never does

Log into the machines StackStorm acts on. That is the whole point: the operator
addresses [managed-host](srn://stackstorm/actor/managed-host) through an action,
and the record of having done so is the thing the audit trail exists to keep.
Where an operator does log in directly, they are outside every description in
this catalog.

## Reach, and where participation is declared

The `uses` edges above name the two surfaces this actor touches directly. They
state reach, not conversation: which protocols this actor participates in is
declared on the protocol side, once, and is never restated here.
