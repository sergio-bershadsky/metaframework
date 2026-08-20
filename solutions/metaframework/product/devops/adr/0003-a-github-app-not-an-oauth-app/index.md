---
name: 0003-a-github-app-not-an-oauth-app
kind: adr
version: 1
title: A GitHub App, not an OAuth App
summary: Repository access comes from short-lived installation tokens scoped to the repositories an owner explicitly granted, rather than from a user token that carries everything the user can reach.
status: review
owner: sergio
decision-status: proposed
date: "2026-08-20"
relations:
  uses:
    - /product/devops/component/github
    - /product/devops/component/repo-sync
tags:
  - devops
  - security
  - github
---

## Context

The product needs two different things from GitHub and it is easy to conflate
them: **who is this reader** (identity), and **may this server fetch that
repository** (access). GitHub offers two integration models that answer them
differently.

An **OAuth App** issues a user token. It acts as the user, and its repository
scope is all-or-nothing across everything that user can reach — a token minted
to read one catalog can read every private repository its owner has access to,
including their employer's. It does not expire by default.

A **GitHub App** is installed by a repository owner onto **specific
repositories**, and the server authenticates as that installation with a token
that expires in an hour. Identity is handled separately, by a user-to-server
flow that says who signed in without granting the server their access.

## Decision

A GitHub App. Identity through user-to-server sign-in; repository access
through installation tokens, minted per fetch and never stored.

## Consequences

- **The blast radius of this server being compromised is what owners granted
  it, and nothing else.** That is the whole decision. A server holding user tokens
  would be a credential store worth attacking; a server holding a private key that
  mints hour-long tokens for a named list of repositories is worth much less.
- **Tokens are short-lived, so revocation is real.** Uninstalling the App stops
  access at the next mint rather than whenever somebody remembers to revoke a
  token.
- **The first run is worse, and this is the honest cost.** A reader cannot just
  sign in and paste a URL: somebody with admin rights on the repository has to
  install the App on it. For a private repository in an organisation that is a
  request to a person who may say no, and it is the single largest piece of
  friction in this product. It is named as unresolved on
  [repo-sync](srn://metaframework/product/devops/component/repo-sync).
- **There is now a private key to protect**, and it is the most sensitive thing
  this product holds — more sensitive than any individual token, because it
  mints them. It is a secret in the deployment, never in the catalog, never in a
  `config.yaml`
  ([environment.md](srn://metaframework/product/specification/component/kind-contracts)
  forbids secret values there and this is why).
- **Two auth paths instead of one.** Identity and access are separate flows with
  separate failure modes, and a reader can be validly signed in and still
  unable to see a repository. The UI has to distinguish "who are you" from
  "install the App here", and conflating them produces the worst error message
  in the product.
- **Tokens must not reach git's config or its logs.** Consequence enforced in
  [repo-sync](srn://metaframework/product/devops/component/repo-sync): credentials
  go to git through a helper on stdin, never interpolated into a remote URL,
  because a URL-embedded token is written into `.git/config` and repeated in
  every error message git produces about that remote. The redaction list in
  [telemetry](srn://metaframework/product/devops/component/telemetry) names them
  for the same reason.

## Alternatives considered

- **An OAuth App with a user token.** Materially simpler: one flow, identity and
  access together, no installation step, no private key. Rejected on scope —
  storing tokens that can read everything the reader can read, in order to
  render one catalog, is a trade nobody would agree to if it were stated out
  loud, which is why it is stated out loud here.
- **A personal access token pasted into configuration.** Fine for a single-user
  deployment and genuinely tempting for a first version. Rejected because it
  makes the product single-tenant by construction: there is one token, so there
  is one identity, so there is no "who is this reader" at all, and the
  permission model becomes "whoever can reach the URL".
- **Deploy keys per repository.** Read-only and tightly scoped, which is the
  right shape, and unusable at more than a handful of repositories: a key per
  repository, added by hand, with no listing API and no identity story.
- **No auth: public repositories only.** Worth naming because it is a coherent
  product. It removes this entire decision, the private key, both flows and most
  of the security surface — and it removes the case the product exists for,
  since a catalog worth reviewing privately is usually in a private repository.
