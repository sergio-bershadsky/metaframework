---
name: rule-adjudication
kind: capability
version: 1
title: Settle every move by one set of rules
summary: Decide whether a move is legal, apply it, and say what the game now looks like to each seat — in one place, for every client at the table.
status: review
owner: sergio-bershadsky
tags:
  - rules
  - authority
---

Brass Online can be the referee. Somebody proposes a move; the solution decides
whether the rules allow it, applies it if they do, and publishes the resulting
position to every seat — each copy carrying what that seat is entitled to see and
nothing else. When the rules do not allow it, nothing happens at all: no partial
state, no half-applied mutation, and no version of the game in which the move
counted.

That last clause is the substance. The `INVALID_MOVE` return in
[bgio-game](srn://brass/product/play/component/rules/component/bgio-game) makes
the framework discard every mutation a rejected handler performed, which is why
a move handler is written as straight-line mutation with a bail-out rather than
as a validate pass followed by an apply pass. A referee that can leave the board
half-moved is not a referee.

The redaction is inside this sentence rather than beside it. "What the game now
looks like" is a per-seat question — `playerView` replaces every other seat's
hand with `hidden-<pid>-<i>` placeholders before the state leaves the process —
so hiding a hand is not a second doing performed after adjudication, it is part
of what adjudication publishes. The obligation that binds it is
[hidden-hands](srn://brass/requirement/hidden-hands), and the reason the MCP
seat gets the property for free rather than by being trusted is that it is
discharged here, at the point of transmission, and not in any interface.

Replace boardgame.io, replace TypeScript, put the engine behind a Postgres-backed
cluster instead of one process's heap: this paragraph does not change. What would
change it is the solution deciding a client may settle its own move, which is
exactly the decision
[0002-authoritative-server](srn://brass/adr/0002-authoritative-server) exists to
have taken once, in writing.

## Boundaries

- **Starts at a submitted move and ends at the broadcast.** Working out what a
  player *could* do is the neighbouring capability,
  [legal-move-offering](srn://brass/capability/legal-move-offering), and the two
  are kept apart because they are two implementations read from opposite
  directions — one asks "what could I do?", the other "may I do this?". That
  they agree is not an assumption here; it is
  [enumerator-engine-parity](srn://brass/product/play/component/rules/requirement/enumerator-engine-parity),
  a `must` with a bot playing whole games to prove it.
- **Fidelity to the printed game is an obligation, not this capability.** This
  page says the solution can settle a move by *one* set of rules. Whether that
  set is Brass: Birmingham as Roxley published it is
  [rule-correctness](srn://brass/requirement/rule-correctness), which is
  decidable against the repository skills and carries seven acceptance criteria.
  A referee can be perfectly consistent and wrong, and only the requirement can
  say so.
- **Says nothing about where the state lives.** Match state is a `Map` in the
  server process today, which costs one replica and every in-progress game on
  every deploy
  ([single-writer-match-state](srn://brass/product/play/component/server/requirement/single-writer-match-state)).
  Moving it to Postgres would not touch a word of this page — which is the test
  this kind exists to apply.
- **Three components realize it, and the parent package is deliberately not one
  of them.** [rules](srn://brass/product/play/component/rules) is a barrel whose
  public surface is its children's; listing it as a realizer alongside
  [engine-core](srn://brass/product/play/component/rules/component/engine-core)
  and
  [bgio-game](srn://brass/product/play/component/rules/component/bgio-game)
  would say the same thing twice and turn "Realized by" into a directory
  listing.
- **The browser compiles the engine and realizes nothing here.**
  [web-client](srn://brass/product/play/component/web-client) imports
  `@brass/rules` at runtime, and it uses it to know which affordances to draw,
  never to decide anything. A client's optimistic application of its own move is
  provisional until the authority's broadcast overwrites it, so no slice of this
  capability sits in the browser.

## Not this

- *Running the turn loop* is not adjudication. Whose turn it is and when a turn
  ends are engine facts, but the decision to take a turn belongs to whoever is
  sitting there — a person clicking, or a model that
  [owns its own loop](srn://brass/product/agent-play/adr/0002-agent-owns-the-loop)
  by design. The server never asks anybody for a move.
- *Enforcement across clients* is a requirement, not a second capability.
  [legal-move-enforcement](srn://brass/requirement/legal-move-enforcement) binds
  every path — browser, MCP seat, hand-crafted socket frame — and it is a
  statement that must be true, which is what makes it a requirement rather than
  a doing.
- *Keeping a hand secret in the interface* is not it either, and the difference
  is the whole security argument. The obligation is on the wire: a UI that hides
  a hand it was sent has already lost, because the client can be opened.
