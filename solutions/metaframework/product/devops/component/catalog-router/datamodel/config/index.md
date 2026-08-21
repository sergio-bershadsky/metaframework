---
name: config
kind: datamodel
version: 1
title: Catalog router configuration
summary: The cookie signing key and the identity half of the GitHub App — three keys, one of them the only thing this component cannot start without.
status: review
owner: sergio
usage: config
abstract: false
tags:
  - configuration
---

The concrete config contract of
[catalog-router](srn://metaframework/product/devops/component/catalog-router).
It is the sign-in surface and nothing else: the router stores no permission,
holds no volume and owns no behaviour worth calling domain logic, so its
configuration is the session and the identity flow.

| Key                        | Required | Note                                                                                             |
| -------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `HUB_SESSION_SECRET`       | yes      | secret; signs the session cookie                                                                 |
| `GITHUB_APP_CLIENT_ID`     | no       | public half of the user-to-server flow                                                           |
| `GITHUB_APP_CLIENT_SECRET` | no       | secret; identity only, and grants no repository access                                           |
| `OTEL_*`                   | no       | inherited from [telemetry-config](srn://metaframework/product/devops/datamodel/telemetry-config) |

## Why the session secret is required and the App credentials are not

`compose` states the asymmetry itself. The App is *optional* there — unset, the
GitHub path is simply unavailable and the local mount still works, which is the
case
[any-git-repository-is-a-catalog-source](srn://metaframework/product/devops/requirement/any-git-repository-is-a-catalog-source)
AC-1 exists to keep working with no App configured and no network. So a required
`GITHUB_APP_CLIENT_ID` would contradict a requirement in the same product.

`HUB_SESSION_SECRET` has no such reading. Sessions live in memory here — there
is no datastore entity — and the cookie is signed whichever path a reader takes
in, so a process with no signing key has nothing to fall back to. `compose`
declares it with the note that any value works locally; `production` declares it
as supplied at deploy time. Both declare it, so the must-provide set is
satisfied in both, and the key is the one line in this file whose absence is a
process that will not start.

Rotating it signs everyone out, which is the intended blast radius: sessions are
the only thing this product holds that a restart may lose.

## The three-layer rule, and the layer that was missing

Two keys here are `writeOnly: true`. Neither environment declared them
`secret: true` before this contract existed, so both carried a credential's name
with a non-secret's shape — and `E_ENV_SECRET_VALUE`, which is absolute about a
value on a secret entry, could not fire on an entry that never said it was one.
Adding `writeOnly` in this file makes the disagreement an error; adding
`secret: true` and a `source:` locator in both `config.yaml` files is the fix
that error asks for, and it is what was done. The value itself stays where it
has always been supposed to be: nowhere in the catalog, at any status, in any
environment.

`GITHUB_APP_CLIENT_SECRET` is marked secret even though it *grants no repository
access*, and that is deliberate. `writeOnly` is a statement about whether the
value may be read back out of the catalog, not about how much damage it does —
grading credentials by blast radius is how the small ones end up in git.
