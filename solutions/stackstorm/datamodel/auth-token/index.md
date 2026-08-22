---
name: auth-token
kind: datamodel
version: 1
title: Auth token
summary: The time-limited credential the authentication endpoint mints from a username and password, and the only thing every other surface accepts besides an API key.
status: review
owner: sergio-bershadsky
usage: both
abstract: false
tags:
  - auth
---

What a human gets in exchange for a password. The authentication endpoint reads
credentials from a request header, asks whichever backend the installation
configured, and answers with this record: an opaque token string, the user it
belongs to, and the moment it stops working.

Everything else in the platform then accepts that string — the REST API, the
event stream, the web UI and the CLI all take the same credential, which is why
the [auth-api](srn://stackstorm/protocol/auth-api@1) protocol is a separate
entity from [rest-api](srn://stackstorm/protocol/rest-api@1) even though nginx
puts them on one host.

## The other credential is not this one

An API key is a different record with a different lifetime — it does not expire,
it is created through the REST API rather than this one, and it is meant for a
system rather than a person. This catalog gives it an actor
([api-key-identity](srn://stackstorm/actor/api-key-identity)) and no datamodel of
its own: the shape a caller sees is one string in one header, and the record
behind it is administrative rather than exchanged.

## `ttl` in, `expiry` out

A caller may ask for a lifespan; the response states the resulting expiry as a
timestamp. Nothing in the record says which backend authenticated it or what it
is allowed to do — permissions are evaluated per request against the user, not
carried in the token. The `metadata` mapping is the only extension point and is
empty in the ordinary case.

## Three fields are nullable and the source says so

`user`, `token` and `expiry` are each declared as a string **or null**, which is
a real statement about the record rather than an oversight: the shape is used
both for a freshly minted token and for a record being validated or expired, and
the null branches belong to the second reading.

Read at `v3.9.0`:
[`st2common/st2common/models/api/auth.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/models/api/auth.py),
[`st2common/st2common/openapi.yaml`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/openapi.yaml).
