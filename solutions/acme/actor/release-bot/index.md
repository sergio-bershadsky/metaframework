---
name: release-bot
kind: actor
version: 1
title: Release bot
summary: CI identity that applies migrations and promotes builds on behalf of team-platform.
status: approved
owner: team-platform
actor-type: service-account
goals:
  - Apply approved schema migrations to an environment on behalf of team-platform.
  - Promote a verified build from staging to production on behalf of team-platform.
relations:
  uses:
    - /environment/production
    - /environment/staging
tags:
  - ci
  - internal
---

# Release bot

The identity, not the pipeline. The pipeline runtime lives in another
repository and is not described here; `release-bot` is the credential that
runtime assumes, and the two are separate because the credential is revoked,
rotated, and audited independently of whatever holds it this quarter.

## Why it is a service account

A service account is the only actor type with no goals of its own — it borrows
them from a principal, which is why both goals above end in "on behalf of
team-platform". Keeping the type separate is what makes the non-human credential
inventory exact: everything with `actor-type: service-account` is something
security review must be able to revoke in one action.

## Scope of access

Write access to [production](srn://acme/environment/production) and
[staging](srn://acme/environment/staging), limited to schema migration and
deployment. It never reads order or payment data; the
[gdpr-erasure](srn://acme/requirement/gdpr-erasure) obligation is therefore not
in its path.
