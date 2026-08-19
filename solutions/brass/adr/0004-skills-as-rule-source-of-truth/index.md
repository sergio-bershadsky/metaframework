---
name: 0004-skills-as-rule-source-of-truth
kind: adr
version: 1
title: The skills are the single source of every rule number
summary: brass-birmingham and brass-map are the normative rule text; the engine is an implementation of them, never the reference.
status: review
owner: sergio-bershadsky
decision-status: accepted
date: "2026-07-14"
deciders:
  - sergio-bershadsky
relations:
  uses:
    - /product/play/component/rules/component/engine-core
tags:
  - rules
  - provenance
---

# The skills are the single source of every rule number

## Context

Brass: Birmingham is a commercial board game whose rulebook is copyrighted, not
machine-readable, and — on several points that matter to an implementation —
ambiguous. Secondary sources contradict each other and each other's editions:
what the 2-player deck contains, whether a Wild Location may be played at a farm
brewery, how ties are broken, how many rounds an era runs.

An implementation that resolves each of those questions inline, in whichever
function needed the answer, ends up with the rulebook scattered across two
thousand lines of TypeScript and no way to review it against anything. Worse, it
has no way to record *why* a number is what it is, so the next reader's only
recourse is to argue with the code.

## Decision

Two repository skills, `.claude/skills/brass-birmingham` (rules plus the
industry-tile tables) and `.claude/skills/brass-map` (the board graph), are the
**normative** statement of the game. Every number in the engine — tile costs,
VP, income steps, market curves, card counts, merchant setup, edge lists — is
traceable to them, and a disagreement between the engine and a skill is a defect
in the engine by definition.

The skills themselves were triangulated: no secondary source was trusted alone,
and every rule they state is corroborated by at least two independent ones
alongside the official rulebook.

## Consequences

- Rule correctness becomes reviewable without reading code. The 2026-07-17 audit
  found nine discrepancies — one high, four medium, four low — by comparing the
  engine against the skills, and named each with a file and a line. That audit
  is only possible because the reference exists as text.
- The high-severity finding is instructive: the 2-player deck shipped six
  illegitimate Cotton/Manufacturer cards, a 46-card deck where the rules say 40,
  inflating every two-player game by roughly two rounds per era. It is fixed;
  `deckConfig` now returns zero dual cards at two seats and the totals are 40 /
  54 / 64. Nothing but a written reference would have surfaced that.
- The obligation lands on
  [rule-correctness](srn://brass/requirement/rule-correctness), whose acceptance
  criteria are drawn from the audit rather than invented.
- There are now **three** copies of the rules in this repository: the skills, the
  engine, and the rulebook text the MCP server serves to a model
  ([rules-briefing](srn://brass/product/agent-play/component/mcp-server/component/rules-briefing)).
  Only the first two are checked against each other. The third is an open gap,
  recorded as
  [briefing-fidelity](srn://brass/product/agent-play/component/mcp-server/component/rules-briefing/requirement/briefing-fidelity).
- Skills are prose, so nothing mechanically enforces the link. A number can drift
  and no build will fail; only tests and audits catch it.

## Alternatives considered

- **The rulebook PDF as the reference.** It is the real authority and it is
  unusable as one: not searchable in a review, not diffable, not quotable in a
  test name, and silent on the ambiguities that actually cost implementation
  time.
- **The engine as its own reference.** Circular. "Correct" then means "consistent
  with itself", which is exactly what the bot validator already proves and
  exactly what the audit needed to go beyond.
- **A machine-readable rules DSL.** Attractive, and the board graph
  (`board-graph.yaml`) is already half of one. Rejected for the rest: the
  interesting rules are conditional and contextual — sourcing by network
  distance, overbuild depletion, merchant re-evaluation per tile — and a DSL
  expressive enough for them would be a second programming language to maintain.
