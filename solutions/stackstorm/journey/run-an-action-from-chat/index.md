---
name: run-an-action-from-chat
kind: journey
version: 1
title: Run an action from chat
summary: A phrase in a chat room becomes an execution and an answer comes back — four steps, two of them taken by a credential rather than by the person who typed.
status: review
owner: sergio-bershadsky
actor: /actor/chat-user
relations:
  uses:
    - /environment/single-box
tags:
  - chatops
  - cross-product
---

The shortest path in this catalog and the one with the most interesting identity
story. Somebody who has never seen this platform's web interface types a phrase
into a room; a bridge matches it against the aliases installed packs registered,
starts an execution, and posts the answer back where they can see it.

## Outcome

The person gets an answer in the room, without an account, a token, or any idea
that a message bus was involved.

## Two steps taken by a credential

`steps[1]` and `steps[2]` name
[api-key-identity](srn://stackstorm/actor/api-key-identity) rather than the
person, and that is not a modelling flourish: the bridge holds its own key, so
every execution started from chat is attributed to the bridge. Which human asked
is a fact the chat platform holds and this platform does not.

Writing the person as the actor of those steps would have made the journey read
better and would have been false in the one way that matters — an operator
auditing these runs afterwards finds the bridge's name on all of them.

## The return leg, and why `protocol: none` is the least wrong of three states

`steps[3]` crosses back from the platform into
[operator-surfaces](srn://stackstorm/product/operator-surfaces), and the field
that says how has three states: an SRN, the literal `none`, or absence.

- An SRN would have to name the chat provider's own protocol, which this solution
  does not own, does not describe, and has scoped out.
- Absence means "an integration nobody wrote down", which would be reported as a
  finding and would send a reviewer looking for a protocol entity that should
  not exist.
- `none` means "the actor carries it themselves", which is not quite true either:
  a robot posts a message.

The catalog writes `none` and says here what it is standing in for. The missing
fourth state is *described elsewhere, deliberately out of scope* — and the same
gap would appear in any catalog whose solution ends at somebody else's platform.

## How the answer actually gets back

Verified rather than assumed: the bridge holds an open connection to the
[event-stream](srn://stackstorm/protocol/event-stream@1) and listens for one
fixed event name, built from the announcement exchange and the route `chatops`.
So `steps[2]` is a subscription that was opened long before this conversation
started, and the "reply" is a broadcast the bridge happened to be listening for.

That is why this journey has no reply step from the API: there is none. The
request-response half ends at `steps[1]`.

## Out of scope

Who may run what. Chat aliases are matched against installed content and the
platform's own permission model is evaluated against the bridge's identity, not
the person's; an installation that cares uses the chat platform's own room
membership as the boundary.
