---
name: 0002-filesystem-is-the-database
kind: adr
version: 1
title: The filesystem is the database
summary: An entity is a directory holding index.md; there is no database and no hidden state, and the portal is a read-only renderer over the tree.
status: review
owner: sergio-bershadsky
decision-status: accepted
date: "2026-08-19"
deciders:
  - sergio
relations:
  uses:
    - /product/portal/component/catalog-loader
tags:
  - storage
  - founding
---

# The filesystem is the database

## Context

The framework had to choose where a catalog's content lives before anything else
could be designed. A modelling tool that stores its model in a database — or in
one large document, or behind an API — gets transactional edits, referential
integrity and a query language for free, and loses the property this framework
was built for: that the description is reviewed the same way the code is.

The forcing constraint was stated at the founding: review is git-native, and the
description must be legible to a person, to an AI agent and to the portal
without any of them holding a privileged reader.

## Decision

All content lives as files in the git repository. **An entity is a directory
containing `index.md`** — YAML frontmatter plus prose — beside optional sibling
artifacts (`schema.json`, `transport.yaml`, `states.json`, `workflows/*.yaml`,
`topology.yaml`, `config.yaml`). There is no database and no hidden state. The
portal is a read-only renderer over the tree.

Discovery follows from the rule and nothing else: `framework/portal/src/lib/catalog/load.ts`
is a recursive descent whose entire entity test is "does this directory hold
`index.md`". Everything a reader needs to know about what exists is answerable
with `ls` and `find`.

## Consequences

- **Containment is derived, never authored.** There is no `children`, `contains`
  or `parent` field; a `children:` key in frontmatter is `E_FM_UNKNOWN_FIELD`.
  The directory tree *is* the containment graph, so the two cannot disagree.
- **Inverse edges are derived too.** `used-by`, `implemented-by`,
  `superseded-by` and the rest are computed from the forward edges at load time.
  Authoring both directions would be double bookkeeping in a store with no
  transactions.
- **Every change is a diff.** A structural change to a described system shows up
  as added and removed directories, which is exactly what makes
  [review-first-change](srn://metaframework/requirement/review-first-change)
  expressible at all.
- **There is no referential integrity at write time.** Nothing stops an author
  saving a dangling reference; it becomes `E_SRN_DANGLING` at load. Loading is
  therefore fail-soft by necessity as well as by choice — every violation becomes
  a diagnostic and nothing throws, so a broken catalog renders with its errors
  visible instead of a blank page.
- **Queries are the shell's.** There is no query language.
  `grep -rl "status: deprecated" solutions/` is the framework's own worked
  example of a catalog query, and it is also the ceiling.
- **Reads are cheap enough, barely.** The loader's own measurement, recorded in
  `framework/portal/src/lib/catalog/index.ts` and taken before this solution was
  authored: 197 entities across 597 entries, ~2.2 s of request time to rebuild,
  of which ~400 ms is the loader and ~250 MB is heap growth per rebuild. In
  development that is hidden behind a stat-walk fingerprint — ~18 ms when nothing
  changed — and the existence of that cache is the first real cost of this
  decision.
- **History is git's problem.** Only current versions exist on disk; a `?v=N`
  read is a `git show`. That is a separate decision
  ([0009-git-backed-history](srn://metaframework/adr/0009-git-backed-history))
  but it is only available because of this one.

## Alternatives considered

- **A database with a file export.** Rejected: the export is a projection, so the
  reviewable artifact is downstream of the authoritative one and can drift. The
  framework's whole claim is that the file *is* the record.
- **One large document per solution** (a single YAML or JSON tree). Rejected on
  the review surface again: every change to any entity touches one file, so
  diffs collide, blame is useless, and the per-entity `version` field would have
  nowhere to live. It also makes the SRN-to-storage mapping arbitrary instead of
  mechanical.
- **A dedicated file format with an index sidecar.** Rejected: a committed index
  is state that can be stale, and the first thing a reviewer would have to learn
  is to distrust it. Everything the portal needs is derivable from the tree in
  one pass.
- **Storing entities as flat files rather than directories** (`checkout.md`
  instead of `checkout/index.md`). Rejected because sibling artifacts have
  nowhere to go — a datamodel's `schema.json` and a protocol's `workflows/`
  directory are the substance of those kinds — and because the directory
  convention is what makes `ls` of any bucket a list of entities.
