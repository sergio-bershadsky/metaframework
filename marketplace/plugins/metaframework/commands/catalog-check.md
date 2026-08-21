---
description: Validate a metaframework catalog with the `metaframework check` CLI, then interpret the diagnostics and propose fixes
argument-hint: "[optional: entity SRN or path to focus on]"
allowed-tools: Bash(metaframework:*), Bash(npx @bershadsky/metaframework:*), Bash(npm install:*), Read, Grep, Glob
---

Validate the catalog. Focus, if given: `$ARGUMENTS`

Invoke the **`validate-catalog`** skill and follow it. It owns how to run the
check, the cascade order to read the output in, the code→cause→fix table, which
warnings matter, and — importantly — what the check does *not* cover. Do not
improvise a diagnosis from this file.

The check itself, for reference:

```bash
metaframework check
```

Run it from anywhere in the catalog repository: it walks **up** from the working
directory for a `solutions/` directory holding at least one `<name>/index.md`,
the way git finds `.git`. There is no working-directory requirement. Point it at
another tree with `metaframework check --dir <path>` or `CATALOG_DIR=<path>`.

If the binary is not on PATH, `npx @bershadsky/metaframework check` runs the same
thing without installing; `npm install -g @bershadsky/metaframework` makes it
permanent. It carries its own compiled server and pulls in no dependencies, so
there is nothing to clone, vendor or symlink — a catalog-only repository is
checked exactly like the framework's own. (Inside the metaframework repository
itself the portal's vitest suite covers the same loader. It is never the route
to recommend and never a prerequisite.)

Zero **error**-severity diagnostics is the pass condition; the command exits
non-zero when there are any, so the same invocation is the CI gate.

Report, in this order:

1. **Pass or fail**, and the summary line verbatim — e.g.
   `0 errors, 6 warnings — 324 entities across 3 solutions.`
2. **Every diagnostic**: its code, the file it names (prefix the path with
   `solutions/` — the check prints it catalog-relative), and the fix.
3. **What was not covered.** A green run proves the tree *loads* — and, since
   the datamodel schema registry is folded into the catalog load, that every
   `schema.json` identity and `$ref` checks out too. It does **not** run the
   protocol validators or the `journey.yaml` parser (`E_PROTO_*` and `E_JRN_*`
   appear only when the portal renders that entity's page — `metaframework` with
   no subcommand serves the portal on port 6363, and its `/diagnostics` page
   lists the same set), and several specified rules — the ADR's four headings,
   the requirement's `## Acceptance criteria`,
   protocol NCA placement, a journey entity's missing `journey.yaml` — are
   implemented nowhere. The skill has the full list; say which of them apply to
   what was just touched.

If `$ARGUMENTS` names an entity or path, still run the whole check — the loader
has no focus mode — then filter the report to diagnostics touching that entity
and its referrers, and say that you did.

## Fixing

Apply a fix only where the correction is unambiguous: a typo, a missing required
frontmatter field, a mis-typed reference, an authored inverse edge. Anything that
would **remove, rename, narrow or move** an entity is not a fix — stop and say it
requires a swap, and hand it to the `evolve-entity` skill. Re-run the check after
every edit and report the new result.
