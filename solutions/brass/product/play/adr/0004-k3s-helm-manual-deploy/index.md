---
name: 0004-k3s-helm-manual-deploy
kind: adr
version: 1
title: One origin on self-run k3s, promoted by hand
summary: Client and server share an origin behind a Traefik ingress on a personal k3s cluster; CI builds images and never touches the cluster.
status: approved
owner: sergio-bershadsky
decision-status: accepted
date: "2026-07-17"
deciders:
  - sergio-bershadsky
relations:
  supersedes:
    - /product/play/adr/0003-deploy-fly-vercel
  uses:
    - /environment/production
tags:
  - deployment
  - operations
---

# One origin on self-run k3s, promoted by hand

## Context

The split-origin deployment worked and was awkward for a reason that had nothing
to do with either platform: two origins force CORS to be part of the
application, and a build-time `VITE_SERVER_URL` makes the client image
environment-specific. Meanwhile a personal single-node k3s cluster already
existed, already ran Traefik, cert-manager with a `letsencrypt-prod` issuer, and
Cloudflare-proxied DNS for a sibling service.

The remaining question was who pushes the button. CI could hold a kubeconfig and
deploy on merge, or a human could deploy from a machine that already has one.

## Decision

Both halves run on the k3s cluster behind **one host**,
`brass.bershadsky.dev`, split by path at the Traefik ingress: `/games` and
`/socket.io` reach the server, everything else reaches the nginx pod serving the
SPA. The client resolves the server at runtime as `window.location.origin`, so
the image carries no environment-specific host.

Promotion is **manual**. CI runs typecheck and unit tests, then builds and
pushes `linux/amd64` images to GHCR; it never contacts the cluster. A release is
a `helm upgrade` run by a person with `KUBECONFIG` pointed at the cluster.

## Consequences

- CORS disappears from the application. Same origin, no preflight, no
  `CLIENT_ORIGIN` in normal operation — the two variables remain only as escape
  hatches.
- One client image is promotable anywhere, because it learns its server from the
  address bar.
- The ingress ordering is now load-bearing: the two specific prefixes must
  precede the catch-all, and `/socket.io` — not `/brass` — is what has to reach
  the server, because the socket.io namespace is multiplexed over that fixed
  HTTP path. Get that wrong and the lobby works while the game does not.
- The admin kubeconfig stays off GitHub. That is the whole point of manual
  promotion, and it is worth the cost: a compromised CI token cannot reach the
  cluster.
- **Deployment is not automatic, so it is not frequent, and it is destructive.**
  Combined with
  [0006-in-memory-match-storage](srn://brass/adr/0006-in-memory-match-storage),
  every `helm upgrade` ends live games — which is why a release is scheduled
  rather than triggered.
- The bus factor is one. There is a single operator, a single kubeconfig, and a
  single node; the runbook exists so that the procedure survives the operator
  forgetting it, not so that someone else can run it.
- Images are private, so the release namespace needs a pull secret copied in out
  of band. That is a step no manifest performs and no test catches.

## Alternatives considered

- **GitOps with Argo CD or Flux.** The correct shape for a team, and it inverts
  the credential problem — the cluster pulls instead of CI pushing — so it is the
  natural successor once anything else needs deploying. Not taken now because
  the reconciler is more machinery than the application.
- **CI holds a kubeconfig and deploys on tag.** One less manual step and one more
  secret that can reach production. Declined explicitly.
- **A managed Kubernetes service.** Removes the node from the operator's
  responsibility and adds a bill for a game played by four people.
- **Stay on Fly.io and add a proxy for same-origin.** Would have fixed the CORS
  half without a cluster. It lost to the cluster already existing and to
  `min_machines_running = 1` making the platform's cost model a poor fit for a
  process that must never stop.
