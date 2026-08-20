---
name: rules
kind: component
version: 2
title: Rules engine
summary: The pure TypeScript engine — the whole game, framework-free except for one file, compiled into three processes.
status: review
owner: sergio-bershadsky
component-type: library
lifecycle: released
relations:
  depends-on:
    - /product/play/component/boardgame-io
  implements:
    - /requirement/rule-correctness
tags:
  - engine
  - typescript
x-package: "@brass/rules"
---

# Rules engine

`@brass/rules` — a private workspace package with no build step, exported straight
from `./src/index.ts`, that three separate processes compile into themselves: the
server, the browser bundle, and the MCP adapter. That single fact is the load-bearing
one in this whole catalog. There is no rules service, no rules API, and no second
implementation to keep in step.

## What "library" costs and buys

It declares no environment, because it has no runtime of its own — the components
that embed it declare theirs, and the deployment view derives this one's reach from
them. The price is that a rule change requires a release of every embedder. With
three embedders that is acceptable only because they all ship from the same
repository at the same commit; the moment one of them were versioned independently,
the honest successor would be a service and not a package.

## Why it decomposes into three, and where the cuts are

The two seams are real and neither is a file-count convenience.

**Framework coupling.** `game.ts` is the only file in the package that imports
boardgame.io. Everything else is framework-free and unit-testable without a game
loop. The transactional semantics — an `INVALID_MOVE` return reverting every
mutation the move made — live only there, and they are the reason a move handler can
be written as straight-line mutation instead of a validate-then-apply pair. That cut
is [bgio-game](srn://brass/product/play/component/rules/component/bgio-game).

**Consumer set.** `legalMoves.ts` and `planners.ts` are consumed by three
independent components — the client's action flow, the MCP session, and the bot
validator — and by nothing else. Their exported types (`LegalMove`, `Candidate`,
`Decision`, `MoveDecisions`) are the single most important coupling in the
architecture: change one and all three consumers break at compile time, which is
exactly the property that lets the client be trusted not to re-derive legality. That
cut is [move-enumerator](srn://brass/product/play/component/rules/component/move-enumerator).

What is left — board graph, tile tables, markets, income, network reachability,
deck, scoring, and the mutating mechanics — is
[engine-core](srn://brass/product/play/component/rules/component/engine-core).

## Its public surface is its children's

This component exposes nothing of its own. `index.ts` is a barrel that re-exports
all three sub-components, so the package's surface is exactly the union of theirs
and the portal derives it. Restating those `exposes` edges here would be double
bookkeeping that drifts the first time a type moves between files.

## Verification

Two suites, and they answer different questions. The unit tests assert specific rule
claims against the skills. The **bot validator** plays complete 2-, 3- and
4-player games from fixed seeds choosing only enumerated moves, and asserts that
every one of them is accepted by the engine — enumerator↔engine parity, claimed as
[enumerator-engine-parity](srn://brass/product/play/component/rules/requirement/enumerator-engine-parity).
Rule *correctness* against the source-of-truth skills is not a test at all; it is an
adversarial multi-agent audit, and what survives it is written into
[rule-correctness](srn://brass/requirement/rule-correctness)'s acceptance criteria.
