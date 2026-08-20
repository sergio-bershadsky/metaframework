---
name: 0009-srn-only-prose-linking
kind: adr
version: 1
title: Only an SRN becomes a link
summary: Prose linking matches SRNs and nothing else — a bare entity name is never auto-linked, because a false link is worse than no link in a document people review.
status: review
owner: sergio
decision-status: accepted
date: "2026-08-19"
deciders:
  - sergio
relations:
  uses:
    - /product/portal/component/console/component/entity-view
    - /product/portal/component/console/component/artifact-viewer
tags:
  - portal
  - navigation
---

# Only an SRN becomes a link

## Context

Entity prose refers to other entities constantly, and a catalog whose references
do not navigate is a catalog nobody follows. Commit `3c39c20` (2026-08-19 13:51)
made every entity reference navigate, and had to decide what counts as a
reference.

The generous reading is to match names: the catalog knows all 197 entity names,
so any occurrence of `payment` in a paragraph could become a link. The generous
reading is also how a wiki accumulates lies — `payment` is a component here and
an ordinary English word everywhere else, and the reader cannot tell an inferred
link from an authored one.

## Decision

Only an SRN becomes a link. `mentions.ts` matches
`srn://…` with an optional `@N` pin anywhere in free text, and
`markdown.tsx` turns each hit into a kind-coloured `EntityLink` badge — whether
it was written as a markdown link or dropped bare into a sentence. Nothing else
is linked. The rule extends past prose: kind-specific frontmatter values that
resolve to an entity link themselves, and `monaco.ts` registers a link provider
for `srn://` and canonical schema URLs inside the YAML and JSON editors.

## Consequences

- **Authors get linking for free with no second syntax.** The framework already
  requires references to be SRNs; writing one in a sentence is now enough, and
  there is nothing to keep in sync.
- **A dangling reference is visible instead of silent.** An SRN that resolves to
  nothing renders as a visibly broken badge carrying the reference as authored —
  "a dangling reference is exactly the thing a reviewer needs to see" — rather
  than degrading to plain text where it would read as prose.
- **Prose gets long.** Every reference is spelled in full, so paragraphs in this
  catalog carry 60-character addresses inline. That is the cost of exactness, and
  it is paid on every page.
- **A reader who writes a name gets nothing**, with no warning. There is no
  diagnostic for "this paragraph mentions an entity by name and does not link
  it"; the failure is silent by design, because the alternative failure is a
  wrong link.
- **Prose links are navigation only and never edges.** The relation graph is
  built from frontmatter `relations` alone, per the spec. So a paragraph may
  legitimately reference an entity the graph does not connect — and this catalog
  does exactly that in places.
- **The rule surfaced a bug that had made every such link dead.**
  react-markdown's `urlTransform` was blanking every `srn://` href, so those
  links had never worked; `markdown.tsx` now passes an `allowSrnUrls` transform
  that permits the scheme while still blocking `javascript:` and `data:`.

## Alternatives considered

- **Match bare entity names against the catalog.** Rejected in the commit body
  itself: "matching bare entity names would be guesswork … and a false link is
  worse than none in a document people review." The failure is not merely a bad
  link — it is a link that looks authored.
- **A dedicated wiki syntax, `[[payment]]`.** Unambiguous and short. Rejected
  because it is a second reference syntax in a framework whose central claim is
  that there is exactly one: the SRN is the reference form in frontmatter, in
  schema `$ref`s, in workflow YAML and in prose, and a shorthand that resolves
  differently would fork it.
- **Link only explicit markdown links, `[payment](srn://…)`.** Rejected as
  ceremony that buys nothing: the SRN is already unambiguous wherever it appears,
  so requiring the bracket form would only mean some references navigate and some
  do not, for reasons a reader cannot see.
