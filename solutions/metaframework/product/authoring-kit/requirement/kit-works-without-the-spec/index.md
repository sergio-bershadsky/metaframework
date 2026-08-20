---
name: kit-works-without-the-spec
kind: requirement
version: 1
title: The kit produces correct catalogs without the spec on disk
summary: An installed plugin cannot see framework/spec, so the bundled distillation must be sufficient on its own and must agree with the spec when both are present.
status: review
owner: sergio
requirement-type: non-functional
priority: must
relations:
  uses:
    - /product/authoring-kit/component/reference-bundle
    - /product/specification/component/core-contracts
tags:
  - portability
  - drift
---

# The kit produces correct catalogs without the spec on disk

The plugin is installed into a Claude Code session that may be working in any
repository. `framework/spec/` is in *this* one and in no other, so a plugin that
only works beside its own specification is a plugin that only works here.

Every skill, `agents/catalog-reviewer.md` and `commands/solution-new.md` state
the same two-source rule: read `framework/spec/` when the repository has it,
because it is authoritative; otherwise read
`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/`. The obligation has two
halves and the second is the hard one — the bundle must be **sufficient** alone,
and it must **agree** with the spec whenever both are visible.

## Acceptance criteria

- Every skill, command and agent in the plugin names both sources and states that
  `framework/spec/` wins when present.
  - Verified by reading: all seven `SKILL.md` files, `agents/catalog-reviewer.md`
    and `commands/solution-new.md` carry the rule; `commands/entity-new.md` and
    `commands/catalog-check.md` delegate it to the skill they route to.
- Every file in `skills/_shared/references/` opens by naming the spec document it
  distils and conceding precedence to it.
  - Verified 2026-08-19 by reading the opening blockquote of all seven files.
- No rule stated in the bundle contradicts the rule it distils in
  `framework/spec/`.
  - **Unverified.** Nothing compares the two, and the comparison has never been
    made document by document.
- No factual claim a skill makes about the portal or the repository is stale.
  - **Currently false.** `skills/validate-catalog/SKILL.md` says "Two files run"
    and "A pass looks like `Test Files  2 passed (2)`";
    `framework/portal/src/lib/catalog` holds four test files today —
    `fingerprint.test.ts`, `fixture-check.test.ts`, `load.test.ts`,
    `tree.test.ts` — and the run prints four.
- A catalog authored with the plugin installed outside this repository loads with
  zero error diagnostics.
  - **Never attempted.** Both catalogs in the repository — `solutions/acme` and
    `solutions/brass` — were authored beside the spec, so the fallback path has
    no evidence behind it at all.

## Rationale

`marketplace/README.md` gives the reason the duplication exists: "an installed
plugin cannot see `framework/spec/` on disk". 7,279 lines of specification become
2,571 lines of distillation, and the compression is where fidelity is lost —
worked examples and rationale go first, and a rule whose only clear statement was
inside an example goes with them.

The trade was made knowingly. Commit `dada3ba` records it: "The plugin cannot
read `framework/spec`, so the reference bundle carries distilled copies of the
rules an author needs … That duplication is deliberate and is the reason these
files must be corrected whenever the spec moves."

## Enforcement

**None.** No test, no lint, no script and no CI compares
`skills/_shared/references/` against `framework/spec/`, or compares any skill's
claims against the portal. The drift recorded above was found by reading, and it
would have gone unnoticed indefinitely.

This requirement is `priority: must` and is met by discipline. It is written down
so the gap is on the record rather than discovered later by an author following a
stale instruction.

## Out of scope

Keeping the bundle in sync with the *portal's implementation* is a different
obligation and does not belong here. The spec is the contract; where the portal
and the spec disagree, that is a portal defect or a spec defect, and this
requirement is only about the plugin's copy of the spec.
