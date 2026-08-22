---
name: 0001-skills-organised-by-activity
kind: adr
version: 4
title: Organise the skills by activity, not by entity kind
summary: Skills are cut by what the author is doing — design, add, evolve, validate, review — because one skill per kind would make seven skills fight over the same trigger phrases.
status: review
owner: sergio
decision-status: accepted
date: "2026-08-19"
deciders:
  - sergio
relations:
  uses:
    - ../../component/plugin
tags:
  - plugin
  - decomposition
---

## Context

A Claude Code skill is selected by its `description`, which is written as a list
of trigger phrases a model is expected to match against a user's request. Nothing
routes; matching is the routing.

The catalog has nine kinds, and the obvious cut is one skill per kind. It has an
appealing symmetry: the specification is already organised that way — one
document per kind under `framework/spec/kinds/` — and each kind has its own
frontmatter fields and its own rules.

The competing observation is that the *work* does not divide that way. "Add a
component", "add an actor" and "add a requirement" are the same nine-step
procedure with different required fields. "Design the whole tree", "change
something published" and "audit what exists" are genuinely different jobs that
each span every kind.

## Decision

The skills are cut by **activity**. Seven of them:
`solution-design` (before any file exists), `add-entity`, `model-data` and
`protocol-design` (write one entity), `evolve-entity` (change one that already
exists), `validate-catalog` (is it legal), `review-solution` (is it any good).

Kind only splits a skill where the kind brings its own artifact contract:
`model-data` owns `schema.json` and `protocol-design` owns `transport.yaml`,
`states.json` and `workflows/`, which is why `add-entity` explicitly disclaims
those two and covers the other seven kinds. The dispatch rule lives in one place,
`commands/entity-new.md`, as a three-row table.

## Consequences

- Trigger phrases stay disjoint. `commands/entity-new.md` routes by kind in three
  rows, and `marketplace/README.md` can state the whole seam in two sentences:
  the three creation skills are disjoint by kind, the two audit skills disjoint
  by question.
- The expensive activities got a home they would not have had otherwise.
  `evolve-entity` is a skill plus a swap walkthrough covering a
  procedure that touches every kind; under a per-kind cut that procedure would
  have been copied nine times or omitted eight.
- The cost lands on `add-entity`. One skill carries seven kinds' frontmatter
  contracts and required prose, and it is the file most likely to go stale when a
  kind document changes. Its `worked-examples.md` exists because a single
  procedure covering seven kinds is not readable without one worked instance per
  kind. This record was written against a 255-line `SKILL.md` and a 612-line
  `worked-examples.md`; measured 2026-08-22 by `wc -l` they are **527** and
  **1,148**, so the cost this bullet priced has roughly doubled on both halves
  and the bullet reads more strongly now than when it was filed.
- The catalog does not model the cut as component boundaries. A skill cannot
  ship, version, fail or be owned apart from the plugin that carries it, so this
  solution models the whole deliverable as one component,
  [plugin](srn://metaframework/product/authoring-kit/component/plugin), and the
  activity cut lives there as a table in the prose — with this decision as the
  record of why the rows are what they are.
- Nothing enforces the disjointness. Trigger-phrase overlap is a property of
  prose, and no test in this repository reads a `description` field. If two
  skills start competing, the symptom is a model picking the wrong one, and there
  is no mechanism that would report it.

## Alternatives considered

- **One skill per entity kind.** Considered and rejected, verbatim from commit
  `dada3ba` (2026-08-19 21:19): the skills were organised "by activity rather
  than by kind — one skill per entity kind was considered and rejected, because
  the skills would then fight over the same trigger phrases while none of them
  owned an actual task." Nine skills would each have had to describe adding,
  changing, validating and reviewing their kind, and every one of them would have
  matched "add a thing to the catalog".
- **One skill for everything.** Rejected on size before it was rejected on
  design: a single file carrying the interview, seven frontmatter contracts,
  three artifact formats, the swap procedure and the review checklist would be
  loaded in full for a request that needed one paragraph of it. The figure filed
  with this record was 4,079 lines, and it did not say which population it
  counted. Measured 2026-08-22 by
  `find marketplace/plugins/metaframework/skills -type f -exec wc -l {} +`, the
  whole skills directory is **13,880** lines, **8,541** of them outside
  `_shared/`. Either reading argues the point harder than the original did.
- **A skill per artifact format** — one for `schema.json`, one for
  `transport.yaml`, one for workflows. Rejected because an author does not set
  out to write a transport binding; they set out to describe a protocol, and the
  artifacts come with it. `protocol-design` keeps all three together and pushes
  the formats into `references/artifacts.md`.
