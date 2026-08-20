---
name: catalog-validation
kind: component
version: 2
title: Catalog validation
summary: Legality — how to run the portal's check, the cascade order to read it in, the code-to-fix table, and an explicit inventory of what it does not cover.
status: review
owner: sergio
component-type: library
lifecycle: released
relations:
  uses:
    - ../reference-bundle
  depends-on:
    - /product/portal/component/catalog-loader
tags:
  - validation
  - diagnostics
---

`skills/validate-catalog/` — `SKILL.md` (199 lines) plus
`references/diagnostics.md` (229). One question: **is it legal?** The
architectural question is
[architecture-review](srn://metaframework/product/authoring-kit/component/architecture-review)'s,
and the two are kept apart because they have different evidence and different
authority.

## It owns the manual, not the check

The enforcement lives in another product:
[catalog-loader](srn://metaframework/product/portal/component/catalog-loader),
exercised by a vitest suite. This component's whole procedure is one command —

```bash
cd framework/portal && npx vitest run src/lib/catalog
```

— plus everything a reader needs to interpret the result. `depends-on` toward the
loader is therefore the accurate edge: this component requires that one to exist
and function, and owns none of it. There is no CLI to depend on instead; the
skill states that outright, and `/diagnostics` in the running portal is the only
other surface.

## What it actually carries

Three things the diagnostic messages do not say for themselves.

**A cascade order.** Diagnostics are not independent, so the skill fixes them in
stages and re-runs between: `E_SRN_*` on a directory path first (a misplaced
directory has no SRN, so the entity does not exist and every referrer is a
symptom), then `E_FM_SCHEMA` against the common contract, then the entity's own
`E_FM_*`, then genuine reference errors, then warnings. Its second cascade rule
is the one that saves the most time: a wrong `kind:` value yields three codes at
once, because the kind-specific schema is selected by disk position rather than
by the declared value, and one edit fixes all three.

**A code → cause → fix table** for every code the loader emits, written as causes
rather than definitions. `E_SRN_SYNTAX` is "miscounted `..` in a relative
reference", and the fix is to rewrite the reference solution-absolute instead of
recounting dots.

**Which warnings matter.** The check filters on `severity === 'error'`, so
warnings never fail it and a passing run never prints them. `W_REF_DEPRECATED`
means a swap is unfinished; `E_SRN_VERSION` — emitted as a warning by this loader
though the specification classes it as an error — is either a deliberate freeze
or a forgotten migration, and only the author knows which.

## The section that makes it honest

"What this check does not cover" opens by naming the expensive mistake: treating
a green run as "the catalog is correct". It then lists, by code, what is not
exercised — `E_PROTO_*` and `E_VER_REGRESSION` live in modules whose suites use
hermetic fixtures and are never run over `solutions/` — and what is specified but
implemented nowhere, including `E_ADR_SECTIONS`, `E_REQ_CRITERIA`,
`E_PROD_ACTOR_TARGET`, `W_STRUCT_PROTOCOL_NCA`, `W_REQ_UNIMPLEMENTED` and
`E_COMP_LIBRARY_ENVIRONMENT`.

Those absences bind this catalog directly: the four ADR headings and the
requirement `## Acceptance criteria` section in this very solution are checked by
author discipline and nothing else.

The section also records two things that **used** to be in it and no longer are —
the datamodel registry now runs over the shipped catalog through
`withSchemaRegistry` in `src/lib/catalog/index.ts`, and `fixture-check.test.ts`
asserts `$id`/`x-srn` agreement over the real tree. A skill that removes its own
caveats when they stop being true is doing the job.

## Where it is already wrong

`SKILL.md` says "Two files run" and "A pass looks like `Test Files  2 passed
(2)`". Four test files sit in `framework/portal/src/lib/catalog` today and the
run prints four. The claim was true when written. Nothing detects that it stopped
being true, which is the point of
[kit-works-without-the-spec](srn://metaframework/product/authoring-kit/requirement/kit-works-without-the-spec).

It also warns that `fixture-check.test.ts` is partly a regression guard on the
acme fixture with hard-coded expectations, so legitimate catalog work can fail
it — adding an edge toward `srn://acme/product/billing/component/ledger`, or
adding a protocol artifact to `order-placement` or `settlement`. Adding a whole
new solution is explicitly not one of those cases, which is the only reason this
solution can be written without touching a test.
