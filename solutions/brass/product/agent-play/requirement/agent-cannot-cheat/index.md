---
name: agent-cannot-cheat
kind: requirement
version: 1
title: The MCP process never receives another player's hand
summary: Redaction happens in the engine before the agent's transport, so the seat is blind to opponents' cards by construction rather than by policy.
status: review
owner: sergio-bershadsky
requirement-type: non-functional
priority: must
relations:
  uses:
    - /environment/local
    - /protocol/game-transport
tags:
  - security
  - mcp
---

# The MCP process never receives another player's hand

A human at the table trusts the software to hide their cards. Adding a
non-human player is exactly the moment that trust is most easily lost, and the
loss would be invisible: an agent that could see every hand would simply play
very well.

The property is inherited, not implemented. The MCP server is an ordinary
boardgame.io client under
[0002-authoritative-server](srn://brass/adr/0002-authoritative-server), so the
engine's `playerView` strips other hands before anything reaches this process —
the same code path, the same placeholders, the same guarantee as for a browser.
There is no self-blinding layer to review, because there is nothing to blind.

That is the substance of
[0007-expose-the-game-over-mcp](srn://brass/adr/0007-expose-the-game-over-mcp):
a server-side bot would have needed one, and it would have been the most
security-critical untested code in the project.

## Acceptance criteria

- **AC-1** The state the MCP process receives contains only `hidden-<playerID>-<index>` placeholders for other seats, never a real card identity.
- **AC-2** The state view served to the model omits opponent hands structurally — the field is absent — and exposes `handCount` only.
- **AC-3** The process never reads raw game state; it holds a client's filtered view and has no access to the server's own `G`.
- **AC-4** The seat is flagged as AI in game state at sit-down, so every human at the table can see what they are playing against.
- **AC-5** The agent's legal moves are computed from the same redacted state the model sees, so no move can depend on information the model does not have.
- **AC-6** Adding a tool or a resource cannot widen the view: every projection is derived from the client's filtered state, and no code path reaches around it.

## Rationale

AC-5 is the criterion that would catch the subtle version of this failure. The
MCP process imports `@brass/rules` and could, in principle, enumerate moves
against a richer state than the one it serves — which would leak information
through the *shape* of the option list rather than through its contents. Both
come from one filtered state, and that is why.

AC-4 is a fairness criterion rather than a secrecy one. Being unable to cheat is
not the same as being disclosed, and both were preconditions.

## Measured where

In [local](srn://brass/environment/local), because that is the only environment
the MCP server runs in today — it is a stdio subprocess of the host, and there is
no deployed instance
([authenticated-remote-transport](srn://brass/product/agent-play/requirement/authenticated-remote-transport)
is why).

## Out of scope

What the model infers from public information. Counting cards from the activity
log, tracking the deck, and reading spend order are all things a strong human
player does, and none of them is cheating.
