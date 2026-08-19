---
description: Add an entity to a metaframework catalog — product, component, datamodel, protocol, actor, environment, adr or requirement
argument-hint: [kind] [name] [where it belongs]
---

Add an entity to the catalog: `$ARGUMENTS`

Route by kind, then follow that skill's procedure:

| Kind requested                                                       | Skill to invoke   |
|----------------------------------------------------------------------|-------------------|
| `datamodel`                                                          | `model-data`      |
| `protocol`                                                           | `protocol-design` |
| `product`, `component`, `actor`, `environment`, `adr`, `requirement` | `add-entity`      |

If the kind was not stated, work it out from the description and say which one
you picked and why before creating anything. If the right answer is "this
belongs in an existing entity, not a new one", say that instead.

Before writing anything:

1. If `framework/spec/` exists in this repository, read the relevant
   `kinds/*.md` — it is authoritative. Otherwise read the distilled reference at
   `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/`.
2. Fix the **placement** first, because placement is grammar and a misplaced
   directory has no SRN at all: `product` only directly under the solution;
   `component` only inside a product or component; `actor` and `environment`
   only at solution level; `datamodel`, `adr` and `requirement` in the bucket of
   the container responsible for them; `protocol` at the nearest common
   ancestor of its component and product participants, actors excluded.
3. State the resulting SRN and the resulting disk path, and check the name is
   kebab-case and is not one of the eight reserved kinds.

Then create the entity directory with `index.md` (common frontmatter **plus the
required fields for that kind**) and whatever siblings the kind defines. Write
relations as **forward edges only** — never author `used-by`, `implemented-by`
or any other inverse; the portal derives them. Prefer solution-absolute
references (`/product/shop/datamodel/money@1`) for anything outside the entity.

Finish by running the catalog check and reporting the result:

```bash
cd framework/portal && npx vitest run src/lib/catalog
```

Zero error diagnostics is the pass condition.
