---
name: credential
kind: datamodel
version: 1
title: Credential
summary: A verifier an account authenticates with, held by locator — no secret material, at any status, in any branch.
status: approved
owner: team-identity
usage: storage
abstract: false
tags:
  - identity
  - security
---

What [authentication](srn://acme/product/identity/component/authentication) checks a
proof against. One record per verifier, so an account with a password and a
security key has two, distinguished by `factor` rather than by which one came
first.

## `usage: storage`, and why that is the interesting field

This is the only datamodel in the identity product that never crosses a boundary.
Nothing returns a credential — not the administrative surface, not
[authorization-check](srn://acme/product/identity/protocol/authorization-check), not an
export. Marking it `storage` says that in the one place a reader will look, and
makes any `transport.yaml` in this catalog that names it a contradiction the
portal can show rather than a review comment somebody has to notice.

## The locator rule

`secret-locator` points into the secret store; the hash, the public key, the TOTP
seed are behind it and are not described in this catalog at any fidelity. That is
the same rule [card-payment](srn://acme/product/shop/datamodel/card-payment@1) applies to
primary account numbers, and for the same reason: what is not in the catalog
cannot be leaked by it, and a schema that has a field for a secret eventually
gets an instance with a secret in it.

The locator is also what makes the store swappable without a migration of this
model. Moving from one secret backend to another rewrites locators; it does not
change the shape of a credential.

## Why this is not a discriminated union

It is the obvious candidate — four methods, each with different material — and it
would be wrong. The per-method material is not in this schema at all; it is
behind the locator. Branching would produce four variants that differ in nothing,
which is worse than no union: it advertises a distinction the data does not
carry, and the first reader to trust it writes a `switch` whose arms are
identical.

Contrast [permission](srn://acme/product/identity/datamodel/permission@2), where the
branches genuinely carry different properties — `order-range` for orders,
`account-prefix` for ledger legs — and the union is what stops those fields being
a bag of mutually-exclusive optionals. A union earns its place when the branches
differ in shape, not when they differ in name.

## Rotation is a new record

`rotated-at` is set on the replacement, never on the thing replaced, and a
password change creates a row rather than updating one. That is what lets
[authentication](srn://acme/product/identity/component/authentication) answer "was this
credential in force when that session was issued", which is the question that
turns a suspected compromise into a bounded list of sessions to revoke — see
[session-revocation](srn://acme/product/identity/requirement/session-revocation).

The record deliberately does not compose
[auditable](srn://acme/datamodel/auditable@1). A credential is never edited, so
"who changed this and why" has no referent; the human decision that matters — an
administrator forcing a reset — is a change to the
[account](srn://acme/product/identity/datamodel/account@1), and that is where the audit
fields sit.
