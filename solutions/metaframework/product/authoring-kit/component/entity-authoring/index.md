---
name: entity-authoring
kind: component
version: 2
title: Entity authoring
summary: One entity at a time — add-entity, model-data and protocol-design, selected by a single dispatch rule stated once in the entity-new command.
status: review
owner: sergio
component-type: library
lifecycle: released
relations:
  uses:
    - ../reference-bundle
tags:
  - authoring
  - kinds
---

# Entity authoring

Three skills, one component: `add-entity` (255 lines + `worked-examples.md`,
612), `model-data` (316 + `worked-pair.md`, 189) and `protocol-design` (239 +
`artifacts.md`, 191 + `worked-protocol.md`, 203).

They write **one entity whose placement is already settled**. Everything before
that is [solution-design](srn://metaframework/product/authoring-kit/component/solution-design);
everything after publication is
[entity-evolution](srn://metaframework/product/authoring-kit/component/entity-evolution).

## Why one component and not three

Because the selection rule is a table, not a judgement. `commands/entity-new.md`
states it once, in three rows:

| Kind requested                                                       | Skill to invoke   |
|----------------------------------------------------------------------|-------------------|
| `datamodel`                                                          | `model-data`      |
| `protocol`                                                           | `protocol-design` |
| `product`, `component`, `actor`, `environment`, `adr`, `requirement` | `add-entity`      |

Three components differing only by which kind they accept would have summaries a
reader cannot tell apart — the exact symptom `agents/catalog-reviewer.md` tells a
reviewer to flag ("two components whose summaries you cannot tell apart"). The
kit's own review checklist would fail this tree if it were split.

## The real internal difference, which is prose and not a boundary

`model-data` and `protocol-design` own **artifact contracts**; `add-entity`
explicitly disclaims them. From `add-entity/SKILL.md`:

> `datamodel` and `protocol` are excluded because they own artifact contracts
> (`schema.json`, `transport.yaml`, `states.json`, `workflows/`) with their own
> skills.

So the split inside this component is real: one skill writes `index.md` for seven
kinds that differ only in frontmatter fields and required prose, and two skills
additionally write a machine-checked sibling file. That is a paragraph, not a
directory — the procedure (confirm the entity is the right answer, pick the kind,
place it before writing a line, name it, write frontmatter, write prose worth
reading, wire forward edges only, validate) is identical across all three.

`model-data` carries one thing neither sibling does: a warning about the
**retired** schema convention — `schema.json` with no `$id`, reaching neighbours
by relative file path — with the instruction to read the sibling `schema.json`
rather than the prose when you want to know what the convention is, because
catalog prose written under the old form survives in the acme fixture. That is a
consequence of the schema decision chain living in this repository's own ADRs.

## What it refuses

`add-entity`'s first step is "Confirm a new entity is the right answer", with
named false positives: a component that is a layer rather than a capability, a
requirement with no acceptance criteria, an ADR for a decision nobody argued
about. `commands/entity-new.md` repeats it as check 1 — "Not every fact deserves
a directory."

## What it does not have

No template files. Every one of the three skills writes markdown from the rules
plus a worked example, so nothing here is a generator and nothing produces a
scaffold. And no skill in this component may touch a published entity: all three
route that to `evolve-entity`, because the instinctive fix — rename, move, narrow
— is exactly what the framework forbids.
