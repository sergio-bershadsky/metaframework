---
name: edge-router
kind: component
version: 2
title: Edge router
summary: The Traefik ingress that puts client and server behind one origin, split by path prefix.
status: review
owner: sergio-bershadsky
component-type: gateway
lifecycle: released
relations:
  uses:
    - /environment/production
  depends-on:
    - /product/play/component/server
    - /product/play/component/web-client
tags:
  - ingress
  - traefik
---

# Edge router

One Kubernetes `Ingress` object, `ingressClassName: traefik`, host
`brass.bershadsky.dev`, TLS from cert-manager's `letsencrypt-prod` issuer. It owns
no behaviour — it fronts two components and decides which one answers a request.

## The one decision it makes

```
/games      → brass-server    boardgame.io lobby REST
/socket.io  → brass-server    socket.io transport (the /brass namespace rides on it)
/           → brass-client    the SPA, with history fallback for /play/<matchID>
```

Order matters: the two specific prefixes must precede the catch-all, or every lobby
call would be answered by the SPA's `index.html` with a 200 and the wrong content
type — the worst failure shape available, because nothing would look broken until a
JSON parse failed.

The `/socket.io` entry deserves a note. The client calls `io(server + gameName)`,
which socket.io splits into an origin plus a `/brass` *namespace*; the namespace is
multiplexed over the fixed `/socket.io` HTTP path. So the path that actually has to
reach the server is `/socket.io`, and routing `/brass` would accomplish nothing.

## Why this component exists at all

To make client and server share an origin. That single property removes CORS from the
system, and it lets the client image carry no environment-specific host: `net.ts`
resolves the server as `window.location.origin` in a production build, so one image
works anywhere this ingress shape is reproduced.

Read the other way, this component is the reason `VITE_SERVER_URL` and
`CLIENT_ORIGIN` look vestigial. They are not — they are what the superseded
[fly-vercel](srn://brass/environment/fly-vercel) split-origin target needed, and they
remain the escape hatch if a split origin is ever wanted again.

## Environment-specific by construction

This is the one component whose existence depends on where it runs. It declares
[production](srn://brass/environment/production) and nothing else: locally there is
no ingress, the two dev servers sit on different ports, and the client reaches the
server by the `localhost:8000` fallback. Under the superseded target there was no
such node either — two origins, two providers, and CORS in place of a path split.
