---
name: 0003-deploy-fly-vercel
kind: adr
version: 1
title: Split-origin deploy — server on Fly.io, client on Vercel
summary: The first reach-the-internet plan put the game server on Fly.io and the SPA on Vercel, with CORS between them.
status: approved
owner: sergio-bershadsky
decision-status: superseded
date: "2026-07-17"
deciders:
  - sergio-bershadsky
tags:
  - deployment
  - superseded
---

## Context

The design spec locked "deployed to the internet" as a fork of its own: an
invite link that only works on `localhost` is not a multiplayer game. What was
needed was the shortest path from a working monorepo to a URL a friend could
open, with no cluster to run and no infrastructure to learn.

Two managed platforms fit the two halves. A stateful long-lived socket server is
a Fly.io machine; a static SPA build is a Vercel deployment. Both deploy from a
repository with one command.

## Decision

The server runs on **Fly.io** — app `brass-birmingham-server`, primary region
`iad`, internal port 8080, built from `packages/server/Dockerfile`, with
`min_machines_running = 1` so a match is never served by a cold start. The
client is a **Vercel** project.

Because the two live on different origins, the client is told where the server
is by `VITE_SERVER_URL` at build time, and the server is told which origin to
trust by the `CLIENT_ORIGIN` secret at run time.

## Consequences

- Reach was achieved with no cluster, no ingress and no certificate management.
- Two origins means CORS is load-bearing rather than incidental. The whole
  security boundary of the lobby became a list of allowed origins, and a
  mis-set `CLIENT_ORIGIN` breaks the game in a way that looks like a network
  fault.
- The client image is environment-specific. `VITE_SERVER_URL` is baked at build
  time, so promoting a build between environments means rebuilding it — the
  thing a container image is supposed to make unnecessary.
- Two platforms, two dashboards, two accounts, two billing relationships, for one
  application.
- `min_machines_running = 1` is a permanent floor: because match state is in the
  process, a stopped machine is a lost game, so the platform's best feature —
  scale to zero — is unusable here.
- The two environment variables outlived the decision. `VITE_SERVER_URL` and
  `CLIENT_ORIGIN` still exist as escape hatches under the k3s deployment, where
  same-origin routing means neither is normally set.

## Alternatives considered

- **Both halves on Fly.io.** Would have removed the second platform and kept the
  split origin, since the SPA would still have been a separate app.
- **A single container serving the SPA and the API.** Same-origin from the start
  and correct in hindsight, but it needed a static file server inside the game
  server or a reverse proxy in front of both — which is precisely the ingress
  that arrived with
  [0004-k3s-helm-manual-deploy](srn://brass/product/play/adr/0004-k3s-helm-manual-deploy).
- **A self-run cluster.** Rejected at this point as disproportionate. It became
  the right answer once one already existed for other services, which is exactly
  what changed.

## Status note

The configuration is still in the tree — `fly.toml` at the repository root and
the Vercel instructions in the README — and it is excluded from the image build
context. Nothing in the repository shows that it was ever *running*; it is
recorded here as configured, not as operated, and the environment entity
[fly-vercel](srn://brass/environment/fly-vercel) is marked deprecated for that
reason.
