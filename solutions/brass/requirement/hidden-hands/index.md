---
name: hidden-hands
kind: requirement
version: 1
title: An opponent's hand never leaves the server
summary: No client, human or agent, ever receives another seat's card identities — only how many cards it holds.
status: review
owner: sergio-bershadsky
requirement-type: non-functional
priority: must
relations:
  uses:
    - /environment/production
    - /protocol/game-transport
tags:
  - security
  - privacy
---

Brass is a hidden-information game, and the hidden information is the hand. A
player who can see what their opponents hold knows which cities they can build
in, which industries they can develop, and whether they can afford the sale they
are threatening — which is most of the game's tension.

The obligation is on the wire, not on the interface. Hiding a hand in the UI
while shipping it to the browser is not a property, it is a decoration; anyone
can open a developer console.

Redaction happens in `playerView` inside the engine, before any state is handed
to the transport, and it applies identically to every seat regardless of what
kind of client is on the other end — which is what makes
[agent-cannot-cheat](srn://brass/product/agent-play/requirement/agent-cannot-cheat)
a consequence of this requirement rather than a second implementation of it.

## Acceptance criteria

- **AC-1** Every broadcast a seat receives contains, for each other seat, placeholder card entries of the form `hidden-<playerID>-<index>` and no real card identity.
- **AC-2** Hand *length* remains observable for every seat, because the number of cards a player holds is public in the physical game.
- **AC-3** Deck count is observable; deck contents are not, and no client receives the ordered draw pile.
- **AC-4** The redaction is applied by the engine before serialization, so it holds for the initial sync, every state update, and any future transport.
- **AC-5** The MCP state view omits opponent hands structurally — the field is absent, not blanked — so a leak would be a shape change and not a value change.
- **AC-6** A client that reconstructs another seat's hand from the public log can do so only to the extent a human at the table could, from cards that have already been played.

## Rationale

AC-5 is a deliberately different shape from AC-1. The engine gives every client
placeholder cards; the MCP view then drops the field entirely, so an accidental
leak in that projection would fail a schema check rather than pass one with the
wrong contents. Two mechanisms in series, failing differently.

AC-6 draws the line at what the game itself reveals. The activity log is public
by design and states what each player did; that is information a human at the
table also has.

## Out of scope

Traffic analysis and timing. A player who watches how long an opponent takes to
choose learns something, and nothing here prevents it.
