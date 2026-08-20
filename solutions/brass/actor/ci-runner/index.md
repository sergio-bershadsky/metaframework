---
name: ci-runner
kind: actor
version: 1
title: CI runner
summary: GitHub Actions identity that typechecks and tests every change, then publishes amd64 images to GHCR.
status: review
owner: sergio-bershadsky
actor-type: system
goals:
  - Typecheck and run the engine and client suites on every pull request.
  - Publish amd64 images to GHCR on main and on version tags, never on a pull request.
  - Hold no credential that can reach the production cluster.
relations:
  uses:
    - /product/play/component/rules
    - /product/play/component/server
    - /product/play/component/web-client
tags:
  - ci
---

The `build` workflow's runtime. It is modelled as an actor rather than an
environment on purpose: a pipeline is not a deployment target of this solution's
components. Nothing *runs* in CI in the sense
[production](srn://brass/environment/production) means; things are *built* there.

## What it actually does

Two jobs. `test` runs `pnpm -r typecheck`, the engine suite
(`pnpm --filter @brass/rules test`) and the client suite. `images` runs only after
`test` passes and only when the event is not a `pull_request`, building
`brass-server` and `brass-client` for `linux/amd64` — the k3s node's architecture —
and pushing short-sha, tag, semver and `latest` tags to GHCR.

Two things it does **not** run, and both matter to how much the green tick is worth:
the Playwright suite (`pnpm e2e` appears in no workflow) and the MCP package's
typecheck is only covered by the recursive `-r` sweep.

The three `uses` edges are the three packages the gates actually name —
[rules](srn://brass/product/play/component/rules) (unit suite),
[web-client](srn://brass/product/play/component/web-client) (component suite, and one
of the two published images) and
[server](srn://brass/product/play/component/server) (the other image). Every other
package reaches this actor only through `pnpm -r typecheck`.

## Why it holds no cluster credential

The publishing job is gated off `pull_request` so a fork PR can never execute with a
`packages: write` token, and no untrusted event input — titles, bodies, commit
messages, `head_ref` — is interpolated into any step. Beyond that, the deploy step
simply is not here: promotion is
[maintainer](srn://brass/actor/maintainer) work on a trusted machine. The runner's
third goal is therefore a security property stated as an obligation, and the
smallest possible statement of it is that this actor's credential inventory is one
`GITHUB_TOKEN` scoped to packages.

One caveat, because the repository contains the beginnings of the opposite.
`deploy/ci-rbac.yaml` declares a `brass-deployer` ServiceAccount, a namespace-scoped
Role over Deployments, Services, Ingresses, Secrets and ConfigMaps, a RoleBinding and
a long-lived token Secret — a CD identity confined to the `brass` namespace. Nothing
in `.github/workflows/` authenticates as it, and the file's own comment says it is
applied by hand for a CD job that does not exist yet. So the goal above is true of
what runs today and is not true of what the repository is prepared for; if a deploy
step is ever added, this actor's credential inventory grows by one and this page is
the first thing that has to change.

## Why `system` and not `service-account`

A service account is an *identity* something assumes; this is the *runtime*. The
distinction earns its keep here because the identity the runner assumes —
`GITHUB_TOKEN` — is issued per job by GitHub and is not ours to revoke, rotate or
inventory. Modelling it as a separate service-account actor would create an entry in
the credential inventory that nobody in this solution can act on.
