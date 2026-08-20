---
name: rejected-enumerated-moves
kind: metric
version: 1
title: Rejected enumerated moves
summary: How many moves the bot validator chose from the enumerator and the engine then refused, over one run of the engine suite.
status: draft
owner: sergio-bershadsky
metric-type: count
target: "0"
window: "instant"
direction: lower-is-better
relations:
  measures:
    - /product/play/component/rules/requirement/enumerator-engine-parity
    - /capability/legal-move-offering
  uses:
    - /environment/local
tags:
  - rules
  - testing
---

The enumerator and the move handlers are two readings of one rule set, and
nothing in the code makes them agree — `legalMoves.ts` mirrors the validation
inside the handlers rather than sharing it. This is the number that says whether
the mirror is true: how many times, in a run, the engine refused a move that the
enumerator had just offered.

It carries two subjects because it is one observation of both.
[enumerator-engine-parity](srn://brass/product/play/component/rules/requirement/enumerator-engine-parity)
is the commitment; [legal-move-offering](srn://brass/capability/legal-move-offering)
is the doing the commitment is about, and a non-zero reading means the solution
offered somebody a move it would not honour — in the browser, in the MCP tool
list, or both, since all three consumers read the same enumeration.

## Definition

The bot validator plays complete 2-, 3- and 4-player games from fixed seeds,
choosing only moves returned by `enumerateLegalMoves`. Count the chosen moves the
engine answers with `INVALID_MOVE`. Denominator-free on purpose: this is not a
rate. One divergence is the finding, and dividing it by every move a full sweep
plays would bury the finding under its own denominator.

Included: every move kind the enumerator returns, `confirmTurn` among them.
Excluded: nothing — there is no category of enumerated move this metric forgives,
because the requirement forgives none.

## Rationale

**Zero is the only defensible target here**, and it is not the usual
noise-floor argument. A rate driven to a noise floor makes sense when the
failures are physical — a race between two machines, a retry nobody controls.
This is two functions in one process disagreeing about a rule that is written
down, so there is no floor under it, and a target of one would assert that the
catalog tolerates a move a player could be shown and then refused.

`window: instant` is the honest fit rather than a good one. The observation is
taken over a *run*, not over a period, and v1's grammar has no token for that —
a rolling duration would claim the number is aggregated over time, which it is
not. It is read at a point in time, from the suite at one commit, and `instant`
is the only literal that says so. If per-run windows turn out to be common in
CI-observed catalogs, a token for them is an additive change to the metric
kind's window grammar; until then, saying `instant` and explaining it here is
better than picking a duration nobody measures over.

Filed on [rules](srn://brass/product/play/component/rules) rather than on
[move-enumerator](srn://brass/product/play/component/rules/component/move-enumerator),
even though the enumerator is the half most likely to be wrong. The number is
about the *relationship* between two sub-components, both of them inside this
package, and neither of them owns it alone.

## Known distortions

- **The bot only reaches positions it can reach.** Fixed seeds and a bot that
  picks from the list mean whole regions of the state space are never visited,
  so a zero reading proves the enumerator and the engine agree *on the games
  played*, not everywhere. That is the honest strength of the claim, and it is
  why [rule-correctness](srn://brass/requirement/rule-correctness) is a separate
  and stronger requirement audited by other means.
- **Parity is symmetric and this number is not.** A move the engine would accept
  that the enumerator never offers is invisible here: nobody chose it, so nothing
  was refused. That direction of divergence costs a player an option they should
  have had, and the catalog currently has no number for it.
- Nothing reports this figure today. The suite asserts it — a divergence fails a
  test rather than incrementing a counter — so the reading is available on
  demand and is not published anywhere, which is why this entity is `draft`.
