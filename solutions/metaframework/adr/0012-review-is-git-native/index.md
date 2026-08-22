---
name: 0012-review-is-git-native
kind: adr
version: 2
title: Review is git-native and the portal is read-only
summary: Files are the review surface; the portal presents the catalog and never edits it, so no review workflow is built into the tool.
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
  - process
  - founding
---

## Context

Once the catalog is files
([0002-filesystem-is-the-database](srn://metaframework/adr/0002-filesystem-is-the-database)),
there are two places a change can be argued over: in the files, through the
repository's ordinary review mechanics, or in the portal, through a workflow the
portal owns — proposals, comments, approvals, an edit surface, a state machine
per change.

The second is what most modelling tools build, and it is how a modelling tool
acquires a database, an auth story and a permission model on the way to
describing anything.

## Decision

Review is git-native: **files are the review surface, and the portal is read-only
presentation.** The portal never writes to `solutions/`. There is no proposal
object, no comment thread, no approval state and no edit form. `status:
draft | review | approved | deprecated` on an entity is the only workflow signal
the framework carries, and it is a field in a file like any other.

## Consequences

- **The portal has no write path at all**, so it needs no authentication, no
  authorisation, no session and no user model. That is a large amount of
  software this catalog does not contain, and it is why the whole tool is a
  loader plus a renderer.
- **Formats were chosen for the diff.** Acceptance criteria are a markdown list
  under a pinned heading rather than a YAML block inside frontmatter, explicitly
  because a list produces a clean commentable diff and a nested block scalar
  produces a re-indentation diff nobody can read. The same reasoning keeps
  frontmatter flat.
- **Reading the past is still the portal's job**, and it does it by reading git
  rather than by keeping its own revisions: the version picker resolves `?v=N`
  through a version→commit index, server-side, with the version in the URL so a
  historical view is shareable. Presentation of history is not a review workflow.
- **A historical page is deliberately partial.** `HIDDEN_AT_HISTORICAL` omits
  inbound edges, the neighbourhood graph, contents, artifacts and loader
  diagnostics, because all of those are derived from *other* entities' current
  state and would be a lie at an old revision. Only what the document itself
  authored is reconstructed.
- **The obligation this decision creates is met by nothing.** There is no
  `.github/`, no `CODEOWNERS`, no pull-request template and no CI, and
  `git log --merges` returns nothing. "Git-native review" currently means one person
  reading their own diff, and that gap is recorded as
  [review-first-change](srn://metaframework/requirement/review-first-change)
  rather than left to be discovered.
- **A portal-native review workflow is on the deferred list**, along with
  cross-solution sharing and an extensible ontology. Deferred, not rejected — but
  nothing in this repository is working toward it.

## Alternatives considered

- **A portal-native review workflow** — proposals, comments, approve/reject, an
  edit surface. Rejected at the founding and deferred: it requires the portal to
  own writable state, which contradicts the read-only renderer position and would
  make the tool the authority over content that is supposed to live in git. It is
  also the point at which a description tool starts needing an operations story.
- **A review status machine in frontmatter** — richer than
  `draft/review/approved/deprecated`, with reviewer handles and dates. Rejected:
  it duplicates what the version-control system already records more reliably,
  and a hand-maintained approval field drifts from who actually read the diff.
- **Comment anchors in the catalog files themselves.** Rejected: review
  conversation is not catalog content, it is bounded in time, and putting it in
  the tree would make every entity accumulate the argument that produced it. What
  survives the argument is an ADR, which is a first-class entity precisely for
  that reason.
- **Requiring an ADR per change, enforced.** Considered and not taken: there is
  no mechanism to enforce it without the CI this repository does not have, and
  most changes are prose corrections. It survives as a `should` inside
  [review-first-change](srn://metaframework/requirement/review-first-change).
