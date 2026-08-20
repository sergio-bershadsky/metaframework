---
name: 0009-git-backed-history
kind: adr
version: 1
title: History is git-backed; only current versions exist on disk
summary: A pinned @N resolves through a version→commit index built from git log, not through in-tree snapshots — which makes git a runtime dependency and history only as good as the commits.
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
  - history
  - versioning
  - founding
---

# History is git-backed; only current versions exist on disk

## Context

Once the catalog is files
([0002-filesystem-is-the-database](srn://metaframework/adr/0002-filesystem-is-the-database))
and every entity carries an integer `version` that a reference may pin with
`@N`, something has to be able to produce version 2 of a document whose
filesystem copy is at version 5.

Three places could hold it: the tree itself (`order-v1/`, `order-v2/`, or a
`versions/2/index.md` subdirectory), a revision store the portal owns, or the
version-control system the files already live in. The first two both mean the
same thing in practice — the catalog contains several copies of one entity and
something has to say which is live.

## Decision

History is git-backed. **Only current versions exist on the filesystem**;
`grep` and the file tree always show latest, and every historical read is a
`git show`. The portal builds a **version→commit index** per entity by walking
`git log` over its `index.md`, oldest to newest, recording for each `version`
number the *last* commit that carried it. Resolving `@N` reads the filesystem
when `N` is current and that commit otherwise; `E_SRN_VERSION` when neither.

Stated in `docs/decision-record.md:72` at the founding and specified in
`framework/spec/evolution.md` §"Git-backed history"; implemented in
[git-history](srn://metaframework/product/portal/component/git-history).

## Consequences

- **`.git` is a runtime dependency of the portal, and unshallowness is part of
  the contract** (`evolution.md:189`). The mitigation is a requirement rather
  than a fallback:
  [catalog-renders-without-git](srn://metaframework/product/portal/requirement/catalog-renders-without-git)
  makes history an enrichment that must degrade legibly into one of four named
  reasons, never an exception.
- **"Last commit wins" is a spec rule made executable.** A commit that changes
  only `status` does not bump `version`, so an unpinned reader and a reader
  pinned to `@N` must both see the final state of that version rather than its
  first appearance. Building the index oldest-first is the whole implementation
  of that sentence.
- **`E_VER_REGRESSION` exists only because history does.** A version that
  decreases or jumps by more than one between consecutive revisions is
  detectable from nowhere else — and it is suppressed when the 200-commit log
  cap truncated the log, because a regression at an invisible boundary is an
  artefact of the cap.
- **Renames became forbidden.** The index is built from a path filter, so a
  moved entity's past is unaddressable. That rule was broken exactly once, on
  purpose, and the bill is itemised in
  [0008-fully-bucketed-srn-paths](srn://metaframework/adr/0008-fully-bucketed-srn-paths).

### What a reader can actually reach

The version badge is the control. `VersionPicker`
(`framework/portal/src/app/(console)/catalog/[...srn]/page.tsx:167`) turns it
into a dropdown of the versions git knows about, and selecting one navigates to
`?v=N` — server-rendered, so a historical view is a shareable link rather than
client state.

Two things that are built are not reachable at all:

- **Commit-level history has no entry point.** `/api/history` is live and
  serves four operations
  ([history-service](srn://metaframework/product/portal/component/history-service)),
  and the only code in `src` that fetches it is
  `components/history/history-panel.tsx`. `grep -rn HistoryPanel
  framework/portal/src` returns three hits, all inside that file's own
  definition, and nothing imports it. So the commit list, the file picker and
  the diff view exist and nothing renders them
  ([history-panel](srn://metaframework/product/portal/component/console/component/history-panel)).
- **A historical page is `index.md` only, which contradicts the spec.**
  `evolution.md:209` says "Sibling artifacts are read at the same commit as the
  `index.md` — an entity version is a snapshot of the whole directory."
  `loadSnapshot()` on the entity page sets `artifacts: []` and the page lists
  "artifacts and schema" in `HIDDEN_AT_HISTORICAL`, with a stated reason: files
  read from disk belong to the current revision and carrying them onto a
  historical page would date-mix. The reason is good; the spec has not been
  amended to match, and until it is, the shipped behaviour is a divergence and
  not a refinement. The founding record promised the opposite of both — "a
  previous-version button on every artifact" (`docs/decision-record.md:85`) —
  and no such button exists.

### History is only as good as the commits, and these commits are thin

Measured 2026-08-20 by walking `git log` per entity and parsing the frontmatter
`version` at each commit, over the 197 committed entities in `solutions/acme`
and `solutions/brass`:

- **183 of 197 entities have exactly one version reachable in git.** Fourteen
  have more than one; four of those have four. So on 93% of the committed
  catalog the picker degrades to a plain badge, which is the behaviour its own
  header comment prescribes — a dropdown with a single dead entry is a worse
  affordance than no dropdown.
- **28 entities, all of them in acme, cannot resolve a version below their
  earliest reachable one.** The tempting explanation is the bulk rename in
  `522c6bb`, and it is wrong: comparing each relocated entity's reachable
  version set under its old path with the set under its new one shows no entity
  lost a version there
  ([0008-fully-bucketed-srn-paths](srn://metaframework/adr/0008-fully-bucketed-srn-paths)).
  All 28 were **authored above version 1**. The acme fixture was written into
  `bae08e4` and `4c317b4` with `version: 2`, `3`, `4`, `5`, `7` already in the
  frontmatter — `solutions/acme/environment/production` was born at version 4
  and has never been anything else; `checkout` was born at 7. Those numbers were
  never a commit, so `@1` on any of them is `E_SRN_VERSION` and always has been.
  A version→commit index is only as truthful as the commits, and a catalog
  written with a plausible-looking version history it did not have is the one
  input this design cannot correct for.
- **This solution is not in the picker at all.** `git status --porcelain
  solutions` returns `?? solutions/metaframework/`: at the time of writing, the
  catalog describing this repository is untracked, so `getEntityHistory()`
  answers `not-committed` for every entity in it. That is the fourth
  degradation reason doing its job on the catalog that specified it.

The honest summary is that the mechanism is complete and the corpus it reads is
one day and 52 commits old. Nothing here is evidence that git-backed history
works at scale; it is evidence that it works.

## Alternatives considered

- **In-tree version directories** — `order-v1/`, `order-v2/`. Rejected at the
  founding and named in `evolution.md:185` as the litter this decision avoids.
  Every consumer would have to know which copy is live; `grep` over the catalog
  would return the same fact several times at several ages; and the SRN, whose
  whole claim is one entity one path, would address a family.
- **A `versions/` subdirectory inside each entity.** The same objection in a
  tidier package, plus a direct collision with
  [structure.md](srn://metaframework/product/specification/component/core-contracts):
  an asset subdirectory must not contain an `index.md` at any depth, and a
  snapshot is an `index.md`.
- **A revision store owned by the portal.** Rejected by
  [0002-filesystem-is-the-database](srn://metaframework/adr/0002-filesystem-is-the-database)
  and by
  [0012-review-is-git-native](srn://metaframework/adr/0012-review-is-git-native)
  together: it gives the read-only renderer writable state, and it puts the
  authoritative record of the past somewhere a reviewer cannot diff.
- **A libgit2 binding instead of the git CLI.** Rejected on scope: what the
  portal needs from git is `log` with a path filter, `show` of a blob, and
  `diff` — three commands that fit the CLI exactly — against a native build step
  in a Next.js application.
- **Keep only the current version and drop `@N` entirely.** Considered, and it
  is the cheapest option on this list. Rejected because a pin is what makes an
  additive-only contract reviewable: a referrer that says `/datamodel/money@1`
  is stating which shape it was written against, and without resolution that
  string is a comment.
