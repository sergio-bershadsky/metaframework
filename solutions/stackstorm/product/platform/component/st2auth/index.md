---
name: st2auth
kind: component
version: 1
title: st2auth
summary: The authentication endpoint — trades a credential for a time-limited token, with the backend that checks the credential left pluggable.
status: review
owner: sergio-bershadsky
component-type: service
lifecycle: released
criticality: 2
relations:
  uses:
    - /environment/single-box
    - /environment/ha-cluster
    - /environment/dev-compose
  depends-on:
    - ../st2common
    - ../mongodb
tags:
  - auth
  - http
x-runtime: python
x-listen-port: 9100
---

A small service with one job: prove who is calling, and issue something the rest
of the platform will accept instead. It listens on the port recorded above, read
from the `[auth]` section of the sample configuration on `master`.

## Why it is its own process and not a module of the API

Two reasons the code makes plain. It runs on a different port with a different
exposure — a deployment may put authentication somewhere the API is not — and
its backend is a plugin chosen at configuration time, so the credential-checking
code is not in this repository at all in the common case. Keeping it separate
keeps the API free of any opinion about how a person is proved.

## The boundary this component does not describe

The pluggable backends. The default in the sample configuration is a flat file;
the two backends most installations actually use ship as separate distributions
that this survey did not open. So this page describes the *shape* of
authentication — credential in, token out, backend swapped by configuration —
and deliberately not the mechanism of any particular backend.

What it does describe fully is the other half of identity:
[api-key-identity](srn://stackstorm/actor/api-key-identity), the long-lived
non-human credential, which needs no backend because the platform issues and
stores it itself.

## Why it has no bus dependency

Alone among the processes here, this one publishes nothing. It writes tokens and
keys to the document store and answers HTTP; there is no downstream worker that
needs to know a login happened. That absence is the reason its `depends-on` list
is shorter than every sibling's, and it is worth stating explicitly because a
missing edge otherwise reads as an omission.
