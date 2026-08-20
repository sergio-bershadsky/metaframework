---
name: architecture-review
kind: component
version: 2
title: Architecture review
summary: One question — is this a good description of this system? — delivered through two surfaces, an inline skill and a read-only agent, that are not equivalent.
status: review
owner: sergio
component-type: library
lifecycle: released
relations:
  uses:
    - ../reference-bundle
tags:
  - review
  - judgement
---

`skills/review-solution/SKILL.md` (156 lines) + `references/review-checklist.md`
(352) + `references/writing-the-review.md` (100), plus
`agents/catalog-reviewer.md` (99). One responsibility: **answer the question the
checker cannot.**

The skill states the split with
[catalog-validation](srn://metaframework/product/authoring-kit/component/catalog-validation)
in its own words: the portal's check "proves the tree parses, the frontmatter
validates, the references resolve and the schemas load. It cannot tell that a
component does three unrelated jobs, that a protocol drifted away from its
participants, or that a vocabulary was copied instead of referenced."

## Read-only, and it says so twice

"This skill is read-only. It produces findings, not edits." The agent repeats it:
"You are read-only. Never edit files." When a finding is accepted, the change is
handed to
[entity-evolution](srn://metaframework/product/authoring-kit/component/entity-evolution),
because most structural fixes are swaps.

That is why every finding must carry a **mechanism** —
`references/writing-the-review.md`: "Always state the mechanism, because the cost
is the decision." A recommendation that reads like a five-minute edit and is
actually thirteen swaps is a worse output than no recommendation.

## Six steps, and the two that carry the judgement

Check legality first, read the solution's charter (`vision`, `scope.in`,
`scope.out` — a catalog that drifted outside its own stated scope is the first
finding and outranks every graph nit), collect facts, verify each candidate,
apply the judgements no script makes, rank and report.

Step 5 is the part no tool reaches: components that always change together
(co-change counted from git, "nine shared commits out of ten means the boundary
between them is imaginary; nine out of ninety is ordinary collaboration"),
components doing several unrelated jobs (a `summary` that needs an "and" to be
true; a name like `core`, `common`, `shared`, `platform` or `manager`),
cross-cutting concerns copied rather than referenced, decisions with no ADR, and
twin entities whose summaries cannot be told apart.

Ranking is fixed and is by consequence for a reader, not by ease of fix: scope
and truth, structural, graph, modelling, hygiene. And "a clean audit is a real
result. Say the catalog is in good shape when it is, and do not pad the list to
look thorough."

## Two surfaces that are not interchangeable

The skill runs inline; the agent runs as a background subagent for a second
opinion on a large catalog. They share both reference documents and ask the same
question — but they are not equivalent, and keeping them in one component is what
makes the difference visible instead of hiding it.

`agents/catalog-reviewer.md` declares `tools: Read, Grep, Glob`. **No Bash.** The
skill's Step 3 is `python3 …/catalog_facts.py solutions/<name>`. The agent
therefore cannot run
[catalog-facts](srn://metaframework/product/authoring-kit/component/architecture-review/component/catalog-facts)
and performs the same audit by grep alone, from a checklist it is told to read
"rather than re-deriving it". Anyone dispatching the agent expecting the skill's
evidence base gets a weaker one, and nothing in the plugin says so.

## What it does not do

It does not validate syntax, it does not propose diffs, and it does not persist.
A review exists as a message in a conversation; nothing writes it into the
catalog, so a catalog carries no record of ever having been reviewed. The
`R_ADR_ABSENT` heuristic is the closest the kit comes to noticing that decisions
went unrecorded, and it "only catches the crudest case".
