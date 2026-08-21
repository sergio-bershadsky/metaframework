---
name: local
kind: environment
version: 2
title: Local
summary: A developer machine — server on 8000, Vite dev server on 5173, and the MCP server spoken to over stdio.
status: review
owner: sergio-bershadsky
environment-type: local
tags:
  - development
---

One developer's machine. `pnpm dev` starts two processes with `concurrently`: the
game server on `:8000` and the Vite dev server on `:5173`. Nothing is shared, no
data is of record, and anyone may break it at any moment.

## Why this environment carries real information

It is the only place in the solution where the runtime *composition* is written
down — and it is written down twice, in two files that must agree:

- the root `dev` script, which starts server and client together;
- `packages/e2e/playwright.config.ts`, whose `webServer` block starts the same two
  processes, waits for port `8000` and URL `http://localhost:5173`, and reuses an
  already-running instance unless `CI` is set.

That second one is the reason [e2e-harness](srn://brass/product/play/component/e2e-harness)
is modelled at all. Delete it and the composition survives only as a shell script.

## What runs here that runs nowhere else

[mcp-server](srn://brass/product/agent-play/component/mcp-server) declares only this
environment, and that is not an omission. There is no hosted MCP endpoint, by
decision rather than by neglect: the transport is stdio, the process is launched by
the LLM host, and no public endpoint may exist before authentication does — see
[authenticated-remote-transport](srn://brass/product/agent-play/requirement/authenticated-remote-transport).
The agent can still play the *hosted* game from here by pointing `BRASS_SERVER_URL`
at `https://brass.bershadsky.dev`; the adapter is local, the match is not.

[e2e-harness](srn://brass/product/play/component/e2e-harness) also declares only
this environment. It is not on the runtime path anywhere.

## How the client finds the server

In a dev build `import.meta.env.PROD` is false, so `net.ts` falls back to
`http://localhost:8000`. `VITE_SERVER_URL` overrides it and exists for split-origin
setups; locally it is normally unset. The server's own allowlist is permissive here
— `Origins.LOCALHOST` plus regexes for any `localhost` or `127.0.0.1` port — which
is what lets Playwright, `vite preview` and a second browser profile all connect
without configuration.
