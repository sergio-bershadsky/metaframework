---
name: config
kind: datamodel
version: 1
title: MCP server configuration
summary: The one key that decides which game server an agent's session joins — required, defaultless, and the only reason local play and hosted play are the same adapter.
status: approved
owner: sergio-bershadsky
usage: config
abstract: false
tags:
  - configuration
---

The concrete config contract of
[mcp-server](srn://brass/product/agent-play/component/mcp-server). It sits
beside the three exchange models already in this bucket — `move-option`,
`state-view`, `tool-result` — and is told apart from them by `usage: config`
rather than by its name: an instance of those is a message, an instance of this
is one process environment.

## `BRASS_SERVER_URL` is required and carries no default

That is the one place this contract disagrees with its two siblings in `brass`,
which both default. `PORT` and `VITE_SERVER_URL` are declared in
[local](srn://brass/environment/local) with **no value**, because each
component's own page states the fallback its code applies. `BRASS_SERVER_URL` is
declared there **with** one — `http://localhost:8000` — and nothing anywhere
claims the adapter falls back to it. The difference between those two shapes is
the evidence, and the contract states what the catalog actually says rather than
assuming the symmetry.

The consequence is real: `local` is the only environment
[mcp-server](srn://brass/product/agent-play/component/mcp-server) declares, so
it is the only one that owes the key, and it declares it. Remove that entry and
`W_ENV_CONFIG_MISSING` names this component and this key — which is correct,
because an adapter with no server address has nothing to join.

## Why one key is the whole surface

The transport is stdio only, and
[authenticated-remote-transport](srn://brass/product/agent-play/requirement/authenticated-remote-transport)
is the gate that keeps it that way: no public MCP endpoint may exist before
authentication does. A remote transport is what would bring listen addresses,
credentials and a `writeOnly` key with it. Until that requirement is met there
is nothing here to keep secret, and the shape of this file is the visible
consequence of that decision rather than an oversight.

`BRASS_SERVER_URL` still points at the *hosted* game when an operator wants it
to — which is the useful half of remote play without the exposed half, and the
reason the key is a URL rather than a boolean.
