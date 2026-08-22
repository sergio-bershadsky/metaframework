---
name: operator-surfaces
kind: product
version: 1
title: Operator surfaces
summary: The three things a human drives StackStorm with — the web UI, the CLI and Python bindings, and the ChatOps bridge — each its own repository and channel.
status: review
owner: sergio-bershadsky
lifecycle: active
primary-actors:
  - /actor/automation-operator
  - /actor/chat-user
tags:
  - ui
  - cli
  - chatops
---

Three surfaces, three repositories, three languages, three distribution
channels, and exactly one thing in common: on the other side of each of them is
a person. That shared consumer is the product line, and it is a real one — none
of these three ships on the platform's release train, and all three would be
individually removable without the platform noticing.

## Why not one product with the platform

Because the boundary a product draws is the ownership and delivery line, and
these three cross it. The web UI is a JavaScript single-page application from
`StackStorm/st2web`; the ChatOps bridge is a shell-packaged third-party chat
robot runtime from `StackStorm/st2chatops`; the CLI is a Python distribution
that happens to be built in the platform's own repository but is published
separately and installed by people who install nothing else. Folding them into
[platform](srn://stackstorm/product/platform) would claim they go out under one
tag, which is false of two of the three.

## Why they are not three products

They are delivered to one consumer for one purpose, and the interesting review
question about any of them is the same question — *what can an operator do from
here, and with whose credential?* Splitting further would produce three products
with one owner between them and no distinct budget, which is the ownership line
put in a place that owns nothing.

## The credential asymmetry, and where it is recorded

The three surfaces do not have equal reach, and the difference is not cosmetic.
The UI and the CLI act as the human, with a token that authentication issued for
that human. The bridge acts as itself, holding
[api-key-identity](srn://stackstorm/actor/api-key-identity), so a run started
from a chat room is attributed to the bridge and not to the person who asked for
it. That asymmetry is the reason
[chat-user](srn://stackstorm/actor/chat-user) is a separate actor from
[automation-operator](srn://stackstorm/actor/automation-operator).

## The strain this product carries

[st2client](srn://stackstorm/product/operator-surfaces/component/st2client) is
one distribution with two component identities — a program a user runs, and a
package other people's code imports. The component kind gained `application` and
kept `library`, and this artifact is both. Its page argues the case rather than
picking quietly.
