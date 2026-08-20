---
name: core-contracts
kind: component
version: 2
title: Core contracts
summary: The five spec documents binding on every kind — index, structure, srn, frontmatter, evolution; 2,018 lines that no kind document may relax.
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

Five documents, 2,018 lines, at the root of `framework/spec/`:

| Document         | Version | Lines | What it fixes                                                        |
| ---------------- | ------- | ----- | -------------------------------------------------------------------- |
| `index.md`       | 5       | 186   | Purpose, five core principles, document map, reading order, precedence. |
| `structure.md`   | 2       | 429   | Monorepo layout, kind buckets, entity directories, naming.           |
| `srn.md`         | 5       | 801   | SRN grammar, parsing, disk mapping, relative refs, placement.        |
| `frontmatter.md` | 4       | 277   | The common frontmatter contract and the closed edge vocabulary.      |
| `evolution.md`   | 4       | 325   | Versioning, the additive-only rule, the swap procedure, git history. |

The spec's own document map calls them "Core contracts — binding on every kind".
Their versions move independently and on their own commits — `structure.md` has
not been touched since 36d504c on 2026-08-19 at 13:42, while `srn.md` reached
version 5 nine hours later.

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
field table, the closed `kind` enum, the closed edge vocabulary
(`uses`, `exposes`, `depends-on`, `implements`, `supersedes`), and the rule that
inverse edges are derived and never authored.

`srn.md` and `structure.md` between them own something with no datamodel at all:
the path grammar. It is a format the same way frontmatter is, but its instances
are *directory names*, not files, so there is no artifact to give a schema. The
executable form is `framework/portal/src/lib/srn/srn.ts` — a zero-dependency
parser whose `RESERVED_KINDS` list at line 23 is the closed eight-word vocabulary
the spec names.

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
