---
name: rule-correctness
kind: requirement
version: 1
title: "The engine plays Brass: Birmingham as the skills specify"
summary: Every rule the engine implements matches the normative skills, and every claim about a rule is backed by a test.
status: review
owner: sergio-bershadsky
requirement-type: functional
priority: must
relations:
  uses:
    - /product/play/component/rules/component/engine-core
tags:
  - rules
  - correctness
---

# The engine plays Brass: Birmingham as the skills specify

The obligation is the whole reason the project exists: a player who knows the
physical game must be able to sit down and find that nothing has changed except
the turn-commit gate, which is a deliberate, documented deviation
([0001-turn-commit-gate](srn://brass/product/play/component/rules/adr/0001-turn-commit-gate)).

"Correct" means agreeing with the two repository skills — `brass-birmingham` and
`brass-map` — which are the normative statement of the rules by
[0004-skills-as-rule-source-of-truth](srn://brass/adr/0004-skills-as-rule-source-of-truth).
A disagreement between the engine and a skill is an engine defect by definition.
This is a different and stronger claim than
[enumerator-engine-parity](srn://brass/product/play/component/rules/requirement/enumerator-engine-parity),
which only proves the engine agrees with *itself*.

## Acceptance criteria

- **AC-1** The draw deck totals 40 cards at two seats, 54 at three, and 64 at four.
  - **Given** the audit of 2026-07-17 found a 46-card two-player deck carrying six
    illegitimate Cotton/Manufacturer cards
  - **When** `deckConfig` is read for each seat count
  - **Then** the dual Cotton/Manufacturer count is 0 / 6 / 8 and the totals hold
- **AC-2** A Wild Location card cannot be played to build at either farm brewery; only a Brewery or Wild Industry card can.
- **AC-3** Both wild piles start with four cards each, at every seat count.
- **AC-4** Victory is decided by VP, then by income level, then by money, and a tie after all three is a shared victory listing every tied seat.
- **AC-5** Coal is sourced from the nearest connected mine by network distance and only from the market when no connected mine has a cube; iron is sourced from any works.
- **AC-6** Every rule claim in this list, and each of the nine findings of the 2026-07-17 audit, is covered by a named engine test.
- **AC-7** The single-industry-slot restriction is enforced on build, and a test asserts it directly rather than inferring it from an import.
  - Verified. `mechanics.ts` exports `singleSpaceBlocks`, which blocks a mixed slot
    while an empty single-industry slot for the same industry exists in the same city,
    and `test/singleSpacePriority.test.ts` asserts it on both sides: a
    `(enumerator)` block for what is offered and a `(build move handler)` block whose
    cases reject a coal build on the mixed slot and accept it on the single slot.
    Overbuilding an already-occupied mixed slot stays legal, and that exemption has
    its own case.

## Rationale

AC-1 is here because it is the one rule error that changed how the game *felt*
rather than how a corner case resolved: six extra cards ran every two-player era
roughly two rounds long and granted build authorizations the real deck never
provides. It is fixed; the criterion stays so that a regression is a test
failure rather than a suspicion.

AC-7 was first written as a doubt on purpose — the original survey inferred the fix
from an import of `singleSpaceBlocks` and a commit subject without reading the
implementation, and a catalog that records an inference as a fact is worse than one
that records the inference. The implementation and its tests have since been read,
so the criterion now states what they do. The shape of that history is worth keeping:
an unverified criterion is written as unverified until someone verifies it, and then
it changes.

## Out of scope

Balance, pacing and strategic quality. This requirement is about fidelity to a
published rule set, not about whether the resulting game is good.
