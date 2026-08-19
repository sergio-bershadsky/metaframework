---
name: 0006-in-memory-match-storage
kind: adr
version: 1
title: Match state lives in the process, and deploys end games
summary: We accept boardgame.io's in-memory store, which pins the server to one replica and makes every release destructive.
status: review
owner: sergio-bershadsky
decision-status: accepted
date: "2026-07-17"
deciders:
  - sergio-bershadsky
relations:
  uses:
    - /product/play/component/server
    - /environment/production
tags:
  - persistence
  - operations
---

# Match state lives in the process, and deploys end games

## Context

boardgame.io ships an `InMemory` store as its default and adapters for Postgres,
Mongo and others. At the point of deployment the game was live, played by a
handful of friends in scheduled sessions, on a single-node k3s cluster that
already runs a CloudNativePG operator — so Postgres was available, not merely
possible.

The question was whether to take it. Adding a database means an adapter, a
schema, a migration story, a connection secret, a backup policy, and a second
thing that can be down while the game is up.

## Decision

We keep the in-memory store. Match state lives in the server pod's heap and
nowhere else.

The decision is not free, and the costs are written into the deployment rather
than left implicit: `server.replicas` is documented as **must stay 1**, the
Deployment uses `strategy: Recreate` rather than a rolling update, and the
runbook states plainly that every deploy ends in-progress games. Those three
facts are one fact, and they are captured as
[single-writer-match-state](srn://brass/product/play/component/server/requirement/single-writer-match-state).

## Consequences

- Horizontal scaling is not slow, it is **incorrect**. A second replica shards
  matches across pods at random and splits the socket clients of one game between
  two authorities. This is the rare case where an autoscaler would not degrade
  the service but corrupt it.
- `Recreate` means a deploy has a gap with no server at all, which is preferable
  to a rolling update where two pods briefly hold different halves of the same
  match.
- A crash loses every live game. So does an OOM kill, so does a node drain, so
  does a `helm upgrade`. Releases are therefore scheduled around play, which is
  only tolerable because the operator and the players are the same small group.
- The optimistic-concurrency scheme on
  [game-transport](srn://brass/protocol/game-transport) — a `stateID` plus a
  per-match queue — is *correct only under this decision*. It has no notion of a
  competing writer, so a second process holding the same match would break
  concurrency control, not just distribution.
- `match-survives-refresh` holds for a page reload, because the credential is in
  `localStorage` and the server still has the match. It does not hold across a
  server restart, and
  [match-survives-refresh](srn://brass/product/play/requirement/match-survives-refresh)
  says so explicitly rather than leaving the reader to infer the boundary.
- Moving to Postgres lifts all of the above at once, which is why it is recorded
  as a `should` rather than a wish: the cluster already runs the operator, so the
  remaining work is an adapter and a secret.

## Alternatives considered

- **CloudNativePG from day one.** The right answer for a product with users, and
  premature for one with players. It would have added a schema and a failure mode
  before the first real game was ever finished.
- **Redis with an in-memory fallback.** Cheaper to wire than Postgres and it
  solves the wrong half: it would survive a restart but the fallback path would
  make the single-writer invariant conditional on configuration, which is exactly
  the kind of rule that is true in staging and false in production.
- **Sticky sessions at the ingress, several replicas.** Would keep one player's
  socket on one pod and does nothing at all for a *match*, whose players arrive
  from different browsers. It looks like a fix and is not one.
- **Accept the loss and hide it.** Considered and rejected on presentation
  grounds: the runbook says "every deploy ends in-progress games" in those words,
  because an operator who does not know that will find out during a game.
