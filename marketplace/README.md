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
            ├── _shared/
            │   └── references/          # the distilled spec, read by every skill
            │       ├── environments.md
            │       ├── evolution.md
            │       ├── frontmatter.md
            │       ├── protocols.md
            │       ├── schemas.md
            │       ├── srn.md
            │       └── structure.md
            ├── add-entity/
            │   ├── SKILL.md
            │   └── references/worked-examples.md
            ├── evolve-entity/
            │   ├── SKILL.md
            │   └── references/swap-walkthrough.md
            ├── model-data/
            │   ├── SKILL.md
            │   └── references/worked-pair.md
            ├── protocol-design/
            │   ├── SKILL.md
            │   └── references/
            │       ├── artifacts.md          # the three mini-languages
            │       └── worked-protocol.md
            ├── review-solution/
            │   ├── SKILL.md
            │   ├── references/
            │   │   ├── review-checklist.md
            │   │   └── writing-the-review.md
            │   └── scripts/catalog_facts.py
            ├── solution-design/
            │   ├── SKILL.md
            │   └── references/worked-example.md
            └── validate-catalog/
                ├── SKILL.md
                └── references/diagnostics.md
```

Skills, commands and agents are auto-discovered from their directories;
`skills/_shared/` holds no `SKILL.md` and is therefore not itself a skill — it is
the shared reference bundle the skills read.

## Install

Add the marketplace, then install the plugin:

```text
/plugin marketplace add sergio-bershadsky/metaframework
/plugin install metaframework@metaframework
```

The marketplace manifest lives at the **repository root**
(`.claude-plugin/marketplace.json`) rather than in this directory, which is what
lets the GitHub shorthand above work: `marketplace add` clones the repository
and looks for the manifest at its root. The manifest's `source` points back down
here, so the plugin itself still lives in `marketplace/plugins/metaframework`.
A local path works too — point it at the repository root, not at this folder.

To develop against it without installing:

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
`framework/spec/` for the rules when the repository is present, falls back to
`skills/_shared/references/` when it is not, and carries what the spec
deliberately does not: the procedure, the ordering, the judgement calls, and the
traps.

| Skill              | Owns                                                                                                                                                         |
|--------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `solution-design`  | Many entities at once, before any file exists: the interview, the decomposition heuristics, the proposed SRN tree, the sign-off gate.                        |
| `add-entity`       | One entity of a mechanical kind — product, component, actor, environment, ADR, requirement, or the solution root.                                            |
| `model-data`       | One `datamodel`: `schema.json` in JSON Schema 2020-12 with canonical `$id`/`$ref` and `x-srn`, `allOf` inheritance, `$defs` privacy, the promotion decision. |
| `protocol-design`  | One `protocol`: participants and style, the nearest-common-ancestor placement, `transport.yaml`, `workflows/*.yaml`, `states.json`.                          |
| `evolve-entity`    | Anything that already exists: additive edit with a version bump, or the swap procedure when the change is forbidden in place.                                |
| `validate-catalog` | Legality — running the check, reading the diagnostics, the cascade order, and what the check deliberately does not cover.                                    |
| `review-solution`  | Judgement — a ranked architectural review of an existing catalog, backed by `scripts/catalog_facts.py`. Read-only; proposes no edits.                        |

The three creation skills are disjoint by kind: `datamodel` → `model-data`,
`protocol` → `protocol-design`, everything else → `add-entity`. The two audit
skills are disjoint by question: `validate-catalog` asks "is it legal?",
`review-solution` asks "is it any good?".

## Validating a catalog

Integrity is enforced by the catalog loader, and the loader ships as a CLI:

```bash
npm install -g @bershadsky/metaframework   # once
metaframework check
```

Zero `error`-severity diagnostics is the pass condition, and the command exits
non-zero when there are any, so the same invocation is a CI gate. Every skill
that writes files ends by running this and reporting the result.

It walks up from the working directory looking for a `solutions/` directory the
way git looks for `.git`, so it needs nothing else present — **a catalog-only
repository does not have to vendor, symlink or submodule this one to be
checked.** Earlier versions of these skills implied it did, because the CLI did
not exist and the only validator was a vitest suite that resolved its catalog
relative to itself.

## The bundled reference

`plugins/metaframework/skills/_shared/references/` distils ~7,300 lines of
specification (`wc -l framework/spec/*.md framework/spec/kinds/*.md`) into seven
focused files. Each names the spec document it distils and states that the spec
is authoritative.

| File              | Covers                                                                                                                                                   |
|-------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| `srn.md`          | SRN grammar, kind buckets, placement rules P1–P4, relative-reference arithmetic, error codes.                                                            |
| `frontmatter.md`  | Common fields, the required per-kind fields in one table, the forward-only relation edges.                                                               |
| `structure.md`    | Directory layout, buckets vs. entity directories, artifact filenames per kind, container rules.                                                          |
| `schemas.md`      | JSON Schema conventions: canonical `$id`/`$ref`, `x-srn`, `allOf` inheritance, `$defs` privacy, `deprecated`, additive schema edits.                     |
| `protocols.md`    | Participants and aliases, `style`, `transport.yaml` bindings, the workflow YAML, the XState subset, payload binding, `E_PROTO_*`.                        |
| `environments.md` | `environment-type`, `topology.yaml`, the config surface, the component-side deployment edge — plus the actor, ADR and requirement field and body detail. |
| `evolution.md`    | Additive-only rules, version bumps, the swap procedure, git-backed history, status lifecycle.                                                            |
