---
name: production
kind: environment
version: 1
title: Production
summary: The live target — a single-node k3s cluster on Hetzner serving brass.bershadsky.dev behind Traefik.
status: review
owner: sergio-bershadsky
environment-type: production
relations:
  supersedes:
    - /environment/fly-vercel
tags:
  - k3s
  - hetzner
---

The only target with real players on it. One host,
`https://brass.bershadsky.dev`, resolved through Cloudflare (proxied) to a k3s
cluster on Hetzner, namespace `brass`, ingress by Traefik, certificates by
cert-manager's `letsencrypt-prod` issuer.

It **supersedes** [fly-vercel](srn://brass/environment/fly-vercel), the split-origin
Fly.io + Vercel pair whose configuration is still in the tree (`fly.toml` at the
repository root, and the Vercel half documented in the README). Both descriptions are
kept because both sets of configuration are kept; the `supersedes` edge is what says
which of the two a reader should believe.

## One origin, split by path

Client and server share an origin, and the split is done at the ingress rather than
by CORS:

| Path         | Backend        | Why                                                      |
| ------------ | -------------- | -------------------------------------------------------- |
| `/games`     | `brass-server` | Every boardgame.io lobby REST route lives under it.      |
| `/socket.io` | `brass-server` | The transport; the `/brass` namespace is multiplexed over it. |
| `/`          | `brass-client` | nginx serving the SPA, with history fallback for `/play/`. |

The consequence is that the built client image carries no environment-specific host:
`net.ts` resolves the server as `window.location.origin` in a production build. That
is why there is exactly one image per component and no per-environment build.

The ordering is load-bearing — the two specific prefixes must precede the catch-all,
or every lobby call would be answered by the SPA's index page.

## Guarantees, stated at their real strength

- **No availability objective exists.** There is no SLO, no latency budget, no error
  budget anywhere in the repository, and this description does not invent one.
- **The server is a single writer.** `server.replicas` must stay `1` and the
  Deployment uses `strategy: Recreate`, because match state lives in the pod's
  memory. Two overlapping pods would serve games from two disjoint worlds. The
  obligation is
  [single-writer-match-state](srn://brass/product/play/component/server/requirement/single-writer-match-state).
- **Every deploy ends in-progress games.** This follows from the same fact and is
  not a bug to be fixed at this layer; moving storage to Postgres (CloudNativePG is
  already running in `cnpg-system` on this cluster) is what would lift both limits.
- **There is no staging.** Deploys go from a laptop straight here. That absence is
  recorded rather than filled with an invented entity — see
  [maintainer](srn://brass/actor/maintainer) for what stands in for a rehearsal.
- **No secret is provided by this target.** `config.yaml` has no `secret: true`
  entry because there is nothing to hold: the server has no database, no API key
  and no signing key. The one credential in the system is the per-seat token
  boardgame.io mints on join, which lives in the match, not in config.

## What is not recorded

The Hetzner datacentre is not written down anywhere in the repository — only the
node's public address. `topology.yaml` therefore declares a single region named
`hetzner` and says so in its notes rather than guessing `hel1` or `nbg1`.

## Deploying here

`helm upgrade --install brass deploy/helm/brass -n brass --wait`, run by hand with
`KUBECONFIG` pointing at the cluster. Images come from
[ci-runner](srn://brass/actor/ci-runner); the chart's `appVersion` is the default
image tag, so shipping is: bump `appVersion`, tag the repository, let CI publish,
then upgrade. Images are private and `ghcr-pull-secret` was copied into this
namespace out of band.
