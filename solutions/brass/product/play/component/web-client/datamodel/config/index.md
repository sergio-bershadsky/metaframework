---
name: config
kind: datamodel
version: 1
title: Web client configuration
summary: One build-time escape hatch with a fallback the code supplies — the only key a Vite bundle reads, and the reason production declares none.
status: approved
owner: sergio-bershadsky
usage: config
abstract: false
tags:
  - configuration
---

The concrete config contract of
[web-client](srn://brass/product/play/component/web-client). One key, and it is
worth having as a contract precisely because it is one: without it, nothing in
the catalog said whether `VITE_SERVER_URL` was still a key this component reads
or a leftover from a superseded deployment.

## `VITE_SERVER_URL` is baked at build time, and the contract does not say so

A `VITE_`-prefixed variable is substituted into the bundle by Vite when the
image is built, not read from the process when it starts — which
[0003-deploy-fly-vercel](srn://brass/product/play/adr/0003-deploy-fly-vercel)
records as the reason the client image is environment-specific. The contract
still types it as an ordinary configuration key, because an instance of a config
contract is *one process environment* and the build is a process with an
environment. When the value is consumed is the component's business; that it is
a URL, and the only one, is the contract's.

## Required, defaulted, and therefore owed by nobody

```text
required     = { VITE_SERVER_URL }
defaulted    = { VITE_SERVER_URL }   → default "http://localhost:8000"
must-provide = { }
```

[local](srn://brass/environment/local) declares the key with no value and calls
it an escape hatch — *unset locally; the dev build falls back to :8000*. That
sentence is the `default` in this file, written on the other side of the join.
[production](srn://brass/environment/production) declares nothing for this
component at all, because under the k3s deployment the client and the server
share an origin and
[edge-router](srn://brass/product/play/component/edge-router) routes between
them; the variable survives as the escape hatch the superseded target needed.

Both environments are therefore complete, and they reach that from opposite
directions — one declares the key, one does not. A must-provide set that is
empty is what makes both readings correct at once, and it is why the `default`
belongs in the contract rather than in a deployment note.

## No secrets, and there could not be one

Everything this contract declares is compiled into a bundle a browser
downloads. A `writeOnly` key here would be a credential published to every
player, so the absence is a property of the component rather than an omission in
the file.
