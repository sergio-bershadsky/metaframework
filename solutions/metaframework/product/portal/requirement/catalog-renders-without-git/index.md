---
name: catalog-renders-without-git
kind: requirement
version: 1
title: The catalog renders without git, and says why the past is missing
summary: A tarball, a shallow clone, or an image with no git binary must still render every entity and name the reason history is unreachable.
status: review
owner: sergio
requirement-type: non-functional
priority: should
relations:
  uses:
    - /environment/local
tags:
  - degradation
  - history
---

# The catalog renders without git, and says why the past is missing

History is an **enrichment**, not a precondition. The current state of every
entity is on disk; only the past requires git. So the absence of git must
degrade the portal rather than break it, and the degradation must be legible —
a reader who cannot see version 2 of a document is entitled to know whether the
binary is missing, the directory is not a repository, or the entity simply has
not been committed yet.

`priority: should` rather than `must`, honestly: the portal's normal deployment
target is a git working tree, and
[0009-git-backed-history](srn://metaframework/adr/0009-git-backed-history)
records `.git` must be present where the portal runs as a consequence it
accepts. This requirement is the guarantee for the cases where it is not.

## Acceptance criteria

- **AC-1** No function in `lib/history/git.ts` throws. Every failure returns a value.
- **AC-2** Every failure is classified into exactly one of four reasons: `no-git-binary`, `not-a-repository`, `not-committed`, `git-error`.
- **AC-3** With git unavailable, every catalog route still renders: entity pages, the tree, `/diagnostics` and the map depend on the loader and not on history.
- **AC-4** An entity page under those conditions states the reason rather than showing an empty history control or a silent absence.
- **AC-5** A truncated log suppresses `E_VER_REGRESSION` rather than reporting a regression at an invisible boundary.

## Rationale

AC-2 is the criterion the entity exists for. Four named reasons turn "history
did not load" into a describable outcome set, which is also why
[git](srn://metaframework/actor/git) is modelled as an actor at all: an
unnamed dependency produces unnamed failures.

AC-5 comes from a real edge in the code. The version→commit index reads at most
200 commits; if the log is capped, the oldest visible revision has no
predecessor, and comparing against nothing would manufacture a diagnostic out of
the cap.

## What is unverified

AC-1, AC-2 and AC-5 are covered by `src/lib/history/git.test.ts`. **AC-3 and
AC-4 are not tested by anything** — they are claims about rendering, and this
portal has no component or end-to-end tests. Nobody has run the portal in an
image without a git binary; the claim rests on reading the code, which is
exactly the kind of claim this catalog is supposed to flag rather than assert.
