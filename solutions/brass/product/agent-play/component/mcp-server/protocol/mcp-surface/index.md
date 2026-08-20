---
name: mcp-surface
kind: protocol
version: 1
title: MCP surface
summary: Six tools and four resources over stdio JSON-RPC — everything an LLM host can see of a Brass seat.
status: review
owner: sergio-bershadsky
style: request-response
participants:
  - alias: agent
    ref: /actor/llm-agent
    role: initiator
  - alias: server
    ref: /product/agent-play/component/mcp-server
    role: responder
conforms-to:
  - standard: Model Context Protocol
    version: "2025-11-25"
    url: https://modelcontextprotocol.io
relations:
  uses:
    - /environment/local
tags:
  - mcp
  - llm
---

The whole boundary between a language model and a game of Brass: six tools, four
resources, and one notification. Everything the model can do is in that list,
and the list is short on purpose — this surface is a **narrowing**, not an API.

## The one design rule

**The model never composes a move.** It reads
[move-option](srn://brass/product/agent-play/component/mcp-server/datamodel/move-option@1)
entries from `get_legal_moves` and passes one of their ids back to `make_move`.
An illegal move is not rejected at this boundary; it is *unrepresentable* at it,
because there is no argument shape in which one could be expressed. That is the
substance of
[0001-constrained-move-ids](srn://brass/product/agent-play/adr/0001-constrained-move-ids)
and of
[constrained-move-selection](srn://brass/product/agent-play/requirement/constrained-move-selection).

The ids are content-derived — `build|stafford|0|cotton`, `network|a~b,c~d`,
`loan` — and mirror the enumerator's own `agnosticKey`, so they are invariant to
which interchangeable card would pay. `make_move` re-enumerates before matching,
which turns a stale id into a clean miss (`ok: false` plus the current
`legalIds`) instead of a plausible-looking id resolving to a different move on a
board that has moved on.

## Placement

`agent` is an actor and therefore excluded from the nearest-common-ancestor
computation, leaving
[mcp-server](srn://brass/product/agent-play/component/mcp-server) as the only
component participant — so the protocol sits in that component's bucket. The
model runtime is outside our ownership boundary in every sense: we do not choose
it, version it, or run it. What we own is the shape of the hole it reaches
through.

## Failure is a value, never an exception

Every tool wraps its handler so that a thrown error becomes a
[tool-result](srn://brass/product/agent-play/component/mcp-server/datamodel/tool-result@1)
with `ok: false` and `isError: true` on the MCP envelope, carrying the message
as text. Nothing propagates as a protocol-level error. The reason is
behavioural rather than aesthetic: a model that receives a transport failure
tends to stop, while a model that receives `{ok: false, error, legalIds}` reads
the legal ids and tries again. The recovery path is only available if the
failure arrives as content.

## Reading costs nothing, so the rules are resources

Three of the four resources — `rules://brass/rulebook`,
`rules://brass/strategy`, `rules://brass/moves` — are static text served once
per connection and carried by the model for the whole game. They describe *this*
engine, including its two-action turn and the `confirmTurn` gate that no
published Brass rulebook mentions, and their fidelity is an open obligation:
[briefing-fidelity](srn://brass/product/agent-play/component/mcp-server/component/rules-briefing/requirement/briefing-fidelity)
records that they are a third, untested copy of the rules alongside the engine
and the skills.

The fourth, `match://current/state`, is live and subscribable. Every transport
update fires `sendResourceUpdated` on it, best-effort and non-fatal if nobody
subscribed. That notification is the only push in this protocol and the only
reason an agent can wake on its own turn rather than polling.

## What the transport enum cannot say

This is a stdio JSON-RPC subprocess. The `transport.kind` enum offers `http`,
`grpc`, `amqp`, `kafka`, `websocket` and `in-process`, and none of them is that.
`transport.yaml` picks `in-process` — the nearest neighbour, since the server is
launched by and lives inside the host's process tree, with no network hop and no
addressable endpoint — and records the real answer in `x-wire: stdio-jsonrpc`,
using the spec's own escape hatch. This is a gap in the framework worth raising
upstream, not a modelling error to paper over: **stdout is the transport**, which
is why every diagnostic in this server goes to stderr, and no enum value in the
current set implies that constraint.

## What is not here

No authentication, because there is no endpoint to authenticate: the host owns
the subprocess. That is only tenable while the transport stays stdio, and
[authenticated-remote-transport](srn://brass/product/agent-play/requirement/authenticated-remote-transport)
exists to make the dependency explicit — a public `/mcp` path is a
move-injection surface, and it may not exist before auth does.

No reconnection either. `leave_match` drops the socket and clears the session's
in-memory credentials without releasing the server-side seat, so a dropped
connection mid-game is a seat that nobody can re-enter
([long-running-reconnect](srn://brass/product/agent-play/requirement/long-running-reconnect)).

## Artifacts

`transport.yaml` lists the six tools as functions with their result models.
`workflows/take-a-turn.yaml` is the loop the instructions text tells the model
to run, including the stale-id branch, which is the only error path a
well-behaved agent will actually meet. There is no `states.json`: the
conversation's state is the match's state, and that machine belongs to
[game-transport](srn://brass/protocol/game-transport).
