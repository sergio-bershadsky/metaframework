---
name: 0011-no-cli-in-v1
kind: adr
version: 2
title: No CLI in v1 — integrity is enforced at portal load
summary: There is no validator binary; the loader's diagnostics, surfaced on the portal's diagnostics page, are the only integrity gate.
status: review
owner: sergio-bershadsky
decision-status: accepted
date: "2026-08-19"
deciders:
  - sergio
relations:
  uses:
    - /product/portal/component/console/component/diagnostics-report
tags:
  - tooling
  - founding
---

## Context

A file-based framework with validation rules naturally wants a command:
`catalog check`, run in a pre-commit hook and in CI, exiting non-zero on an
error. The rules existed before any tool did — zod frontmatter validation,
dangling-SRN detection, JSON Schema registry resolution — and they had to run
somewhere.

Two candidates were available: a standalone binary, or the portal's own loader.
Both would need the same parser, the same frontmatter contract and the same
registry. The question was whether to build the surface twice.

## Decision

There is no CLI in v1. Integrity is enforced at portal build and load: the
catalog loader emits every violation as a `Diagnostic`, and
`framework/portal/src/app/(console)/diagnostics/page.tsx` renders them. Its own
docstring states the position: "With no CLI in v1, this page *is* the integrity
gate — it must name the file, the rule, and the fix, not merely report a count."

## Consequences

- **Nothing outside a running Next.js server can validate a catalog.** An author
  without the portal has no check at all, and the portal is the only consumer
  that can tell them their file is wrong.
- **The rules had to be written once and reachable twice.** They are: the loader
  is a library under `framework/portal/src/lib/catalog`, so a test can call it
  directly. That is how `fixture-check.test.ts` asserts the shipped tree is clean
  without starting a server, and it is the closest thing to a CLI that exists.
- **The masthead carries the count on every page**, so a diagnostic is not
  something an author has to go looking for — but they do have to be looking at
  the portal.
- **The gate does not gate anything.** With no CI
  ([review-first-change](srn://metaframework/requirement/review-first-change))
  nothing runs the check automatically, so a red catalog can be committed and
  pushed. "Enforced at load" means "reported at load".
- **The authoring kit inherited a documentation job instead of a tool.** Its
  `validate-catalog` skill is a reader's manual over code that lives in a
  different product, with a code→cause→fix table and an explicit inventory of
  what is *not* covered. That cross-product dependency is the honest shape of
  this decision, not an accident of packaging.
- **Coverage stopped where the renderer stopped.** Because the gate is a page,
  only what the *loader* computes reached it. As recorded at the time: `E_PROTO_*`
  fired when a protocol page rendered and never reached `/diagnostics`;
  `W_DM_UNION_TAG` was emitted inside a function with no production caller; and
  the register of specified-but-unemitted codes ran to roughly fifty. A binary
  with a checklist would have made those holes visible as unimplemented commands
  rather than as silence. Two of the three have since closed —
  `lib/catalog/artifact-checks.ts` folds the protocol and journey artifact
  parsers into the load, and the register is a fraction of its old length; read
  it in `lib/catalog/diagnostic-coverage.test.ts` rather than from the figure
  above, which is a record of 2026-08-19 and is not maintained.
- **The only executable outside the portal is `scripts/migrate_schema_ids.py`**,
  a one-off migration, plus the kit's read-only `catalog_facts.py`. Neither is a
  validator.

## Alternatives considered

- **Ship a CLI in v1.** Rejected on scope at the founding: the portal was the
  deliverable, the rules were not yet stable, and a second entry point would have
  had to be kept in step with a spec that changed five times in one day. The
  cost of that judgement is the coverage gap above, and it is now visible.
- **A pre-commit hook calling the loader through `tsx`.** Not rejected on
  principle — it is a smaller step than a packaged CLI, and it would close the
  "red catalog can be committed" hole. It simply does not exist, and pretending
  otherwise would be describing an intention.
- **Validate in CI instead.** Not available: there is no CI. This alternative is
  listed because it is the one a reader will assume was taken.
- **Make the portal fail the build on an error diagnostic.** Rejected by the
  fail-soft design: a broken catalog must still render, with its errors visible,
  because the person who most needs to see the diagnostic is the person whose
  catalog is broken.
