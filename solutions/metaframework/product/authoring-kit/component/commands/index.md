---
name: commands
kind: component
version: 1
title: Commands
summary: Three slash commands, 130 lines that route and nothing else — each one says do not improvise from this file.
status: review
owner: sergio
component-type: gateway
relations:
  uses:
    - /environment/local
  depends-on:
    - ../solution-design
    - ../entity-authoring
    - ../catalog-validation
tags:
  - entry-point
  - routing
---

# Commands

`commands/solution-new.md` (38 lines), `commands/entity-new.md` (46) and
`commands/catalog-check.md` (46). 130 lines total, and every one of them exists
to send the reader somewhere else.

| Command          | Routes to                                                                             |
|------------------|----------------------------------------------------------------------------------------|
| `/solution-new`  | `solution-design`                                                                      |
| `/entity-new`    | `model-data`, `protocol-design` or `add-entity`, by a three-row table on the kind      |
| `/catalog-check` | `validate-catalog`                                                                     |

## Why `gateway`

The `component-type` enum has no value for "an entry surface that dispatches",
and `gateway` is the closest honest fit: it "fronts, routes, or adapts others
rather than owning behaviour", which is exactly what 130 lines of routing do.
`ui` would claim a surface these files do not draw; `library` would claim they
are read as reference material, when in fact they are read as an instruction to
invoke something else.

## The discipline that makes them a component and not a duplicate

Each file states, in its own wording, that it is not the procedure.
`solution-new.md`: "Do not improvise a layout from this file."
`entity-new.md`: "Do not improvise frontmatter from this file."
`catalog-check.md`: "Do not improvise a diagnosis from this file."

That is the whole design claim: a command is a trigger phrase plus a routing
decision, and every rule it might have restated is a rule that would then have
two homes and drift. The three `depends-on` edges above are the routing table,
authored once here — the skills know nothing about the commands that call them.

## What each carries beyond the route

`/entity-new` carries three gates before anything is invoked: is a new entity
even the right answer, which kind is it, and does it already exist (in which
case it is
[entity-evolution](srn://metaframework/product/authoring-kit/component/entity-evolution)'s
work, not this one's). It then requires the SRN and disk path to be stated out
loud, because "placement is grammar: a misplaced directory has no SRN at all, and
it is effectively permanent."

`/solution-new` carries the sealed-universe reminder and the fact that the
solution name is the SRN authority and can never be renamed without a full swap.

`/catalog-check` is the only one of the three with `allowed-tools` —
`Bash(cd:*)`, `Bash(npx vitest:*)`, `Bash(npm run:*)`, `Read`, `Grep`, `Glob` —
which is also the only place in the kit where a tool permission is declared at
all.

## Where it runs, and what it does not include

`uses: /environment/local` because that is where a plugin installed from a
filesystem path executes; there is no other environment in this solution and no
hosted install path. No fourth command exists — there is no `/entity-evolve` and
no `/review-solution`, so
[entity-evolution](srn://metaframework/product/authoring-kit/component/entity-evolution)
and
[architecture-review](srn://metaframework/product/authoring-kit/component/architecture-review)
are reachable only through a skill's trigger phrases or through a hand-off from
another skill. That asymmetry is not a decision recorded anywhere; it is simply
what the plugin ships.
