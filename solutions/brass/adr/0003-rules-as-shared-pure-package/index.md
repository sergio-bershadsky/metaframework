---
name: 0003-rules-as-shared-pure-package
kind: adr
version: 1
title: One engine, compiled into every surface
summary: The rules live in a single framework-free TypeScript package that the server, the browser and the MCP process all import.
status: review
owner: sergio-bershadsky
decision-status: accepted
date: "2026-07-14"
deciders:
  - sergio-bershadsky
relations:
  uses:
    - /product/play/component/rules
tags:
  - foundation
  - rules
---

## Context

Three surfaces need to know Brass rules, and they need to know them for
different reasons. The server must **adjudicate** — decide what a move does. The
browser must **offer** — show which slots can be built on and which cards
authorise them. An external agent must **choose** — see the moves available and
pick one. A bot validator must **exercise** — play thousands of games and prove
the first two agree.

The classic failure of this shape is two implementations that start identical
and diverge under maintenance: the UI greys out a button the server would have
accepted, or offers one it rejects. It is a category of bug that is hard to
notice, hard to reproduce, and invariably discovered by a player mid-game.

## Decision

There is one engine, `@brass/rules`, and it is a plain TypeScript package with
no framework dependency anywhere except a single file. Board graph, tile tables,
markets, income, network reachability, deck construction, scoring and the
mutating mechanics are pure functions over plain data. The server imports it. The
browser bundles it. The MCP process imports it. The bot imports it.

The framework binding is quarantined in one file
([bgio-game](srn://brass/product/play/component/rules/component/bgio-game)),
which is the only place `boardgame.io` is imported at all.

## Consequences

- Legality is single-sourced. The client cannot disagree with the server about
  what is legal because it never forms an opinion — it filters the list the
  engine produced
  ([legal-move-api](srn://brass/protocol/legal-move-api)).
- The bot can prove the engine agrees with itself. Every enumerated move is
  submitted and must be accepted, over full 2-, 3- and 4-player games from fixed
  seeds; that is
  [enumerator-engine-parity](srn://brass/product/play/component/rules/requirement/enumerator-engine-parity),
  and it is the strongest guarantee in the project.
- The browser ships the whole rulebook. Every table, every cost, every scoring
  function is in the bundle a player downloads. That is not a leak — the rules
  are public — but it is a real size cost and it means a curious player can read
  the engine.
- `@brass/rules` is `private` and never published. Its only consumers are inside
  this workspace, which is why it is a component rather than a product: it has
  no independent lifecycle and no external release.
- Purity is a rule with teeth. A single `Date.now()`, `Math.random()` or
  network call inside the engine would break seeded replay, the bot, and the
  server's revert-on-`INVALID_MOVE` guarantee at once. Randomness comes only
  from `ctx.random`, which lives on the far side of the framework binding.

## Alternatives considered

- **Two implementations, one per surface.** The path of least resistance and the
  source of the exact bug class described above. Rejected without a trial.
- **A rules service the client calls per interaction.** Correct-by-construction
  and unusable: highlighting build targets would become a network round trip per
  hover, and the UI would need a loading state for legality.
- **Rules embedded in the boardgame.io `Game` object.** The obvious shape, and
  the one that would have made the enumerator impossible to reuse: the browser
  cannot import a `Game` without importing the framework, and the MCP process
  would then hold framework state it has no business holding. Splitting the
  binding out was worth the extra file.
