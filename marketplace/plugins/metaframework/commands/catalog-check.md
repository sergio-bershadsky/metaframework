---
description: Validate a metaframework catalog by loading it in the portal, then interpret the diagnostics and propose fixes
argument-hint: [optional: entity SRN or path to focus on]
allowed-tools: Bash(cd:*), Bash(npx vitest:*), Bash(npm run:*), Read, Grep, Glob
---

Validate the catalog. Focus, if given: `$ARGUMENTS`

Invoke the **`validate-catalog`** skill and follow it. It owns how to run the
check, the cascade order to read the output in, the code→cause→fix table, which
warnings matter, and — importantly — what the check does *not* cover. Do not
improvise a diagnosis from this file.

The check itself, for reference:

```bash
cd framework/portal && npx vitest run src/lib/catalog
```

Zero **error**-severity diagnostics is the pass condition; there is no CLI.

Report, in this order:

1. **Pass or fail**, and the test-file line verbatim.
2. **Every diagnostic**: its code, the file it names (prefix the path with
   `solutions/` — the check prints it catalog-relative), and the fix.
3. **What was not covered.** A green run proves the tree *loads*. It does not run
   the datamodel schema registry or the protocol validators over the shipped
   tree, and several specified rules — the ADR's four headings, the
   requirement's `## Acceptance criteria`, protocol NCA placement — are
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
