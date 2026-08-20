---
name: 0004-fail-soft-catalog-loading
kind: adr
version: 1
title: Loading is fail-soft — violations are diagnostics, not exceptions
summary: A broken catalog renders with its errors visible instead of failing to a blank page, which is what makes the diagnostics page an integrity gate rather than a stack trace.
status: review
owner: sergio
decision-status: accepted
date: "2026-08-19"
deciders:
  - sergio
relations:
  uses:
    - /product/portal/component/catalog-loader
tags:
  - loader
  - diagnostics
---

## Context

The framework has **no CLI** — an explicit v1 decision — so the only place a
catalog can be validated is while the portal loads it. That puts the validator
and the renderer in the same code path, and the obvious implementation throws on
the first violation.

An author's normal working state is a catalog that does not yet satisfy the
spec: a reference typed before its target exists, a `kind` that disagrees with a
bucket mid-move, a schema whose `$id` has not been updated. If the loader throws,
that author gets a stack trace and no catalog, at exactly the moment they need
to see the catalog to fix it. The reader who most needs the tool is the one the
tool refuses to serve.

Commit `6a5151e`, 12:18 on 2026-08-19, took the other branch.

## Decision

The loader is **fail-soft**. Every violation becomes a `Diagnostic` on
`catalog.diagnostics` and nothing throws. A broken catalog renders, and it
renders *with its errors visible*. Callers that need strictness — a test, a
future CI step — fail on any diagnostic of severity `error`, which is what
`fixture-check.test.ts` does over the real `solutions/` tree.

The `Diagnostic` shape is fixed: a code, a severity, a message, a path, and the
SRN when one is known. Diagnostics from other validators are folded into the
same list rather than reported separately.

## Consequences

- The diagnostics page is possible at all. With no CLI, that page *is* the
  integrity gate, and a gate that can only exist when the catalog is already
  valid would be worthless.
- Every check must be written to continue rather than to abort, which is more
  code and a real constraint: a relation whose target is missing still has to
  produce a resolved-enough entity for the rest of the walk.
- Testability came free and was cashed immediately: `load.test.ts` runs one
  hermetic temp fixture **per diagnostic class**, 21 of them at the time of the
  commit, which is only possible because each class produces a value rather than
  an exception.
- Severity became a design decision rather than an accident. `E_SRN_VERSION` and
  `W_REF_DEPRECATED` are warnings because they describe drift; everything
  structural is an error.
- **A fail-soft loader silently tolerates a catalog nobody looks at.** Errors
  that block nothing are errors that accumulate, and with no CI in this
  repository there is nothing between a broken catalog and a merge except a
  person opening `/diagnostics`.
- The pattern spread, and that is mostly good: `git.ts` never throws either, and
  the protocol parsers collect rather than raise. It also spread to a place it
  does not reach — `E_PROTO_*` diagnostics are produced at render time and never
  enter `catalog.diagnostics`, so the fail-soft *reporting* is real while the
  fail-soft *gate* has a hole.

## Alternatives considered

- **Throw on the first violation.** Simplest, and it is what a build tool does.
  Rejected because the portal is not a build tool: it is the thing an author
  looks at to find out what is wrong, and refusing to render is refusing to
  answer.
- **Two passes — validate strictly, then load.** Rejected as double work over
  the same tree, and it does not solve the problem: the strict pass still has to
  decide what to do about the second violation.
- **Collect diagnostics but render nothing when any error exists.** A middle
  position that was considered and lost for the same reason as the first: a
  catalog with one dangling reference is 99% readable, and hiding it teaches
  authors to fear the tool.
