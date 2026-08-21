---
name: config
kind: datamodel
version: 1
title: Server configuration
summary: Two knobs, one defaulted and one optional — the whole configuration surface of the boardgame.io server, and the reason neither environment owes it anything.
status: approved
owner: sergio-bershadsky
usage: config
abstract: false
tags:
  - configuration
---

The concrete config contract of
[server](srn://brass/product/play/component/server). It is short because the
component is: match state is a `Map` in the process, per
[0006-in-memory-match-storage](srn://brass/adr/0006-in-memory-match-storage), so
there is no store to point at and no credential to hold.

## Both environments, one contract

`server` runs in [local](srn://brass/environment/local) and in
[production](srn://brass/environment/production), and a component has one
contract however many environments host it. That is what forces the discipline
below: a key required here is required in *both* places, so `required` is a
claim about the component and never about a deployment.

| Key             | local              | production                     |
| --------------- | ------------------ | ------------------------------ |
| `PORT`          | declared, no value | `"8080"`                       |
| `CLIENT_ORIGIN` | not declared       | `https://brass.bershadsky.dev` |

`PORT` is `required` and carries `default: 8000`, which the component's own page
states as fact — *`PORT` defaults to 8000 and is 8080 in production*. Required
and defaulted together means the key is always present in the resolved
configuration because the process supplies it, so it drops out of the
must-provide set and `local` declaring it with no value is complete rather than
half-written.

`CLIENT_ORIGIN` is **not** required, and that is the load-bearing call. It is
absent from `local` entirely; requiring it would print a warning against an
environment whose author was right — the origin allowlist already admits
`localhost` and `127.0.0.1` on any port, so a developer's browser connects with
nothing configured. Production sets it because boardgame.io still checks
`Origin` on the socket handshake even where client and server share one.

## `"8080"` is a string in git and an integer here

`PORT` is typed `integer` with the port range as its bounds, and production's
entry is the quoted string `"8080"`, because every `value:` written before
config contracts existed is a YAML string. The check reads a quoted scalar in
the declared type's own literal form, so both spellings satisfy the same
subschema — and a value outside `1..65535` fails whichever way it is spelled,
which is the point of typing it at all.

## No secrets

Nothing here is `writeOnly`. The per-seat credential boardgame.io mints on join
is the whole authentication story and it is minted at runtime, not configured —
there are no accounts, no sessions and no tokens beyond it, so this component
has nothing an environment could put in a vault.
