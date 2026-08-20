---
name: green-test-suite
kind: requirement
version: 1
title: The portal's test suite is green
summary: Every suite passes on demand at the repository root, and the numbers that prove it are recorded here because there is no metric kind.
status: review
owner: sergio
requirement-type: non-functional
priority: must
relations:
  uses:
    - /environment/local
tags:
  - testing
  - measurement
---

# The portal's test suite is green

Nothing else in this repository checks the portal. There is no CI, no
pre-commit hook, no build gate; `npm test` at the root is the entire quality
apparatus, and this requirement is the statement that it passes.

It is also where the portal's measured numbers live, because the ontology is
closed at nine kinds and none of them is `metric`. Acceptance criteria are the
only place in the framework a number can be asserted and later checked.

## Acceptance criteria

- **AC-1** `npm test` at the repository root exits zero. It proxies to `npm --prefix framework/portal exec -- vitest run`.
- **AC-2** The run reports 16 test files and 395 tests passing, in roughly 1.2s. Measured 2026-08-19; the counts move with the code and a change to them is expected, a failure is not.
- **AC-3** `npx vitest run src/lib/catalog` reports 4 files and 74 tests, in ~498ms. Measured 2026-08-19.
- **AC-4** `fixture-check.test.ts` loads the real `solutions/` tree and asserts zero diagnostics of severity `error`.
- **AC-5** No suite reaches the network. `dereference.test.ts` is the load-bearing case: if its resolver stops matching, it fails by attempting a network call, not by asserting a wrong shape.

## What this requirement does not claim

It does not claim coverage. All 16 suites live under `src/lib/**`;
`find src -name '*.test.tsx'` returns nothing, so roughly 7,100 lines of
components and app routes are exercised by no test at all. Two of the three HTTP
surfaces in the product are in that gap: `/schemas` is reached only because
`fixture-check.test.ts` imports its handler directly, and `/api/history` is
reached by nothing.

It does not claim the numbers are enforced. AC-1 through AC-5 are true because a
person ran the commands on 2026-08-19. There is no `.github/` directory and no
CI configuration anywhere in the repository, so nothing prevents a red commit —
and the repository's 52 commits contain no merge commit, so nothing has ever
been gated on this.

## Rationale

The counts are recorded rather than left implicit because a claim like "the
tests pass" ages into a lie silently, and a claim like "395 tests pass in 1.2s
as of 2026-08-19" ages into a *comparison*. That is the only difference between
a measurement and a boast.
