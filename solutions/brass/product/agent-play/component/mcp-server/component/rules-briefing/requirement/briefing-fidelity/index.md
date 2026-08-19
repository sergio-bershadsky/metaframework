---
name: briefing-fidelity
kind: requirement
version: 1
title: The served rules text matches this engine
summary: The rulebook, strategy and moves documents an agent reads must describe the engine it is about to play. Currently untested.
status: draft
owner: sergio-bershadsky
requirement-type: functional
priority: should
tags:
  - mcp
  - rules
---

# The served rules text matches this engine

Three static markdown documents — `rules://brass/rulebook`,
`rules://brass/strategy` and `rules://brass/moves` — are the only thing that
teaches a model how to play here. They are read once on connect and carried for
the whole game, which makes them cheap and makes them load-bearing: an agent
that misunderstands the turn structure plays badly for an hour and never finds
out why.

They must describe **this** engine, not Brass in general. The turn-commit gate
appears in no published rulebook
([0001-turn-commit-gate](srn://brass/product/play/component/rules/adr/0001-turn-commit-gate)),
and the id-selection contract appears nowhere at all
([0001-constrained-move-ids](srn://brass/product/agent-play/adr/0001-constrained-move-ids)).

## Acceptance criteria

- **AC-1** Every rule claim in the served rulebook is covered by an engine test, so a rule change that contradicts the text fails a build.
- **AC-2** The rulebook states the two-action turn, the one-action canal-era first round, and the required `confirmTurn` explicitly.
- **AC-3** The moves guide's id grammar matches the ids `get_legal_moves` actually returns, including the card-agnostic collapsing.
- **AC-4** Numbers quoted in the text — deck sizes, costs, market bounds, income steps — agree with the engine's own tables rather than being transcribed.
- **AC-5** The strategy primer is marked as advice, never as rules, so a model cannot mistake a heuristic for a legality constraint.

## Why this is a draft

This is the **third copy of the rules in the repository**. The first two — the
normative skills and the engine — are checked against each other by audit
([0004-skills-as-rule-source-of-truth](srn://brass/adr/0004-skills-as-rule-source-of-truth)).
The third is checked against nothing.

No test asserts any claim in `rules-content.ts`. A rule fixed in the engine and
not in the briefing produces an agent that plays a game that no longer exists,
and the only symptom is weak play — which is indistinguishable from a weak
model.

AC-4 points at the cheap fix: the text quotes numbers that the engine already
holds as data, so generating those fragments from the tables would close most of
the gap without a test suite.

It is a `should` rather than a `must` because a wrong briefing degrades play
without corrupting a game — the engine still refuses anything illegal, so the
blast radius is quality, not integrity.

## Out of scope

Whether the strategy advice is any *good*. AC-5 only requires that it be labelled
as advice; measuring it would require the trajectory store that
[0003-curate-at-read-never-delete](srn://brass/product/agent-play/adr/0003-curate-at-read-never-delete)
proposes and nothing has built.
