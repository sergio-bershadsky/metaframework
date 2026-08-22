---
name: api-key-identity
kind: actor
version: 1
title: API key identity
summary: The non-human credential a bridge, a script or a pipeline assumes to call the API — the thing an execution record actually names.
status: review
owner: sergio-bershadsky
actor-type: service-account
goals:
  - Call the API without holding a person's password, on behalf of whoever issued the key.
  - Be revocable on its own, without disturbing the runtime that was using it.
tags:
  - credential
  - security
---

The identity, never the runtime. StackStorm issues long-lived API keys and
short-lived authentication tokens; a key is what a non-human caller presents,
and it is what the execution record attributes the run to.

## Why this is separate from every runtime that uses it

Because it is revoked, rotated and audited on its own. The ChatOps bridge holds
one; a cron job on somebody's laptop holds another; a pipeline holds a third.
All three are different runtimes with different lifecycles, and all three appear
in the audit trail as the key they presented. Folding this into the runtimes
would make the credential inventory — the question security review actually asks
— unanswerable by listing entities.

## The attribution gap this actor makes visible

An execution started from a chat room is attributed to the bridge's key, not to
the [chat-user](srn://stackstorm/actor/chat-user) who typed it. Naming the key
as its own actor is what lets the catalog say that plainly instead of implying,
by silence, that the platform knows which human acted. It does not; the chat
platform does.

## Boundaries

This entity does not describe the authentication backends behind it. The
authentication service supports pluggable backends and two of them ship as
separate distributions that were not surveyed, so what proves a *human's*
identity is out of scope while what proves a *machine's* is this.
