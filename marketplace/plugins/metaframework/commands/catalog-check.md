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
another tree with `metaframework check --dir <path>` (or the environment
equivalent, `CATALOG_DIR`); `<path>` names the catalog directory itself —
usually `<repo>/solutions` — and neither explicit form walks. Aimed at the
repository root by mistake, the error suggests the nested `solutions/`.

If the binary is not on PATH, `npx @bershadsky/metaframework check` runs the same
thing without installing; `npm install -g @bershadsky/metaframework` makes it
permanent. It carries its own compiled server and pulls in no dependencies, so
there is nothing to clone, vendor or symlink — a catalog-only repository is
checked exactly like the framework's own. (Inside the metaframework repository
itself the portal's vitest suite covers the same loader. It is never the route
to recommend and never a prerequisite.)

Zero **error**-severity diagnostics is the pass condition; the command exits
non-zero when there are any, so the same invocation is the CI gate.
`metaframework check --since <ref>` adds the evolution gate on top: every
entity whose files changed since `<ref>` must have bumped its `version`
(`status:`-only edits exempt). In CI, `<ref>` is the PR base.

Report, in this order:

1. **Pass or fail**, and the summary line verbatim — it has the form
   `<n> errors, <n> warnings — <n> entities across <n> solutions.`
2. **Every diagnostic**: its code, the file it names (prefix the path with
   `solutions/` — the check prints it catalog-relative), and the fix.
3. **What was not covered.** A green run proves the tree *loads* — and, since
   the schema registry and the artifact mini-spec parsers are folded into the
   catalog load, that every `schema.json` identity and `$ref` checks out and
   every present `journey.yaml`, `workflows/*.yaml` and `states.json` parses
   clean (`E_JRN_*` and `E_PROTO_*` fail the run like any loader code). It does
   **not** run the git history checks — `E_VER_REGRESSION` and `E_VER_UNBUMPED`
   surface on the entity page, and `--since` is their gate form — and several
   specified rules — the ADR's four headings, the requirement's
   `## Acceptance criteria`, protocol NCA placement, a journey entity with no
   `journey.yaml` at all — are implemented nowhere. The skill has the full
   list; say which of them apply to what was just touched.

If `$ARGUMENTS` names an entity or path, still run the whole check — the loader
has no focus mode — then filter the report to diagnostics touching that entity
and its referrers, and say that you did.

## Fixing

Apply a fix only where the correction is unambiguous: a typo, a missing required
frontmatter field, a mis-typed reference, an authored inverse edge. Anything that
would **remove, rename, narrow or move** an entity is not a fix — stop and say it
requires a swap, and hand it to the `evolve-entity` skill. Re-run the check after
every edit and report the new result.
