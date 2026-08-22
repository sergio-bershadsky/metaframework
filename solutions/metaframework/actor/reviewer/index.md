---
name: reviewer
kind: actor
version: 2
title: Reviewer
summary: The person who opens the catalog to learn what the system currently is, and to judge whether a proposed change is an improvement.
status: review
owner: sergio-bershadsky
actor-type: human
goals:
  - Learn what a system currently is without reading its source, and without asking whoever built it.
  - Find the decision that explains a structure, from the structure, in one hop.
  - Judge a change by reading its diff, and see whether the change broke the description.
  - Be told which rules a catalog breaks, with the file and the fix, before anything is merged.
relations:
  uses:
    - /product/portal/component/console
tags:
  - human
  - review
---

The reader the portal is aimed at. Two reading modes, one person: *what is this
now*, and *is this change right*. They are folded into one actor deliberately —
see below — and the goals list carries both.

Almost every design choice in
[portal](srn://metaframework/product/portal) answers a question this actor asks.
The one-hop neighbourhood graph exists because "what does this touch and what
touches it" is the question a reviewer opens a component page to answer, and a
whole-solution graph answers none. The `?v=N` historical view lives in the URL
rather than in component state so that a reviewer can send the link. The sequence
diagram's SVG is marked decorative and the ordered list beneath it *is* the
diagram in words, because a picture the catalog cannot state in prose is a
picture the catalog cannot review. The schema lineage panel exists only to
rebuild the one fact Stoplight's `allOf` flattening drops — which ancestor a
field came from — because that is the fact a reviewer of a schema change needs.

## Why this is not two actors

An earlier cut had `portal-reader` (understand the current state) separate from
`reviewer` (judge a change against it). The goals differ only in tense. In a
repository with one author, zero merge commits and no review artefact of any
kind, splitting them would model an organisation that does not exist and would
produce two actor pages a reader could not tell apart. One actor, both reading
modes.

## The loop this actor is supposed to close, and does not

There is no pull-request template, no `CODEOWNERS`, no `.github/` directory at
all, and no CI check. `git log --merges` returns nothing.
So the review loop today is one person reading a diff in their own working tree,
and the only mechanical help they get is
[diagnostics-report](srn://metaframework/product/portal/component/console/component/diagnostics-report),
which they must remember to open.

That gap is recorded as a requirement rather than left implicit —
[review-first-change](srn://metaframework/requirement/review-first-change) — so
that the absence is on the record and dated, not discovered later by someone
assuming the loop exists.

## Not an author

The person who writes `index.md` is
[catalog-author](srn://metaframework/actor/catalog-author). In this repository
they are the same human on the same day; they are separate entities because the
affordances differ — the author needs the diagnostics page and the authoring
kit's skills, the reviewer needs the history, the diagrams and the diff. When
this description says "reviewer", it means the reading posture, not a second
body.
