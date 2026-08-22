---
name: rule-example-coverage
kind: metric
version: 2
title: Rule example coverage
summary: Share of the specification's rule-bearing sections that carry at least one fenced example, counted from the markdown alone.
status: review
owner: sergio
metric-type: ratio
target: "100%"
window: "instant"
direction: higher-is-better
relations:
  measures:
    - /product/specification/requirement/every-rule-has-an-example
tags:
  - spec
  - documentation
---

The specification holds itself to a bar it states in its own first section —
`framework/spec/index.md:32`: "Every normative rule in this spec is accompanied
by at least one concrete example. A rule without an example is an incomplete rule
and a spec defect." This is the number that says how far from that bar the
seventeen documents currently are.

The target is 100% because the bar admits no other reading. It is not an ambition
set on this page; "a spec defect" is not a preference, and any target below one
hundred would be this catalog quietly renegotiating a rule the specification
makes about itself.

## Definition

Denominator: sections of `framework/spec/**/*.md` at heading level 2 to 4 that
contain at least one RFC 2119 keyword **outside** a code fence, over the keyword
set `framework/spec/index.md:29` names — MUST, MUST NOT, SHOULD, SHOULD NOT, MAY
— plus REQUIRED, which the spec uses freely in its field tables and forgot to
list.

Numerator: those same sections that also contain at least one fenced block.

Computed by reading the markdown, splitting on fenced blocks, and matching two
regular expressions. Nothing under `framework/portal/src` participates, which is
AC-3 of the requirement and the only criterion there that is currently met: the
observation is reproducible by a reader with `grep` and no tool this repository
owns.

Excluded: `docs/decision-record.md`, which outranks the spec on conflict but is
not part of this product and claims no example bar; and every entity under
`solutions/`, which describes rather than prescribes.

`window: "instant"` — the observation is over files at one commit. There is no
sampling and no series.

## Rationale

A ratio, where the requirement itself deliberately states counts. The two are not
in competition and the split is the point of having both kinds: the requirement's
criteria name the eleven sections and the forty-two codes, because a work list is
what an author acts on; this metric is the single number that says whether the
work list is getting shorter. A percentage alone would be unactionable, which is
exactly what AC-1's Rationale says — so the percentage lives here and the names
stay there.

The sibling number, how many of the specification's error codes are ever shown
being triggered, is a second observation with a second definition and would be a
second metric. It has not been written, because one is enough to demonstrate the
shape and two would double the maintenance of a count nobody automates.

This metric carries no `uses` edge to an environment, unlike its two siblings at
solution level. There is no environment in which a document is measured — the
same absence the requirement records about itself.

## Known distortions

- **A document can score perfectly by declining to be normative.** The
  denominator counts sections that use an RFC 2119 keyword, so a document that
  prescribes rules without marking them leaves the sample entirely.
  `framework/spec/kinds/actor.md` is the standing case: zero occurrences of any
  keyword — `grep -cE "MUST|SHOULD|MAY|REQUIRED"` returns 0, measured
  2026-08-20 — and a §"Validation rules" prescribing six checks with six
  error codes. By the spec's own definition — "a statement without a
  keyword is descriptive, not normative" — it contains no rules to want examples
  for. That is the cheapest available way to move this number and it makes the
  specification worse.
- **A fenced block is not an example.** The count asks whether a fence exists in
  the section, never whether it demonstrates the rule beside it. Two of the
  eleven currently-failing sections are error-code reference tables where the
  normative language sits inside a code's description, and a fence added to
  either would satisfy this metric without helping a reader.
- **Section granularity is an authoring choice.** Splitting one rule-bearing
  section into two, where only one of them carries the fence, lowers the number;
  merging them raises it. Nothing pins how finely the spec is sectioned.
- **The requirement's recorded counts are already narrower than this
  definition.** AC-1 and AC-2 were measured 2026-08-20 across fourteen documents,
  and `framework/spec/` has held seventeen since decision-record amendment
  `2026-08-20-a` added `kinds/capability.md`, `kinds/journey.md` and
  `kinds/metric.md`. The observation defined above is over the whole directory,
  so it is not comparable with the eleven and the forty-two the requirement
  names until those are retaken. Nothing retakes them; nobody has.
