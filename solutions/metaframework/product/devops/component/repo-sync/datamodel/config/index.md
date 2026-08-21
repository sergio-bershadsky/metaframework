---
name: config
kind: datamodel
version: 1
title: Repo sync configuration
summary: Where the volume is, how large it may get, and the GitHub App credentials that mint fetch tokens — the configuration surface of the only component here that writes.
status: review
owner: sergio
usage: config
abstract: false
tags:
  - configuration
---

The concrete config contract of
[repo-sync](srn://metaframework/product/devops/component/repo-sync). Both
environments that host it declare every key here without a `for:`, because one
compose stack and one single-node cluster have nothing to scope against — so
this file is where the attribution actually happens. An environment-wide entry
is checked against every hosted contract that *declares* the key, which is what
turns fifteen undifferentiated key names across the two files into three
components' obligations. Two of the fifteen — `CATALOG_DIR` and
`SCHEMA_BASE_URL` — are declared by no contract here and correctly so: they are
read by [catalog-loader](srn://metaframework/product/portal/component/catalog-loader)
and [schema-registry](srn://metaframework/product/portal/component/schema-registry),
neither of which declares an environment, so nothing joins against them and a
platform key no modelled component reads is not a finding.

## What this component reads, and why it and not the router

| Key                      | Why it lands here                                                            |
| ------------------------ | ---------------------------------------------------------------------------- |
| `HUB_DATA_DIR`           | it owns the volume — mirrors and worktrees are its state and nobody else's   |
| `HUB_DATA_MAX_BYTES`     | the eviction cap, which its own page argues is correctness, not housekeeping |
| `HUB_WORKTREE_IDLE_TTL`  | the eviction timer                                                           |
| `HUB_LEASE_TTL`          | the holder-side expiry it enforces against a leaked lease                    |
| `HUB_LOCAL_REPO`         | the no-GitHub path: a host directory mounted read-only, compose only         |
| `GITHUB_APP_ID`          | it mints installation tokens, which needs the App's own identity             |
| `GITHUB_APP_PRIVATE_KEY` | the key those tokens are minted with                                         |

The sign-in half of the App — `GITHUB_APP_CLIENT_ID` and
`GITHUB_APP_CLIENT_SECRET` — is *not* here. That flow establishes who a reader
is, which is
[catalog-router](srn://metaframework/product/devops/component/catalog-router)'s
job, and
[0003-a-github-app-not-an-oauth-app](srn://metaframework/product/devops/adr/0003-a-github-app-not-an-oauth-app)
is the decision that makes the two halves separable: an installation token is
minted from the private key and grants repository access; the client credentials
are identity only and grant none. Splitting the contract along that line is what
makes the blast radius of each credential legible from the catalog.

## Two required keys

```text
required     = { HUB_DATA_DIR, HUB_DATA_MAX_BYTES }
defaulted    = { }
must-provide = { HUB_DATA_DIR, HUB_DATA_MAX_BYTES }
```

Both environments declare both, so the join is complete. Neither carries a
`default` and the reasoning is on this component's own page in both cases: a
process told the wrong volume path silently rebuilds every mirror somewhere
else, and an uncapped volume does not fail as *disk full*, it fails as every
`git fetch` breaking at once, including branches already materialised.

The three keys the two environments **disagree** about are all optional here —
`HUB_LOCAL_REPO` exists only in `compose`, because production
has no host to mount from; the two TTLs exist only in `production`. A contract
belongs to a component and not to a deployment, so a key that only one hosting
environment declares cannot be required without printing a warning against the
other. Both TTLs are typed `string` rather than a count of seconds on purpose:
this component is `lifecycle: planned` and has not fixed the grammar, and
guessing a unit here would put a convention nobody's process implements into a
contract an environment is checked against.

## The credentials, and what changed in the environments

`GITHUB_APP_PRIVATE_KEY` is `writeOnly: true`. Both `config.yaml` files
described it as a secret in prose and neither declared it as one — no
`secret: true`, no `source:` — which is exactly the gap the contract exists to
close: ENV8 can only refuse a value on an entry that admits to being secret, so
the way to commit a credential was to leave the flag off. `writeOnly` is the
second, independent statement, written here by this component's author, and the
disagreement between the two files is now an error rather than a habit. Both
environments were corrected rather than the contract relaxed.

`GITHUB_APP_ID` is not a secret and says so in both files. It is typed
`integer`: it is a numeric id, and typing it is what would catch a client id
pasted into the wrong key.
