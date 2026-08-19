---
name: enumerator-engine-parity
kind: requirement
version: 1
title: Every enumerated move is accepted by the engine
summary: The enumerator and the move handlers agree exactly — the bot plays whole games choosing only enumerated moves and asserts each one lands.
status: review
owner: sergio-bershadsky
requirement-type: functional
priority: must
relations:
  uses:
    - /protocol/legal-move-api
tags:
  - rules
  - testing
---

# Every enumerated move is accepted by the engine

The enumerator and the move handlers are two implementations of the same rules
read from opposite directions: one asks "what could I do?", the other asks "may
I do this?". They are written separately, they are maintained separately, and
they can disagree in two directions, both of which are bugs.

An **over-offer** hands a client a move the engine will refuse, which surfaces as
a click that does nothing — the worst kind of failure, because
[0002-authoritative-server](srn://brass/adr/0002-authoritative-server) provides
no rejection message to explain it. An **under-offer** makes a legal move
unreachable through every surface at once: the browser, the agent and the bot
all lose it together, and nothing complains.

The 2026-07-17 audit counted nine discrepancies — one high, four medium, four low
— and its verdict puts this asymmetry squarely in the mediums: "the move handlers
are correct, but `enumerateLegalMoves` under- or over-offers moves", plus one
card-legality hole that is not an asymmetry. (The document's medium section carries
five headings against a stated count of four, so the exact tally is the audit's own
loose end, not a claim this page will restate more precisely than its source.)

## Acceptance criteria

- **AC-1** The bot validator plays complete games at two, three and four seats from fixed seeds, choosing only moves returned by `enumerateLegalMoves`.
- **AC-2** Every move the bot submits is accepted; a single `INVALID_MOVE` fails the run.
- **AC-3** Invariants hold throughout every run: no negative money, market tracks within their bounds, income level within the track, and VP monotonically non-decreasing.
- **AC-4** Every run terminates — the game reaches `ended` rather than stalling with an empty legal-move set that is not `confirmTurn`.
- **AC-5** The enumeration is never empty while it is a seat's turn; at minimum `confirmTurn` or `pass` is always available.
- **AC-6** `eligibleCards` on every enumerated move contains only cards the seat actually holds, and every one of them authorises that exact move.

## Rationale

AC-2 is the whole requirement in one line, and AC-5 is what makes it a
termination proof rather than a smoke test: an under-offer that empties the
legal set would otherwise hang the bot instead of failing it.

AC-6 exists because `eligibleCards` is consumed by three components that never
re-derive it. A card in that list that the seat does not hold would produce a
build the engine refuses, from a client that did everything right.

## Relationship to rule correctness

This requirement proves the engine agrees with **itself**. It cannot prove the
engine agrees with Brass — a rule wrong in both the enumerator and the handler
passes every run. That obligation is
[rule-correctness](srn://brass/requirement/rule-correctness), and it is checked
against the skills by audit, not by the bot.

## Out of scope

Play strength. The bot chooses arbitrarily among legal moves; its games are
proof of consistency, not of strategy.
