---
name: core-contracts
kind: component
version: 4
title: Core contracts
summary: The five spec documents binding on every kind — index, structure, srn, frontmatter, evolution; 3,461 lines that no kind document may relax.
status: review
owner: sergio
component-type: library
lifecycle: released
relations:
  exposes:
    - /product/specification/datamodel/entity-frontmatter
tags:
  - spec
  - core
---

Five documents, 3,461 lines, at the root of `framework/spec/`. Versions and
line counts measured 2026-08-21:

| Document         | Version | Lines | What it fixes                                                                                 |
| ---------------- | ------- | ----- | --------------------------------------------------------------------------------------------- |
| `index.md`       | 8       | 237   | Purpose, five core principles, document map, reading order, precedence.                       |
| `structure.md`   | 6       | 928   | Monorepo layout, kind buckets, entity directories, naming, the artifact role table, dialects. |
| `srn.md`         | 8       | 1,147 | SRN grammar, parsing, disk mapping, artifact addresses, relative refs, placement.             |
| `frontmatter.md` | 8       | 513   | The common frontmatter contract and the closed edge vocabulary.                               |
| `evolution.md`   | 8       | 636   | Versioning, the additive-only rule, the swap procedure, git history, dialect migration.       |

The spec's own document map calls them "Core contracts — binding on every kind".
Their versions move independently and on their own commits, and all five were
last touched on 2026-08-21 rather than on the day each was written. Commit
ae7d355 — "artifacts get addresses, and no clock of their own" — changed all
five at once: `srn.md` gained the `.{artifact}` suffix and `index.md` the
principle restating it, `structure.md` gained the role table the suffix resolves
against, `frontmatter.md` the fence that keeps an artifact SRN out of every
reference surface, and `evolution.md` the artifact-pin rule that `X.role@N` is a
coordinate of the entity and never of the file. Amendment `2026-08-21-a` —
artifacts declare their dialect — then reached back into three of the five the
same day: `index.md`, `structure.md`, `evolution.md`. A group that moves together
under one amendment is the evidence that it is one component, and this group did
it twice inside one day.

## Why this is a component and not a chapter list

Because `index.md` states a precedence *relation* between this group and
[kind-contracts](srn://metaframework/product/specification/component/kind-contracts),
and a relation needs two addressable ends:

> Where two documents appear to disagree, the precedence is: the decision
> record, then the core contracts, then the kind document. A kind document never
> relaxes a core rule; where it looks like it does, that is a spec defect to be
> reported.

That sentence is the seam. Everything a kind document may do is *additive on top
of* what is written here, and the rule that makes it so is written on this side.

## What it exposes

[entity-frontmatter](srn://metaframework/product/specification/datamodel/entity-frontmatter)
— the common half of every `index.md` in every catalog. `frontmatter.md` owns the
field table, the closed `kind` enum, the closed seven-edge vocabulary
(`uses`, `exposes`, `depends-on`, `implements`, `realizes`, `measures`,
`supersedes`), and the rule that inverse edges are derived and never authored.

`srn.md` and `structure.md` between them own something with no datamodel at all:
the path grammar. It is a format the same way frontmatter is, but its instances
are *directory names*, not files, so there is no artifact to give a schema. The
executable form is `framework/portal/src/lib/srn/srn.ts` — a zero-dependency
parser whose `RESERVED_KINDS` list at line 30 is the closed eleven-word
vocabulary the spec names.

## The character of these documents

They are enforceable and largely enforced. `structure.md`'s structural errors,
`srn.md`'s grammar errors and `frontmatter.md`'s shape errors are the diagnostics
the portal actually raises against `solutions/` today — `E_SRN_SYNTAX`,
`E_SRN_RESERVED`, `E_SRN_PLACEMENT`, `E_SRN_DANGLING`, `E_FM_SCHEMA`,
`E_FM_UNKNOWN_FIELD`, `E_FM_NAME_MISMATCH`, `E_FM_KIND_LOCATION`,
`E_FM_EDGE_SOURCE`, `E_FM_EDGE_TARGET`, `E_STRUCT_*`.

`evolution.md` is the exception and the honest one. Its central rule — never
reduce a contract surface, only extend or swap — has one implemented check,
`E_VER_REGRESSION` in `framework/portal/src/lib/history/git.ts`, and that check
is never run over `solutions/`. Nothing compares a schema, a frontmatter contract
or an acceptance-criteria list against its predecessor. Removing a property,
narrowing an enum or renaming a directory produces no diagnostic at all.

## `component-type: library`

The nearest fit, and a poor one. The enum's `library` means "build-time artifact
with no runtime of its own; it runs inside its consumers", which is true of a
normative document only by analogy: it is consumed by reference and exposes no
interface. There is no value for "a set of normative documents", and inventing an
eighth would be `E_FM_SCHEMA`. Recorded here as the spec's own guidance
prescribes — pick the nearest, put the nuance in prose.
