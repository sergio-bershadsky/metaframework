---
name: 0003-curate-at-read-never-delete
kind: adr
version: 1
title: Score trajectories at read time; never delete a game
summary: A proposed trajectory store would rank finished games with columns and filter on read, deleting only what is broken — never what is weak.
status: draft
owner: sergio-bershadsky
decision-status: proposed
date: "2026-07-17"
relations:
  uses:
    - /product/agent-play/component/mcp-server
tags:
  - mcp
  - data
---

## Context

The last phase of the MCP track proposes persisting every finished match as an
anonymised trajectory — a seed and a move list — so that an agent can study
strong play before it plays. The store is small and the games are cheap to keep,
which makes the interesting question not "how do we collect them?" but "what do
we throw away?"

The instinct is to prune. A study corpus full of weak games teaches weak play,
and an early store would be dominated by bot-validator games, which have volume
and no strategy at all.

Nothing here is built. This record exists so that the pruning instinct meets a
written answer before it meets an implementation.

## Decision

Curate on **read**, not on write. Trajectories carry `quality_score`, `source`
(`bot` / `human` / `llm`) and `valid` as columns; the read path filters by them.
An automated judging pass **writes** a score and never removes a row, so the
whole corpus can be re-scored in place once the model plays better.

The only hard delete is hygiene: games that are *invalid* — errored,
disconnected mid-match, duplicated, or not replayable. Weak is not broken.

## Consequences

- Re-judgeability is preserved. A judge that was wrong in April can be re-run in
  July over everything, which is impossible once rows are gone.
- Deleting a weak game with a weak judge bakes the judge's blind spots into the
  corpus permanently, and the judge is weakest exactly when the corpus is
  youngest. The circularity is the whole argument.
- Negative examples stay available. A study client may deliberately ask for weak
  games, which a pruning store cannot serve.
- Storage grows without bound and it does not matter at this scale — a trajectory
  is a seed and a list of move ids.
- The store needs the Postgres that
  [0006-in-memory-match-storage](srn://brass/adr/0006-in-memory-match-storage)
  declined. It is a second, independent reason to introduce it: live-match
  persistence and a durable trajectory log want the same database for different
  purposes.
- Two questions are open and are named rather than answered. **Consent** — even
  anonymised, players should be told their games are logged for study, and the
  default (opt-in or opt-out at match creation) is undecided. **Bootstrap bias** —
  seeding from bot games gives volume and weak strategy, so `source` must be a
  filter before the store is useful and not after.

## Alternatives considered

- **Delete weak games on write.** Keeps the corpus small and clean and destroys
  the evidence needed to tell whether "weak" was ever the right call.
- **Keep everything and filter nothing.** Honest and useless: an unfiltered read
  path serves bot games as exemplars.
- **Score once at write time and store only the score.** Cheaper on read, and it
  freezes a judgement made by the least capable judge the project will ever have.
- **An ELO-style rating instead of a score column.** Not rejected — it is the
  likely successor — but it needs opponent identity and a rating pool, neither of
  which exists yet. A rules-based metric (winner VP percentile within a seat-count
  bucket, margin, opponent strength) comes first, with any model-derived
  annotation added as another column.
