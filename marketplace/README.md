# metaframework marketplace

A Claude Code plugin marketplace containing one plugin, **`metaframework`**,
which teaches Claude to author and evolve a metaframework solution catalog: a
software solution described as a reviewable file catalog of markdown entities
with YAML frontmatter, JSON/YAML artifacts, and a Next.js portal that renders
and validates the tree.

The normative specification lives in this repository at `framework/spec/`, and
the worked example lives at `solutions/acme/`. The plugin bundles a **distilled**
copy of the specification, because an installed plugin cannot see
`framework/spec/` on disk. Where the repo spec is present, it is authoritative
and wins over the bundled copy.

## Layout

```text
marketplace/
├── .claude-plugin/
│   └── marketplace.json
├── README.md
└── plugins/
    └── metaframework/
        ├── .claude-plugin/
        │   └── plugin.json
        ├── agents/
        │   └── catalog-reviewer.md
        ├── commands/
        │   ├── catalog-check.md
        │   ├── entity-new.md
        │   └── solution-new.md
        └── skills/
            └── _shared/
                └── references/       # the distilled spec, read by every skill
                    ├── evolution.md
                    ├── frontmatter.md
                    ├── schemas.md
                    ├── srn.md
                    └── structure.md
```

Skills, commands and agents are auto-discovered from their directories;
`skills/_shared/` holds no `SKILL.md` and is therefore not itself a skill — it is
the shared reference bundle the skills read.

## Install

Add the marketplace, then install the plugin:

```text
/plugin marketplace add /Users/sergey/work/bershadsky/metaframework/marketplace
/plugin install metaframework@metaframework
```

From a git remote, point `marketplace add` at the repository instead of the
local path. To develop against it without installing:

```bash
claude --plugin-dir /Users/sergey/work/bershadsky/metaframework/marketplace/plugins/metaframework
```

## Commands

| Command          | Does                                                                                 |
|------------------|--------------------------------------------------------------------------------------|
| `/solution-new`  | Start a new solution catalog; routes into the `solution-design` skill.               |
| `/entity-new`    | Add an entity; routes by kind into `add-entity`, `model-data`, or `protocol-design`. |
| `/catalog-check` | Run the portal's catalog validation and interpret the diagnostics.                   |

## Agent

**`catalog-reviewer`** — read-only background audit of a catalog's
*architecture*: decomposition, placement, ownership, and the relation graph. It
does not validate syntax; the catalog check already does that.

## Skills

The skills live in `plugins/metaframework/skills/`. Each one points into
`framework/spec/` for the rules and carries what the spec deliberately does not:
the procedure, the ordering, the judgement calls, and the traps.

| Skill             | One line                                                                                                                                           |
|-------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| `solution-design` | Start a solution: name it, write the vision and scope, and decide the first product/actor/environment decomposition before any directory exists.   |
| `add-entity`      | Add a product, component, actor, environment, ADR or requirement — placement first, then the kind's required frontmatter and body sections.        |
| `model-data`      | Author a datamodel: `schema.json` in JSON Schema 2020-12 with HTTP `$id`/`$ref`, `allOf` inheritance, `$defs` privacy, and the promotion decision. |
| `protocol-design` | Author a protocol: participants and style, the nearest-common-ancestor placement, `transport.yaml`, `workflows/*.yaml`, `states.json`.             |
| `evolve-entity`   | Change something that already exists: additive edit with a version bump, or the swap procedure when the change is forbidden in place.              |
| `catalog-check`   | Run the validation, read the diagnostics, and fix what is safely fixable.                                                                          |

## Validating a catalog

There is no CLI. Integrity is enforced when the portal loads the catalog:

```bash
cd framework/portal && npx vitest run src/lib/catalog
```

Zero error diagnostics is the pass condition. Every skill that writes files ends
by running this and reporting the result.

## The bundled reference

`plugins/metaframework/skills/_shared/references/` distils ~5,700 lines of
specification into five focused files. Each names the spec document it distils
and states that the spec is authoritative.

| File             | Covers                                                                                                   |
|------------------|----------------------------------------------------------------------------------------------------------|
| `srn.md`         | SRN grammar, kind buckets, placement rules P1–P4, relative-reference arithmetic, error codes.            |
| `frontmatter.md` | Common fields, the required per-kind fields in one table, the forward-only relation edges.               |
| `structure.md`   | Directory layout, buckets vs. entity directories, artifact filenames per kind, container rules.          |
| `schemas.md`     | JSON Schema conventions: HTTP `$id`/`$ref`, `allOf` inheritance, `$defs` privacy, additive schema edits. |
| `evolution.md`   | Additive-only rules, version bumps, the swap procedure, git-backed history, status lifecycle.            |
