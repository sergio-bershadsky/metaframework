---
description: Add an entity to a metaframework catalog — product, component, datamodel, protocol, actor, environment, adr, requirement, capability, journey or metric
argument-hint: "[kind] [name] [where it belongs]"
---

Add an entity to the catalog: `$ARGUMENTS`

Route by kind, then follow that skill's procedure — it owns the placement rules,
the per-kind frontmatter contract, the artifact formats and the traps. Do not
improvise frontmatter from this file.

| Kind requested                                                       | Skill to invoke   |
|----------------------------------------------------------------------|-------------------|
| `datamodel`                                                          | `model-data`      |
| `protocol`                                                           | `protocol-design` |
| `product`, `component`, `actor`, `environment`, `adr`, `requirement` | `add-entity`      |
| `capability`, `journey`, `metric`                                    | `add-entity`      |

The second `add-entity` row is separate only because those three are the newest
kinds and the ones a request is most likely to name imprecisely:

- **capability** — what the business can *do*, independent of how it is built.
  Solution-level. If the thing has an inside we describe, it is a `component`; if
  it is funded and owned as a unit, a `product`; if it must be *true* and is
  decidable by written criteria, a `requirement`.
- **journey** — one actor's ordered path across the solution. Solution-level, and
  its steps live in a REQUIRED `journey.yaml`. A path that branches is **two
  journeys**, so a request describing a fork is a request for two entities: say
  so before creating either.
- **metric** — one number the solution observes about itself. Owner-scoped like a
  requirement: it lives under whoever is accountable for the number, which is a
  different question from what it `measures`. A dashboard with nine tiles is nine
  metrics.

Three checks before invoking anything:

1. **Is a new entity even the right answer?** Not every fact deserves a
   directory. If it belongs in an existing entity's prose or as one added
   relation edge, say so and stop.
2. **Which kind?** If the kind was not stated, work it out from the description
   and say which one you picked and why. If several entities are wanted at once,
   or the decomposition itself is in question, invoke `solution-design` instead
   and come back per entity after sign-off.
3. **Does it already exist?** Changing something published is `evolve-entity`,
   not this command — the framework forbids removing, renaming, narrowing and
   moving, and the instinctive fix is usually one of those.

Then state the resulting **SRN and disk path out loud** and get agreement if the
placement is not obvious. Placement is grammar: a misplaced directory has no SRN
at all, and it is effectively permanent, because entities are never moved.

```text
srn://acme/product/shop/component/checkout/requirement/idem-cap
solutions/acme/product/shop/component/checkout/requirement/idem-cap/index.md
```

The invoked skill takes it from there and finishes with the catalog check:

```bash
cd framework/portal && npx vitest run src/lib/catalog
```

Zero error diagnostics is the pass condition.
