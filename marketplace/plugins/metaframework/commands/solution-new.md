---
description: Start a new metaframework solution catalog — vision, scope, contacts, and the first products, actors and environments
argument-hint: "[solution-name] [one line about what it is]"
---

Start a new metaframework solution: `$ARGUMENTS`

Invoke the **`solution-design`** skill and follow it. It owns the procedure —
the ordering of decisions, the decomposition judgement calls, and the traps.
Do not improvise a layout from this file.

Before writing anything:

1. If `framework/spec/` exists in this repository, read it — it is
   authoritative. Otherwise read the distilled reference bundled with this
   plugin at `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/` (`srn.md`,
   `structure.md`, `frontmatter.md`, `schemas.md`, `protocols.md`,
   `environments.md`, `evolution.md`). Its absence is the normal case outside
   the framework monorepo and blocks nothing.
2. Confirm the target: which repository, and does `solutions/<name>/` already
   exist? A solution is a sealed universe — never nest one inside another, and
   never let a reference cross from one solution into another.
3. Settle the **name** before creating any directory. The name is the SRN
   authority and the path; it can never be renamed later without a full swap.
   It must be kebab-case and must not be one of the eleven reserved kinds.

The minimum viable solution is `solutions/<name>/index.md` with `kind:
solution`, `version: 1`, and a real `vision` — plus at least one product, the
actors it serves, and the environments it runs in. Prefer asking for the vision
and scope in the user's own words over inventing them.

Finish by running the catalog check and reporting the result:

```bash
metaframework check
```

Zero error diagnostics is the pass condition. Report any `W_*` warnings as well
— they are not failures, but they are usually worth acting on.

Run it from anywhere in the new repository; it finds `solutions/` by walking up.
If the binary is absent, `npx @bershadsky/metaframework check` runs it without
installing. The catalog does **not** have to live in the framework monorepo, and
nothing about this repository needs a copy, clone, submodule or symlink of
`framework/` — a catalog-only repository is a first-class one.
