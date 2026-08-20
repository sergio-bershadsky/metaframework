---
name: review-first-change
kind: requirement
version: 2
title: A change to a described system is reviewed as a diff before it lands
summary: The file diff is the review surface; a change to the catalog should be read and judged before it is merged, and today nothing makes that happen.
status: review
owner: sergio-bershadsky
requirement-type: non-functional
priority: should
tags:
  - process
  - gap
---

`framework/spec/index.md` puts review-workflow tooling out of scope on a stated
ground: "review is git-native: files are the review surface". That is a real
design position, not an evasion — it is why acceptance criteria are a markdown
list rather than a YAML block (a list produces a commentable diff; a nested block
scalar produces a re-indentation diff nobody can read), why the portal is
read-only, and why
[0012-review-is-git-native](srn://metaframework/adr/0012-review-is-git-native)
exists.

The position implies an obligation: if the diff is the review surface, then a
change to a described system is read by someone before it lands. This requirement
states that obligation so that the distance between it and the repository is on
the record and dated.

## Acceptance criteria

- **AC-1** Every change to `solutions/` is readable as a file diff.
  - No part of a catalog's state lives anywhere a `git diff` cannot show it — no
    database, no generated index committed alongside, no binary format.
- **AC-2** A change is read by someone other than its author before it reaches the default branch.
  - Where author and reviewer are the same person, it is read as a diff in a
    separate pass before it is committed.
- **AC-3** A change that breaks the catalog is visible in the same pass: the reviewer can see the diagnostics the change produces without leaving the review.
- **AC-4** The record of what was decided and why arrives with the change, not after it. A structural change lands with the ADR that binds it.

## What enforces this

Nothing, and this is the honest inventory:

- No `.github/` directory. `ls .github` fails.
- No CI configuration of any kind, anywhere in the tree.
- No `CODEOWNERS`, no pull-request template, no branch-protection artefact
  committed to the repository.
- 52 commits, one author, **zero merge commits**. Branching is practised — there
  is a second branch and a remote — but no review artefact exists in-repo.

So AC-1 holds by construction and is the only one that does. AC-2 is currently a
person reading their own diff. AC-3 requires the reviewer to remember to open
[diagnostics-report](srn://metaframework/product/portal/component/console/component/diagnostics-report),
which nothing prompts them to do. AC-4 held for this repository's structural
change — commit `522c6bb` carried its own rationale in the commit body — but the
decision never reached `docs/decision-record.md`, which is exactly why it is
being recorded now as
[0008-fully-bucketed-srn-paths](srn://metaframework/adr/0008-fully-bucketed-srn-paths).

## Why `should` and not `must`

Because a `must` this repository cannot satisfy at any moment would be a false
claim about a two-person process that has one person in it. The obligation is
real and the priority is honest: the solution ships without it, under protest,
with the workaround stated — one author, reading their own diffs, running the
tests by hand.

Demoting it to `wont` would be worse. This is not a declined non-goal; it is an
unmet obligation, and the difference matters to whoever picks this repository up.

## Out of scope

Review *quality*. What makes a description good rather than merely legal is the
subject of the `review-solution` skill on the authoring kit's
[plugin](srn://metaframework/product/authoring-kit/component/plugin)
component and its 562-line checklist. This requirement is only about the loop
existing.
