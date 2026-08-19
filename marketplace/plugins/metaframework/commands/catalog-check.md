---
description: Validate a metaframework catalog by loading it in the portal, then interpret the diagnostics and propose fixes
argument-hint: [optional: entity SRN or path to focus on]
allowed-tools: Bash(cd:*), Bash(npx vitest:*), Read, Grep, Glob
---

Validate the catalog. Focus, if given: `$ARGUMENTS`

There is no CLI. Integrity is checked when the portal loads the catalog:

```bash
cd framework/portal && npx vitest run src/lib/catalog
```

This asserts the shipped catalog loads with **zero error diagnostics**. Run it,
then report: pass/fail, the counts, and every diagnostic with its code, the file
it names, and what to do about it.

## Reading the codes

The prefix says which contract was broken and therefore which document explains
it. `E_*` fails the build; `W_*` is a warning worth acting on but not a failure.

| Prefix                                                              | Contract               | Reference                                                        |
|---------------------------------------------------------------------|------------------------|------------------------------------------------------------------|
| `E_SRN_*`                                                           | identity and reference | `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/srn.md`         |
| `E_FM_*`                                                            | frontmatter            | `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/frontmatter.md` |
| `E_STRUCT_*`                                                        | directory layout       | `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/structure.md`   |
| `E_DM_*`                                                            | `schema.json`          | `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/schemas.md`     |
| `E_VER_*`                                                           | versioning             | `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/evolution.md`   |
| `E_PROTO_*`, `E_ADR_*`, `E_REQ_*`, `E_PROD_*`, `E_ENV_*`, `E_SOL_*` | kind contracts         | `framework/spec/kinds/<kind>.md` when present                    |

When `framework/spec/` is present in the repository it is authoritative; the
bundled references are the fallback for an installed plugin that cannot see it.

## Diagnoses that are usually misread

- **`E_SRN_SYNTAX` on a relative reference** — almost always a miscounted `..`.
  One `..` pops one path segment, and a bucket plus a name is **two** segments,
  so `..` alone lands on a bucket, which is not addressable. Rewrite the
  reference solution-absolute rather than recounting.
- **`E_SRN_PLACEMENT`** — the directory is in a bucket it may not be in. Moving
  the directory is not a free fix: entities must not be moved or renamed. If the
  entity is already published, this is a **swap**, not a `git mv`.
- **`E_FM_UNKNOWN_FIELD`** — either a typo, or a kind field used on the wrong
  kind (frontmatter is a discriminated union on `kind`), or an authored inverse
  edge. Local nuance goes in an `x-` prefixed field.
- **`E_FM_EDGE_SOURCE` vs `E_FM_EDGE_TARGET`** — the first is wrong in the file
  you are reading, the second is wrong about the file it points at.
- **`E_DM_ID_MISMATCH`** — the root `$id` must equal `SCHEMA_BASE_URL` +
  `/schemas/` + the entity's SRN path, origin included, with no version pin.
- **`E_DM_NOT_ADDITIVE`** — the change tightens the schema. It cannot be made in
  place at any version number; it needs a successor entity and a swap.
- **`E_SRN_VERSION` with a shallow-history hint** — the clone lacks the commit,
  not the catalog. `git fetch --unshallow`.

## Fixing

Propose fixes; apply them only where the correction is unambiguous (a typo, a
missing required frontmatter field, a mis-typed reference). Anything that would
remove, rename, narrow or move an entity is **not** a fix — stop and say it
requires a swap. Re-run the check after any edit and report the new result.
