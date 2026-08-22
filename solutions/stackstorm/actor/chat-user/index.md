---
name: chat-user
kind: actor
version: 1
title: Chat user
summary: A person who runs and reads automation from a chat room rather than from a terminal, through an alias the platform maps onto an action.
status: review
owner: sergio-bershadsky
actor-type: human
goals:
  - Run a known remediation from the incident channel without leaving it.
  - Have everyone in the channel see what was run and what it returned.
  - Use a phrase somebody chose, not a command line with flags.
relations:
  uses:
    - /product/operator-surfaces/component/st2chatops
tags:
  - chatops
---

The actor whose whole interface is a sentence in a room. A chat user does not
hold platform credentials of their own in the way an
[automation-operator](srn://stackstorm/actor/automation-operator) does; they
speak to a bot, and the bot holds the credential.

## Why a separate actor and not an operator in a different room

Because the trust posture is different, and that is the question the actor kind
exists to answer. The chat surface is deliberately narrower than the API: only
actions somebody has given an **alias** are reachable, the phrasing is fixed by
whoever wrote the alias, and the credential used is the bridge's rather than the
speaker's. An operator with API access can run anything; a chat user can run
what the room was set up to run. Modelling both as one actor would claim a reach
this one does not have.

The consequence for the audit trail is the interesting one, and it is a real
limitation rather than a design flourish: an execution started from chat is
attributed to the identity the bridge holds, so *which human in the room typed
it* is a fact the chat platform has and this platform does not. That is why
[api-key-identity](srn://stackstorm/actor/api-key-identity) exists as a separate
actor — it is the thing the execution record actually names.

## Boundaries

The chat platform itself — Slack, Mattermost, whatever the bridge is configured
against — is not described anywhere in this catalog, not even as an external
component. Nothing in the solution needs to name it in an edge: the bridge
adapts to it, and which one it adapts to is a deployment choice.
