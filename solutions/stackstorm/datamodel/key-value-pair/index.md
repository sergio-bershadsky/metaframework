---
name: key-value-pair
kind: datamodel
version: 1
title: Key-value pair
summary: The platform's own datastore entry — a scoped, optionally encrypted, optionally expiring string that actions and rules read by name.
status: review
owner: sergio-bershadsky
usage: both
abstract: false
tags:
  - datastore
  - secrets
---

Where an automation keeps the things it must not carry in its own source: an API
token, a hostname that changes, a counter between runs. The platform stores them
as named strings, serves them over the REST API, and substitutes them into action
parameters and rule criteria by reference.

It is the closest thing in this system to a configuration surface that the
framework's `usage: config` discipline could have described, and it is not one —
see below.

## Two booleans, and neither means what the other means

`secret` is a *request* on the way in: store this value encrypted. An
installation with no key file answers such a write by refusing — the platform
raises rather than silently storing plaintext, which is the behaviour a reviewer
wants to know before trusting the field.

`encrypted` faces both ways and is easy to misread. On a write it asserts *the
value I am sending is already ciphertext*: the platform verifies that it decrypts
with the installation's key, stores it unchanged, and forces `secret` on — the
comment in the source says why, and it is a good reason, since the alternative
would let a caller ask the platform to decrypt anything. On a read it is
computed: true when the record is secret and the value in this response was not
decrypted for the caller.

So the two are not a request and its report. They are a request, and a
sometimes-assertion-sometimes-observation. The catalog states both because
collapsing them would lose a real asymmetry of the API.

## Scope is the multi-tenancy this system has

An entry lives in a scope, and the default is the system-wide one. The other
scope that matters is per-user, which is how the same key name means different
things to different operators. The scope is part of the identity of an entry,
not an attribute of it.

## Why this is not a `usage: config` contract

The framework's config discipline describes a flat map of `^[A-Z][A-Z0-9_]*$`
keys with a schema per key, checked against what an environment provides. This
record is the opposite shape in every respect: the key set is not declared
anywhere, it changes at runtime without a deployment, the names are whatever an
operator typed, and no environment can be checked against it because nothing
enumerates what an installation is supposed to hold. A datastore is not a
configuration contract even though both are "the settings"; the discipline is
about a set of names known before the process starts.

The one place a *real* configuration contract exists in this system — a pack's
own settings — is
[pack-config-schema](srn://stackstorm/datamodel/pack-config-schema@1), and that
one breaks the discipline for entirely different reasons.

## `ttl` is input only, and the source says so

The write accepts a time-to-live and the record reports an expiry timestamp. The
model carries both, with a note in the source that the former is only ever
supplied. A reader of a stored entry sees the timestamp.

Read at `v3.9.0`:
[`st2common/st2common/models/api/keyvalue.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/models/api/keyvalue.py).
