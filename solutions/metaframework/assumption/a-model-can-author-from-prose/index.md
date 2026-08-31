---
name: a-model-can-author-from-prose
kind: assumption
version: 1
title: A model can author a correct catalog from prose alone
summary: The distilled specification is enough for an agent to place, name and wire an entity correctly, with no parser and no schema of its own.
status: approved
owner: sergio-bershadsky
standing: holding
review-by: "2026-12-01"
tags:
  - founding
  - readability
---

The framework is a set of rules written as English with tables in it. Nothing
ships a machine-readable grammar of those rules — no JSON Schema for frontmatter
that an agent could validate against, no parser it could import. The authoring
kit is prose, and it exists because a model is expected to read prose and act on
it correctly.

## Basis

The [authoring-kit](srn://metaframework/product/authoring-kit) is the standing
evidence: a distilled reference a model reads instead of the repository, and
seven skills written as procedures rather than as code. It has been used to
author entities in this catalog, and the checker agreed with the result. That is
the whole of the evidence — a working instance, not a measurement.

The weaker half is that no negative case has been tried. Nobody has handed the
kit to a model with no prior context, on a catalog it has never seen, and
counted what it got wrong. Until that happens this is a belief with a supporting
anecdote, which is why its standing is `holding` rather than `unverified`, and
not higher.

## If this is false

The authoring kit has to ship a parser, and the framework acquires a second
representation of its own rules — the prose a human reads and the grammar a
machine reads — which then have to be kept in step. That is the failure the
distilled-copy machinery already exists to fight on a smaller scale, and it
would arrive at the centre of the design rather than at its edges.

The rules themselves would also have to change shape. A rule stated as "the
nearest common ancestor of its participants" is precise for a reader and
ambiguous for a validator; every such rule would need a mechanical restatement,
and the ones that resist it would have to be dropped or narrowed.

[human-and-ai-readable](srn://metaframework/requirement/human-and-ai-readable)
is the requirement that rests on this most directly: AC-6 is the claim, and this
is the belief underneath it.
