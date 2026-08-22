---
name: additive-only-evolution
kind: requirement
version: 4
title: A contract surface is never reduced, only extended or swapped
summary: An entity's contract surface may be extended with a version bump or replaced by a successor that is swapped in; it is never narrowed in place.
status: review
owner: sergio-bershadsky
requirement-type: non-functional
priority: must
relations:
  uses:
    - /product/portal/component/git-history
tags:
  - evolution
  - founding
---

Stated in the founding decision record as "never reduce, only extend, or create
new and swap later", and specified in `framework/spec/evolution.md`. Removing a
property, narrowing an enum, weakening an acceptance criterion, deleting a
config key or moving an entity are all reductions. Each one is handled the same
way: create the successor entity, add a `supersedes` edge, migrate the referring
edges one at a time, then set the predecessor to `status: deprecated`. The
predecessor stays on disk forever.

The rule is what makes git-backed history coherent. Only current versions exist
on the filesystem; a pinned `@version` reference resolves through a
version→commit index built from git log. If an entity could move, that index
would have to follow renames — and
`framework/portal/src/lib/history/git.ts` pins `-c log.follow=false` precisely
because it does not.

## Acceptance criteria

- **AC-1** No entity directory under `solutions/` is ever renamed or moved.
  - The one bulk relocation this repository has performed — 45 entities in commit
    `522c6bb` — was a grammar change to the SRN itself, recorded as
    [0008-fully-bucketed-srn-paths](srn://metaframework/adr/0008-fully-bucketed-srn-paths).
    It re-emitted all 118 affected references in the same commit.
- **AC-2** `docs/decision-record.md` is append-only: a rule is retired by a dated amendment, never by deletion.
  - Its five amendments retire each other's rules in place with a `> Retired by …`
    blockquote, and the founding body still carries statements that later
    amendments falsified.
- **AC-3** A superseded decision keeps its text. `## Decision` is never edited into its opposite; the reversal lives in the successor entity.
- **AC-4** An entity's `version` is a monotonic integer, and a decrease or a jump greater than one is `E_VER_REGRESSION`.
- **AC-5** A spec document that changes bumps its own version.
  - Commit `5b8a3e8`'s body states the standard: "a specification that does not
    follow its own evolution rule is the loudest contradiction available."

## What enforces this

One kind of contract surface, and the honest inventory matters more than the
principle.

**A datamodel's schema is compared against its predecessor.**
`E_DM_NOT_ADDITIVE` reads the commit carrying version N−1 through the
version→commit index that
[git-history](srn://metaframework/product/portal/component/git-history) builds,
and diffs that `schema.json` against the one on disk. A removed property, a name
added to `required`, a dropped enum member, a narrowed `type`, a tightened
bound, a new `pattern`, a schema closed with `"additionalProperties": false` and
a `$ref` moved to another entity all fail
[metaframework check](srn://metaframework/product/portal/component/console/component/diagnostics-report).
It is the only comparator in the repository that runs over `solutions/`.

Everything else is still author discipline. `E_VER_REGRESSION` exists in
git-history and has its own tests, but it is **never run over `solutions/`** —
the module's suite uses hermetic fixtures, and `fixture-check.test.ts` does not
call it. Nothing compares a frontmatter contract, an acceptance-criteria list or
a protocol's operation set against its predecessor, and nothing detects a
deleted directory at all. `docs/decision-record.md` being append-only is
enforced by no test, no lint and no hook.

So AC-1 through AC-3 are held by author discipline and by the authoring kit's
`evolve-entity` skill
([plugin](srn://metaframework/product/authoring-kit/component/plugin)),
which owns the additive-versus-swap decision. AC-4 is implemented but
unwired. AC-5 is a convention that this repository has already broken twice.

The schema comparator's own limits are worth carrying here rather than leaving
on the check's page, because they are limits on this requirement's coverage.
It compares against N−1, so a tightening that also skipped its version bump is
measured against the wrong document; it is silent where git cannot reach the
predecessor, because an accusation nothing can support is worse than none; and
it decides only what `framework/spec/kinds/datamodel.md` calls the decidable
subset — a semantic break, the same name and type carrying a new meaning, is
invisible to it and to any checker that will ever be written.

## Rationale

AC-5 is written knowing the spec violates it. Two defects, both greppable:

- **Skipped numbers.** Commit `5b8a3e8` bumped `index.md` 3→5, `srn.md` 3→5,
  `evolution.md` 2→4 and `frontmatter.md` 2→4 in one commit — two increments for
  two amendments. `index.md@4`, `srn.md@4`, `evolution.md@3` and
  `frontmatter.md@3` exist in no commit, so the version→commit index cannot
  resolve them.
- **Substantive edits without a bump.** Commit `bae08e4` rewrote a large part of
  `srn.md` leaving `version: 1`; commit `4aa3f68` edited both `frontmatter.md`
  and `structure.md` leaving both at `version: 1` —
  `git show --stat bae08e4 4aa3f68` is the evidence. Both
  `kinds/datamodel.md` and `kinds/protocol.md` were *born* at version 2 — no v1
  of either was ever committed.

Those are recorded here rather than fixed, because fixing them would require
rewriting history, which is the violation this requirement exists to prevent.

## Out of scope

The evolution of this catalog's own entities. It is one day old and nothing in it
has been superseded yet. The criteria above are about the framework's rule, not
about a track record it does not have.
