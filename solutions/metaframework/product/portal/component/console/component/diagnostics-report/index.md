---
name: diagnostics-report
kind: component
version: 4
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

- **What can reach it**: every class `load.ts` raises by name — the list is on
  [catalog-loader](srn://metaframework/product/portal/component/catalog-loader) —
  plus every `E_SRN_*` the parser throws and the loader re-emits under the thrown
  code (`load.ts:118` and `:312`), and every `E_DM_*` the schema registry raises.
  Counts are deliberately not restated here: three pages used to carry three
  different ones for `load.ts` alone.
- **`W_DM_CONTRADICTION` cannot.** It is pushed into a local array that the
  entity page renders. **`W_DM_UNION_TAG` cannot** — it is emitted only inside
  `buildSchemaBundle()`, which has no production caller at all.
- **`E_PROTO_*` codes reach it now, by one route.**
  `lib/catalog/artifact-checks.ts` folds the protocol and journey artifact
  parsers into the catalog as it composes, using the same kind × filename
  dispatch the entity page uses — so a malformed workflow, a states file outside
  the XState subset, and an `arazzo.yaml` whose references miss the siblings its
  entity carries (`W_PROTO_ARAZZO_UNGROUNDED`) all land here as well as on that
  page. The bullet above used to say the opposite, and was true when the parsers
  ran only while a protocol page rendered. What is still out of reach is every
  `E_PROTO_*` rule with no emitter at all — chiefly `transport.yaml`, which
  nothing validates in either dialect.
- **No `E_VER_REGRESSION`.** It exists in
  [git-history](srn://metaframework/product/portal/component/git-history) with
  its own tests and is never run over `solutions/`.
- **Specified codes with no emitter anywhere.** The live list is the
  `UNIMPLEMENTED` register in
  `framework/portal/src/lib/catalog/diagnostic-coverage.test.ts` — read it there
  rather than from a count written here, because its ratchet keeps it honest and
  a number in this sentence would not be. It has shrunk by most of its length
  since this page was written: `E_ADR_SECTIONS` and `E_REQ_CRITERIA`, both named
  here as gaps that mattered to this catalog directly, are emitted, and what
  remains is concentrated in protocol validation.

## And nothing runs it unattended

There is no CI in this repository — no `.github/`, no workflow file, no hook.
The page is a gate a human has to walk up to. `fixture-check.test.ts` asserts
zero error-severity diagnostics over the real `solutions/` tree, which is the
only automated form this check has, and it too fires only when somebody runs
`npm test`.
