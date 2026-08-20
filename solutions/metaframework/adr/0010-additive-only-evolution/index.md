---
name: 0010-additive-only-evolution
kind: adr
version: 1
title: Evolution is additive-only — never reduce, only extend or swap
summary: A contract surface is extended in place with a version bump or replaced by a successor carrying a supersedes edge; it is never narrowed, and no entity is ever deleted, moved or renamed.
status: review
owner: sergio-bershadsky
decision-status: accepted
date: "2026-08-19"
deciders:
  - sergio
relations:
  uses:
    - /product/portal/component/git-history
tags:
  - evolution
  - founding
---

## Context

Two founding choices, taken before this one, jointly removed every conventional
answer to "how does a described thing change".

The filesystem is the store
([0002-filesystem-is-the-database](srn://metaframework/adr/0002-filesystem-is-the-database)),
so there is no transaction, no migration runner and no write-time referential
integrity — nothing that could apply a coordinated change across the catalog and
roll it back. And history is git-backed: only current versions exist on disk, and
a pinned `@N` reference resolves through a version→commit index built from `git
log` (`docs/decision-record.md:70-75`). A store with those two properties cannot
tolerate reduction. A removed property is still referenced by whatever was
written against it; a renamed directory is a delete plus an unrelated create, and
the index that resolves pinned references does not follow it.

The founding record settled the rule in one clause — "additive-only principle;
never reduce, only extend, or create new and swap later" — and everything below
is that clause made mechanical.

## Decision

**A contract surface is never reduced.** It is extended in place, or it is
replaced by a successor entity that is swapped in. Every entity carries an
integer `version`, starting at 1 and incremented by exactly 1; any content change
to `index.md` or to any sibling artifact bumps it in the same commit, with a
change to `status` alone exempt because status is workflow state rather than
content. A change the additive rule forbids follows the swap procedure instead:
create the successor with its own name and a `supersedes` edge, migrate referrers
one at a time as ordinary additive changes, set the predecessor to
`status: deprecated` once nothing live points at it, and never delete it.
**Entities MUST NOT be moved or renamed.** Specified in
`framework/spec/evolution.md`.

## Consequences

- **"Additive" has a testable meaning per kind, not a vibe.** For a datamodel it
  is the instance-superset rule — version `N+1` MUST accept every instance `N`
  accepted — and `evolution.md` spells out eight verdicts rather than a
  principle: adding an optional property, adding an enum value and dropping a
  `required` entry are legal; renaming a property, making an optional one
  required, changing a type, removing a property and removing an enum value are
  illegal at any version number. For a protocol it is operations, messages and
  states; for an ADR it is the `## Decision` paragraph.
- **Consumers pay for it.** A reader MUST tolerate unknown properties and unknown
  enum values in instances of a later version than it pinned. The rule moves cost
  from the writer to every reader, permanently.
- **Deprecation replaces deletion, and it is terminal.** A superseded entity stays
  on disk forever, rendered greyed with a derived `superseded-by` pointer; new
  references to it raise `W_REF_DEPRECATED`. There is no un-deprecate — reviving a
  concept is a new entity that supersedes the deprecated one.
- **The rule reaches into how git is invoked.**
  `framework/portal/src/lib/history/git.ts:36` pins `-c log.follow=false` on every
  invocation, with the reason in the file: evolution.md forbids moving an entity,
  the version→commit index does not follow renames, and a user's global
  `log.follow = true` would silently change what a pinned `@N` resolves to. A spec
  rule that appears as a flag on a subprocess is the strongest form this
  framework has.
- **The decision record obeys its own rule, visibly.** `docs/decision-record.md`
  is append-only: five dated amendments, each retiring a previous rule with a
  `> Retired by …` blockquote rather than an edit. The founding body still carries
  statements later amendments falsified — line 58 still reads "`$id` = versioned
  SRN", which
  [0005](srn://metaframework/adr/0005-relative-path-schema-refs-without-id),
  [0006](srn://metaframework/adr/0006-dereferenceable-schema-urls) and
  [0007](srn://metaframework/adr/0007-canonical-schema-host-and-x-srn-restored)
  falsified in turn. Reading it top to bottom is reading three wrong answers
  before the fourth.
- **The schema-identity chain is this rule's worked example.** Four decisions
  about one artifact keyword in one day, three of them reversed, and not one
  `## Decision` paragraph edited into its opposite. Each reversal is a new record
  with a `supersedes` edge; the portal walks the derived inverse to render the
  lineage on all four. That is the whole cost of the rule and the whole benefit,
  in one bucket.
- **Almost nothing enforces it, and the inventory matters more than the
  principle.** `E_VER_REGRESSION` is implemented at
  `framework/portal/src/lib/history/git.ts:654` with its own tests
  (`git.test.ts:290`), but it is **never run over `solutions/`** — the module's
  suite uses hermetic fixtures and `fixture-check.test.ts` does not call it.
  Nothing compares a schema against its predecessor, nothing compares a
  frontmatter contract against its predecessor, and nothing detects a deleted
  directory at all. `docs/decision-record.md` being append-only is enforced by no
  test, no lint and no hook. The rule is held by author discipline and by the
  authoring kit's
  [entity-evolution](srn://metaframework/product/authoring-kit/component/entity-evolution)
  skill.
- **The spec has already broken it twice, and the breaches are recorded rather
  than repaired.** Commit `5b8a3e8` bumped `index.md` 3→5, `srn.md` 3→5,
  `evolution.md` 2→4 and `frontmatter.md` 2→4 in one commit, so `index.md@4`,
  `srn.md@4`, `evolution.md@3` and `frontmatter.md@3` exist in no commit and the
  version→commit index cannot resolve them. Commit `bae08e4` changed 132 lines of
  `srn.md` leaving `version: 1`; `4aa3f68` changed `frontmatter.md` and
  `structure.md` leaving both at 1. Fixing either would require rewriting history,
  which is the violation this rule exists to prevent.
- **One bulk relocation has been performed, and it is the rule's only breach in
  the catalog.** Commit `522c6bb` moved 45 entities and re-emitted 118 references
  in the same commit
  ([0008-fully-bucketed-srn-paths](srn://metaframework/adr/0008-fully-bucketed-srn-paths)).
  It was a change to the SRN grammar itself rather than to any described system,
  which is the only category of change the rule has no move for — the swap
  procedure operates on entities, and a grammar is not one.
- **This ADR set is itself an artifact of the rule and of its edge.** These
  records were written after the decisions they describe, so 0004 and 0005 are
  born at `version: 1` with `decision-status: superseded`.
  `framework/spec/kinds/adr.md` requires a version bump when `decision-status`
  *moves*; here it never moved, and a `version: 2` would name a commit that does
  not exist. The rule about versions is a rule about history, and a record with no
  history has none to state.

## Alternatives considered

- **Semantic versioning.** Rejected: semver's whole purpose is to make a breaking
  change expressible, and this framework's position is that a breaking change to a
  described entity is a *different entity*. A major-version bump would also break
  the SRN, where `@N` is a plain monotonic integer and the version→commit index
  maps one integer to one commit.
- **Migrations, up and down.** Rejected: there is no runner, no transaction and
  no write path — the portal is a read-only renderer over the tree. A migration
  would have to be a commit that rewrites files, which is what the swap procedure
  already is, minus the pretence that it can be reversed.
- **Allow renames with an alias or redirect table.** Rejected on two grounds. The
  table is committed state that can go stale, and the first thing a reviewer would
  have to learn is to distrust it
  ([0002](srn://metaframework/adr/0002-filesystem-is-the-database) rejects an
  index sidecar for the same reason). And SRN, disk path and schema URL are one
  identity in three views, so a move silently changes all three at once — the
  `$id` derived from the new path would have to be rewritten in every historical
  commit for the old snapshots to stay true.
- **Delete deprecated entities after a grace period.** Rejected: a pinned `@N`
  reference resolves through git, so a deleted entity's history survives while its
  address does not, and the reader is left with a dangling reference whose target
  demonstrably once existed. Keeping the directory costs bytes; removing it costs
  the property the framework is built on.
- **Enforce the rule in CI.** Not rejected — *unbuilt*. There is no CI in this
  repository, by the same posture that produced
  [0011-no-cli-in-v1](srn://metaframework/adr/0011-no-cli-in-v1): the only
  integrity gate is the portal's own diagnostics page, and the diff that would
  catch a reduction is a comparison against a predecessor that no loader
  currently performs.
