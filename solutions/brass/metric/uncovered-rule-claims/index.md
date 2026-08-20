---
name: uncovered-rule-claims
kind: metric
version: 1
title: Uncovered rule claims
summary: How many of the acceptance criteria and audit findings behind rule-correctness no named engine test asserts, read from the suite at a commit.
status: draft
owner: sergio-bershadsky
metric-type: count
target: "0"
window: "instant"
direction: lower-is-better
relations:
  measures:
    - /requirement/rule-correctness
  uses:
    - /environment/local
tags:
  - rules
  - correctness
---

[rule-correctness](srn://brass/requirement/rule-correctness) is the requirement
the project exists to meet, and its sixth criterion is the one that makes the
other six checkable: every rule claim in the list, and each of the nine findings
of the 2026-07-17 audit, is covered by a **named** engine test. This is that
criterion counted rather than asserted.

The target is not chosen here. AC-6 states it — full coverage of a closed,
enumerated set — and this page takes it verbatim rather than picking a line of
its own. Where the two ever disagree, the requirement is right and this page is
stale.

## Definition

The measured set is closed and enumerable: the seven acceptance criteria on
[rule-correctness](srn://brass/requirement/rule-correctness) plus the nine
findings of the 2026-07-17 audit. Count the members for which no test in the
`@brass/rules` suite names the claim it asserts.

**Named** is the load-bearing word, and it is what makes the number computable by
reading rather than by judgement. A test whose title states the rule — deck
totals per seat count, the wild-pile size, the single-industry-slot block on both
the enumerator and the handler — counts as coverage. A test that happens to
exercise a rule while asserting something else does not: nobody reading the suite
could tell that the claim was on purpose, and a regression there would be
attributed to whatever the test was really about.

Excluded: anything the engine departs from on purpose. The turn-commit gate is a
documented deviation
([0001-turn-commit-gate](srn://brass/product/play/component/rules/adr/0001-turn-commit-gate)),
so a missing test asserting the printed behaviour is not an uncovered claim; a
missing test asserting *this* behaviour would be, and is in the set.

## Rationale

Rule correctness cannot be measured against the printed game, because the
normative statement of the rules lives in two repository skills rather than in
this catalog, and no test can diff prose against code. What *can* be counted is
whether each claim somebody has already checked by hand has a test standing
behind it, so that the next regression is a red suite instead of a suspicion.

That is deliberately a weaker thing to measure than "the engine is correct", and
it is the strongest thing here that is honest. AC-1's history is the argument: a
46-card two-player deck carrying six illegitimate cards survived until an
adversarial audit found it, and the criterion now exists so the fix cannot
silently regress.

Filed at solution level rather than on
[rules](srn://brass/product/play/component/rules), because the requirement it
measures is solution-level for the same reason — correctness is what the whole
solution promises a player who knows the physical game, and the engine is only
where it is implemented.

## Known distortions

- **The set is closed, so the number improves by nobody looking.** A rule nobody
  has audited is not in the denominator and never appears here. The metric
  measures the coverage of known claims, not the coverage of the rules, and a
  reading of zero says an audit was checked, not that another audit would find
  nothing.
- **A named test can assert the wrong thing.** Coverage is a bibliographic
  property: it says a claim has a test with its name on it. Whether that test
  encodes the skill correctly is the audit's question, and the audit is not
  automated.
- Nothing computes this today. It would be a read of the suite's test names
  against a list held in a requirement — plainly computable, currently
  uncomputed, which is why this entity is `draft`.
