---
name: green-test-suite
kind: requirement
version: 4
title: The portal's test suite is green
summary: Every suite passes, on demand at the repository root and on every push and pull request in CI — and the criterion is that it exits zero, never that it exits zero at a particular count.
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

`npm test` is the whole of the portal's automated checking, and this
requirement is the statement that it passes. Since 2026-08-20 it is also run
for you: `.github/workflows/ci.yml` carries a `test` step — `run: npm test`
under the job's `working-directory: framework/portal` — on every push to `main`
and every pull request. There is no `.husky/`, no configured git hook and no
`lint-staged`, so the gate reports a red commit rather than preventing one.

It used to be where the portal's measured numbers lived, and it is not any
more. The ontology has a `metric` kind now (decision-record amendment
2026-08-20-a), but a metric measures something the catalog describes, and a
test count is a fact about this repository rather than about any described
system — so a metric was never the right home either.
[0018-measured-facts-are-derived-or-dated](srn://metaframework/adr/0018-measured-facts-are-derived-or-dated)
settled it the other way: the count is derived by running the suite, and the
criterion below asserts the exit code. The **Rationale** records the argument
that was overturned.

## Acceptance criteria

- **AC-1** `npm test` at the repository root exits zero, as `vitest run` **with
  the portal as the working directory**.
  - It proxies to `npm --prefix framework/portal run test`. The working
    directory is part of the criterion, not a detail of it: the script used to
    be `npm --prefix framework/portal exec -- vitest run`, which finds the same
    config and collects the same files but leaves the cwd at the repository
    root — so every suite that resolves a path from `process.cwd()`
    (`fixture-check`, `dereference`, `url`, `lineage`) failed, while
    `npm --prefix framework/portal run test` passed. Measured 2026-08-19, when
    the suite was 28 files and 19 of them went red under the wrong cwd.
  - A gate whose only invocation is red is not a gate, and this one had been red
    long enough that the difference read as normal.
- **AC-2** Every suite passes and the run exits zero. The counts move with the code and a change to them is expected; a failure is not.
- **AC-3** `npx vitest run src/lib/catalog` passes, in well under a second.
- **AC-4** `fixture-check.test.ts` loads the real `solutions/` tree and asserts zero diagnostics of severity `error`.
- **AC-5** No suite reaches the network. `dereference.test.ts` is the load-bearing case: if its resolver stops matching, it fails by attempting a network call, not by asserting a wrong shape.

## What this requirement does not claim

It does not claim coverage. Almost every suite lives under `src/lib/**`, and
`find src -name '*.test.tsx'` returns nothing, so no test renders a component.
The suites outside `src/lib` mark the shape of that gap rather than close it:
`src/components/diagrams/state-simulator.test.ts` asserts a model deliberately
without a DOM, and `src/app/artifacts/[...path]/route.test.ts` calls a route
handler as deployed. Of the HTTP surfaces in the product — `find src -name
route.ts` lists them — only `/artifacts` and `/schemas` are reached, the second
because `fixture-check.test.ts` imports its handler directly; everything under
`src/app/api/` is reached by nothing.

It does not claim every criterion is enforced. The workflow's `test` step covers
the substance of AC-1 — `vitest run` with the portal as the working directory —
and with it AC-2 and AC-4, which the same run decides. It does not cover AC-1's
letter: the step runs `npm test` *in* `framework/portal`, so it exercises the
portal's own script and never the root proxy that AC-1 names. The proxy is the
part that broke last time, and nothing runs it.

AC-3 and AC-5 are enforced by nobody: no step runs `src/lib/catalog` on its own,
and no step denies the runner a network, so a suite that started reaching one
would go green.

Nor does it claim the gate is a precondition. The workflow runs on push and on
pull request; it reports afterwards, and with no pre-commit hook and no
branch-protection setting this catalog can see, a red commit is recorded, not
refused.

## Rationale

An earlier version of AC-2 pinned the counts — "16 test files and 395 tests
passing, in roughly 1.2s, measured 2026-08-19" — on the argument that a claim
like "the tests pass" ages into a lie silently while a dated count ages into a
*comparison*. The argument is right about recording and wrong about placement,
and [0018-measured-facts-are-derived-or-dated](srn://metaframework/adr/0018-measured-facts-are-derived-or-dated)
says where the difference lies: as a comparison the growth is genuinely
informative, and as a **condition of acceptance** it is a criterion the suite
fails by growing, which is the opposite of what it was written to guarantee. The
comparison belongs in a dated record; the criterion asserts green.
