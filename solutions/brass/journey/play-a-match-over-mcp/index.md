---
name: play-a-match-over-mcp
kind: journey
version: 2
title: Play a match over MCP
summary: A model's path from reading this engine's rulebook to leaving a seat it cannot release — nine steps and six crossings of the one product boundary.
status: review
owner: sergio-bershadsky
actor: /actor/llm-agent
relations:
  uses:
    - /environment/local
tags:
  - llm
  - cross-product
---

The path [agent-play](srn://brass/product/agent-play) exists for, and the only
one in this catalog that leaves a product. A model connects to a stdio adapter,
reads what kind of Brass this is, takes a free seat in a live match, and then
alternates — read the state here, read the moves there, submit them here, watch
the authority apply them there — until it stops.

Every one of those alternations is a product boundary crossing, and every one is
documented. That is not a courtesy: the three protocols the crossings name sit at
the **solution root** rather than inside `play` precisely because
[mcp-server](srn://brass/product/agent-play/component/mcp-server) is a
participant in all three, and this path is what that placement looks like when
somebody walks it.

## Outcome

The model has taken its turns in a real match under the same authority, the same
credential mechanism and the same redaction as the humans at the table, and has
left.

It is a deliberately weaker outcome than
[play-a-match-in-a-browser](srn://brass/journey/play-a-match-in-a-browser)'s. A
browser path ends at a decided winner; this one ends when the model stops,
because nothing in the solution guarantees it can still be there an hour later —
see below.

## Preconditions

The MCP server is registered in a host's configuration and launched as a
subprocess. There is no remote transport and there will not be one before
authentication exists
([authenticated-remote-transport](srn://brass/product/agent-play/requirement/authenticated-remote-transport)),
so `steps[0]` presupposes a process on the same machine as the model's host —
though `BRASS_SERVER_URL` lets that local process join the hosted game.

## Six crossings, all named, and what each one costs

`steps[2]`, `steps[5]` and `steps[7]` leave `agent-play` for `play`;
`steps[4]`, `steps[6]` and `steps[8]` come back. The alternation is not an
artifact of how the path is written — it is the adapter's shape. The model can
only speak
[mcp-surface](srn://brass/product/agent-play/component/mcp-server/protocol/mcp-surface),
and everything it wants is on the other side of the boundary, so every request it
makes is a hop out and a hop back.

Reading the three protocols named at those crossings together is the fastest way
to see the solution's central claim. `steps[2]` uses
[lobby-api](srn://brass/protocol/lobby-api) — the same four HTTP calls a browser
makes. `steps[5]` uses [legal-move-api](srn://brass/protocol/legal-move-api) —
the same enumeration
[action-flow](srn://brass/product/play/component/web-client/component/action-flow)
narrows into clicks. `steps[7]` uses
[game-transport](srn://brass/protocol/game-transport) — the same socket
vocabulary, from a boardgame.io `Client` of the identical class the browser
instantiates. Nothing on the server distinguishes this walker from a human one.

## The step that is not the model's

`steps[3]` is the sit-down, and it is the only step in this path where anything
marks the seat as an agent at all: the move carries `ai=true`, which is the whole
implementation of the bot badge. The transport carries no other marker, which is
why [agent-cannot-cheat](srn://brass/product/agent-play/requirement/agent-cannot-cheat)
had to be structural — there is nothing here for a policy to attach to.

## The ending is the honest part

`steps[8]` is `leave_match`, and it is the least safe step in the whole solution.
The socket closes, the session forgets its credentials, and **the seat stays
claimed on the server**. There is no path back into it: no reconnect, and no
release. A dropped agent has the same effect, which is why
[long-running-reconnect](srn://brass/product/agent-play/requirement/long-running-reconnect)
is a `must` in `draft` rather than a backlog item, and why this path is written
to end at a departure rather than at a win.

## Out of scope

The turn loop's repetition. `steps[4]` through `steps[7]` are one pass; a real
match is dozens, and the loop is what the `take-a-turn` workflow on
[mcp-surface](srn://brass/product/agent-play/component/mcp-server/protocol/mcp-surface)
describes with the fragment grammar a journey does not have. Nothing here shows
the stale-id retry either — an id that no longer matches returns `ok:false` with
the current `legalIds`, which is a second outcome for that step and therefore
belongs in the protocol rather than in this list.
