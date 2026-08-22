---
name: brass
kind: solution
version: 2
title: Brass Online
summary: "Human-versus-human online Brass: Birmingham, with a second seat an LLM can take through MCP."
status: review
owner: sergio-bershadsky
vision: |
  One authoritative rules engine, written once in TypeScript, and every surface a
  projection of it: the server adjudicates with it, the browser narrows it into
  clickable affordances, and an external agent selects from the moves it enumerates.
  No client re-derives a rule — divergence is a defect the bot validator catches,
  not a design choice. What that buys is a game whose legality is decided in exactly
  one place, and a second consumer, an LLM taking a seat over MCP, that costs no new
  rule code at all: it reads the same enumeration the browser draws buttons from.
scope:
  in:
    - The playable online game — engine, authoritative server, browser client, and its deployment.
    - The MCP surface through which an external LLM takes one seat in a live match.
    - The rules engine both of them compile against.
  out:
    - Server-side AI opponents. An agent plays from outside, as a client.
    - Spectators, chat, accounts, ranked play, and a mobile-native client.
    - Publication rights to the physical board game, which belong to Roxley.
contacts:
  - role: architect
    handle: sergio-bershadsky
  - role: maintainer
    handle: sergio-bershadsky
tags:
  - board-game
  - multiplayer
  - boardgame-io
---

An online implementation of **Brass: Birmingham** for two to four human players, and
— since the MCP surface landed — for a mix of humans and LLM agents at the same
table. The whole catalog turns on one decision: there is exactly one rules engine,
it is a pure TypeScript package, and every other component is a projection of it.

## The shape in one paragraph

[server](srn://brass/product/play/component/server) compiles the engine and is the
only authority: it adjudicates every move, keeps the state, and broadcasts a
per-seat redaction of it. [web-client](srn://brass/product/play/component/web-client)
compiles the *same* engine, not to decide anything, but to ask it which moves are
legal and to render only those as clickable affordances.
[mcp-server](srn://brass/product/agent-play/component/mcp-server) compiles it a
third time, for the same reason, and hands the resulting list to a model as a set
of opaque ids. Three consumers, one enumerator, and a bot validator that plays
complete games to prove the enumerator and the engine never disagree.

## Two products, and why the line sits there

[play](srn://brass/product/play) is delivered to humans with a browser, at
`https://brass.bershadsky.dev`, by a hand-run `helm upgrade`. It is `active`.
[agent-play](srn://brass/product/agent-play) is delivered to an LLM host as a stdio
MCP server registration plus an agent persona; it is `incubating`, with no
reconnect and no authenticated remote transport. Different consumer, different
distribution channel, different real-world stage — and `lifecycle` is the only
field in the catalog that can carry that difference. Folding the MCP surface into
`play` would silently claim that a phase-1 adapter is as finished as the live game.

`agent-play` depends on `play` and does not absorb it. That is reuse by reference:
the MCP server is a client of the game server, of the lobby API, and of the
enumerator, and every one of those is an edge rather than a copy.

## Where the protocols live

Three of the five protocols sit at the solution root —
[lobby-api](srn://brass/protocol/lobby-api),
[game-transport](srn://brass/protocol/game-transport), and
[legal-move-api](srn://brass/protocol/legal-move-api) — because
`mcp-server` is a participant in all three and it lives under the other product.
Their nearest common ancestor is therefore the solution. The consequence is worth
stating plainly rather than hiding: `srn://brass/product/play` exposes no protocol
that is only its own. That is the honest picture of an architecture whose second
product speaks every surface the first one offers.

## Reading order

Start with [rules](srn://brass/product/play/component/rules) and its three
sub-components — that is where the substance is. Then
[server](srn://brass/product/play/component/server), which is configuration over
the framework and nothing more, and
[boardgame-io](srn://brass/product/play/component/boardgame-io), which explains why
that is enough. The browser side reads top-down from
[web-client](srn://brass/product/play/component/web-client). The deployment story
is [production](srn://brass/environment/production) plus
[edge-router](srn://brass/product/play/component/edge-router).

## Source of truth for the rules

Rule numbers are not in this catalog and are not in the code comments. They live in
the repository's `.claude/skills/brass-birmingham/` and `.claude/skills/brass-map/`
skills, triangulated from the official rulebook and several independent datasets.
The engine implements them, the requirement
[rule-correctness](srn://brass/requirement/rule-correctness) claims they are
implemented, and its acceptance criteria name the specific claims an audit checked.
Where this description states a number, it is quoting the engine, not the rulebook.

## What this catalog deliberately does not model

There is no `datastore` component. Match state is a `Map` inside the server process
— boardgame.io's `InMemory` storage — so inventing a persistence tier would
fabricate a layer that does not exist. The two facts that follow from it (one
replica, and every deploy ending live games) are properties of the server, recorded
as an ADR and a `must` requirement. Postgres is a `should` requirement in `draft`,
not a component.

Nothing here crosses `srn://brass`. The one system this solution does not own —
boardgame.io — is described locally as an `external` component, at the fidelity the
rest of the description needs.
