---
name: catalog-author
kind: actor
version: 1
title: Catalog author
summary: The person who writes index.md, schema.json, workflows and states.json — and the named beneficiary of the portal's diagnostics page.
status: review
owner: sergio
actor-type: human
goals:
  - Place an entity where it will never need moving, because moving it is a swap.
  - See every rule my catalog breaks, with the file and the fix, without reading the loader.
  - Change a published contract without silently narrowing it.
  - Write a description a colleague and a model can both act on.
relations:
  uses:
    - /product/authoring-kit/component/commands
    - /product/portal/component/console/component/diagnostics-report
tags:
  - authoring
  - human
---

# Catalog author

Whoever writes the files: `index.md` with its frontmatter, `schema.json` for a
datamodel, `workflows/*.yaml` and `states.json` for a protocol. Not a role that
exists elsewhere and happens to touch the catalog — the catalog **is** the
artifact, and this actor is the one who produces it.

In this repository that is one person. 52 commits, one author (Sergey
Bershadsky), every one dated 2026-08-19; `git log --format=%ad --date=short |
sort -u` returns exactly one line. The two catalogs written so far —
`solutions/acme` (99 entities) and `solutions/brass` (98) — are the whole
evidence of use.

## Why this actor and `reviewer` are not the same entity

They differ by tense, and normally that would be a reason to fold them together.
They are kept apart because the affordances differ: this actor writes and is
blocked by `E_SRN_PLACEMENT`;
[reviewer](srn://metaframework/actor/reviewer) reads and is served by a shareable
`?v=N` link and a one-hop graph. What is *not* claimed is that two people exist.
Today one person holds both roles, and the description says so rather than
implying a team.

## The affordance that exists for them

`/diagnostics` is the one. Its own docstring says why: "With no CLI in v1, this
page IS the integrity gate." There is no validator binary, no pre-commit hook and
no CI, so the entire mechanical feedback loop for this actor is either the portal
page or the vitest suite behind it —
`cd framework/portal && npx vitest run src/lib/catalog`.

The [authoring-kit](srn://metaframework/product/authoring-kit) is the other half
of the loop, and it is aimed at this actor only indirectly: the skills are
written as trigger phrases for a model, so a human reaches them by asking a model
to do the work. `/entity-new`, `/solution-new` and `/catalog-check` are the
surface a human types.

## What the framework asks of them that it cannot check

A great deal, and it is worth listing because the list is the honest measure of
how much of this framework is discipline. The four required ADR headings
(`E_ADR_SECTIONS`), the requirement's `## Acceptance criteria` section
(`E_REQ_CRITERIA`), `primary-actors` resolving to real actors
(`E_PROD_ACTOR_TARGET`), a `library` not declaring an environment
(`E_COMP_LIBRARY_ENVIRONMENT`), protocol NCA placement
(`W_STRUCT_PROTOCOL_NCA`) — all specified, none implemented. Above all, the
additive-only rule: nothing in the repository compares an entity against its
predecessor, so a narrowing edit and a `git mv` both pass the check.

## Boundaries

The author is never a component. What is described here is the surfaces they
touch, never their process — there is no issue tracker, no assignee field and no
sprint in this ontology, deliberately.

Participation is declared on the protocol side, and this actor is named in no
protocol's `participants` list. The two protocols in this solution
([schema-serving](srn://metaframework/product/portal/component/schema-service/protocol/schema-serving)
and
[catalog-history](srn://metaframework/product/portal/protocol/catalog-history))
are machine-to-machine conversations; a human writing a file is not a message on
a wire, and inventing a protocol to make this actor look wired would be worse
than the gap.
