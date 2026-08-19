---
name: fly-vercel
kind: environment
version: 1
title: Fly + Vercel (superseded)
summary: The superseded split-origin target — server on Fly.io, client on Vercel — still configured in-tree.
status: deprecated
owner: sergio-bershadsky
environment-type: production
tags:
  - superseded
---

# Fly + Vercel (superseded)

The original public target: the server as a Fly.io app, the client as a Vercel
deployment, two different origins talking across the internet. Superseded on
2026-07-17 by [production](srn://brass/environment/production), and kept described
because two live pieces of configuration still exist because of it.

## Configured, not proven running

The word to hold onto is **configured**. `fly.toml` at the repository root names the
app `brass-birmingham-server` in region `iad`, builds from
`packages/server/Dockerfile`, forces HTTPS, and sets `internal_port` and `PORT` to
8080 with `min_machines_running = 1`. The README documents the Vercel half:
`vercel` from `packages/client`, with `VITE_SERVER_URL` set to the Fly hostname and
`CLIENT_ORIGIN` set on the server so its CORS check accepts the client.

Nothing in the repository shows that this pair was ever live simultaneously — no
deployment record, no logs, no cutover note. So this page says the configuration
exists, and does not claim the target ever served a game.

## What it explains that would otherwise look like dead weight

Two environment variables. On the current target the client and server share one
origin, so `VITE_SERVER_URL` is never set and `CLIENT_ORIGIN` is redundant except
for the socket handshake's own `Origin` check. Both survive because this split-origin
shape is what they were built for, and both are the escape hatch if a split-origin
deployment is ever wanted again.

It also explains the shape of `net.ts`, whose three-branch resolution
(`VITE_SERVER_URL` → page origin in a production build → `localhost:8000`) has one
branch per target this solution has ever had.

## Why no component points here

No `uses` edge from any component names this environment. Two reasons, and only one
of them is bookkeeping. The first: nothing is deployed here, so a deployment
declaration would be false. The second: `fly.toml` is excluded from the current
image build context, so even the artifact that describes this target is inert.

`environment-type` stays `production` rather than being downgraded — the class
describes the guarantees the target *would* carry, and changing an environment's
type in place is a swap, not an edit. The status field is what says it is retired.
