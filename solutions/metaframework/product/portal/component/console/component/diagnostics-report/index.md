---
name: diagnostics-report
kind: component
version: 3
title: Diagnostics report
summary: The /diagnostics page — with no CLI in v1, this is the integrity gate, and it can only show what the loader and the schema registry found.
status: review
owner: sergio
component-type: ui
lifecycle: released
relations:
  depends-on:
    - /product/portal/component/catalog-loader
    - /product/portal/component/schema-registry
  uses:
    - /environment/local
tags:
  - integrity
  - console
---

`src/app/(console)/diagnostics/page.tsx`, plus
`components/diagnostics-indicator.tsx` which puts the error and warning counts
in the masthead of every page. Its own docstring states the claim this component
exists to make:

> With no CLI in v1, this page *is* the integrity gate — it must name the file,
> the rule, and the fix, not merely report a count.

## What it does

Reads `catalog.diagnostics`, splits by severity, and renders code, path, message
and a link to the offending entity. When the list is empty it says so in
sentences rather than showing a green tick with no content — "every entity
satisfies the frontmatter contract, every reference resolves, every entity sits
where its kind allows, and every datamodel schema states its own identity and
resolves its refs" — which is the exact set of things that were actually
checked, and no more.

It is a server component that awaits `getCatalog()`. It holds no state and has
no client bundle of its own.

## Why it is placed under `console` and described here

Structurally it is one of the console's surfaces. In responsibility it is the
**output surface of the loader**: it can display exactly what
[catalog-loader](srn://metaframework/product/portal/component/catalog-loader)
and [schema-registry](srn://metaframework/product/portal/component/schema-registry)
put on one list, and nothing else. That is why it is paired in this catalog with
[0004-fail-soft-catalog-loading](srn://metaframework/product/portal/adr/0004-fail-soft-catalog-loading):
the decision to turn violations into diagnostics rather than exceptions is the
decision that gave this page something to render.

`withSchemaRegistry()` in `lib/catalog/index.ts:53` is what folds `E_DM_*` in
beside `E_FM_*` and `E_SRN_*`. One list, one severity split, one indicator
count — a reader must not have to know which validator found a problem in order
to see it. The docstring on that function records that before the merge existed,
the registry ran only in the test suite and that whole class of error never
reached this page.

## What it cannot show, and this is the important half

This page is the framework's only integrity gate and it sees roughly half of the
framework's own error taxonomy.

- **What can reach it**: the thirteen classes `load.ts` raises by name, every
  `E_SRN_*` the parser throws and the loader re-emits under the thrown code
  (`load.ts:118` and `:312`), and fifteen from the schema registry.
- **`W_DM_CONTRADICTION` cannot.** It is pushed into a local array that the
  entity page renders. **`W_DM_UNION_TAG` cannot** — it is emitted only inside
  `buildSchemaBundle()`, which has no production caller at all.
- **No `E_PROTO_*` code can.** Protocol artifacts are parsed when a protocol
  page renders, never at load, so a malformed workflow or a states file outside
  the XState subset is visible only to whoever opens that entity.
- **No `E_VER_REGRESSION`.** It exists in
  [git-history](srn://metaframework/product/portal/component/git-history) with
  its own tests and is never run over `solutions/`.
- **Roughly fifty specified codes are implemented nowhere**, concentrated in
  protocol, environment, ADR and requirement validation. Two of them matter to
  this catalog directly: `E_ADR_SECTIONS` (an ADR's four required headings) and
  `E_REQ_CRITERIA` (a requirement's `## Acceptance criteria` section). Every ADR
  and every requirement in this solution is therefore checked by author
  discipline alone.

## And nothing runs it unattended

There is no CI in this repository — no `.github/`, no workflow file, no hook.
The page is a gate a human has to walk up to. `fixture-check.test.ts` asserts
zero error-severity diagnostics over the real `solutions/` tree, which is the
only automated form this check has, and it too fires only when somebody runs
`npm test`.
