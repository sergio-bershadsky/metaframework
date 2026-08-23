---
name: st2chatops
kind: component
version: 2
title: st2chatops
summary: The ChatOps bridge — a packaged third-party chat robot runtime that turns an aliased phrase in a room into an execution, holding its own credential.
status: review
owner: sergio-bershadsky
component-type: gateway
lifecycle: released
criticality: 4
relations:
  uses:
    - /environment/single-box
    - /environment/dev-compose
    - /protocol/event-stream
    - /protocol/rest-api
  depends-on:
    - /product/platform/component/st2api
tags:
  - chatops
  - bridge
x-repository: StackStorm/st2chatops
x-third-party-runtime: hubot
---

The surface for [chat-user](srn://stackstorm/actor/chat-user). Somebody types a
phrase in a room; the bridge matches it against the **aliases** installed packs
have registered, calls the API to start the corresponding execution, and posts
the result back into the room.

## Why `gateway`, and where the type strains

Fronting a service for a different class of caller is exactly what `gateway`
means, and the `depends-on` edge names what it fronts. The strain is in the
type's unstated assumption — that we own the behaviour at the edge. We do not.

This repository is **packaging**, not a runtime: the process it starts is a
third-party chat robot framework with an adapter per chat platform, and the
project's contribution is a bundle of adapters, a configuration surface, and an
operating-system package. So the questions a reviewer asks about a gateway —
what does it do on a bad request, how does it retry, what does it log — are
answered by software this catalog does not describe and this project does not
maintain.

The type is right about the position and thin about the ownership, which is a
milder version of the strain
[st2sensorcontainer](srn://stackstorm/product/platform/component/st2sensorcontainer)
records: two components in this solution are mostly containers for other
people's code, and the type set has no axis for that.

## The credential asymmetry this component causes

It authenticates as itself, holding an
[api-key-identity](srn://stackstorm/actor/api-key-identity), so every execution
started from a chat room is attributed to the bridge. Which human asked is a
fact the chat platform holds and this platform does not. That is not a defect to
fix in this description — it is a property of the design, and the reason the
catalog carries a separate actor for the identity rather than folding it into
the person.

## Environments, and the one it is absent from

It is installed as a separate package on the single-host deployment and ships as
a service in the compose deployment. The clustered deployment's chart carries it
**disabled by default**, so it is not declared there: a component that a chart
can enable is not a component that runs somewhere.

That distinction — shipped versus enabled — has no field either, and the
`uses` edge is binary. Declaring the clustered environment would claim it runs
there; omitting it loses the fact that the chart can turn it on. The omission is
the less wrong of the two, and this paragraph is the rest of the sentence.

The project's own high-availability guidance points the same way: it says this
bridge is not easily run in a replicated arrangement and suggests keeping one of
it alive rather than several. That is a third statement — *this component does
not scale* — and it fits neither the type, nor the environment edge, nor the
replica range, for the same reason
[st2timersengine](srn://stackstorm/product/platform/component/st2timersengine)'s
constraint does not.

## Criticality 4

Nothing depends on it. Its loss removes one way of asking for things that has
three alternatives, and the automation itself is untouched.
