# A swap, end to end

The worked example is real: `srn://acme/actor/shop-admin` was a catch-all staff
role that mixed catalog curation, customer support and release automation under
one name. It could not be narrowed in place — narrowing an actor's meaning
breaks every statement made about it — so it was swapped. Both entities are in
the shipped catalog:

```text
solutions/acme/actor/shop-admin/index.md          # status: deprecated
solutions/acme/actor/merchant-operator/index.md   # status: review, supersedes shop-admin
solutions/acme/actor/support-agent/index.md       # the second half of the split
solutions/acme/actor/release-bot/index.md         # the third
```

The sequence below is the procedure that produces that end state. Each numbered
step is one commit.

## 0 — before

`solutions/acme/actor/shop-admin/index.md`, the state the swap starts from:

```yaml
---
name: shop-admin
kind: actor
version: 1
title: Shop admin
summary: Staff member who curates the catalog, answers customer contacts, and runs migrations.
status: approved
owner: team-commerce
actor-type: human
goals:
  - Curate the sellable catalog and correct stock counts.
  - Answer customer contacts about orders and refunds.
  - Run migrations and promote builds between environments.
tags:
  - internal
---
```

The three goals are the diagnosis: one name carrying a human curating a catalog,
a human reading other people's order data, and a machine credential applying
migrations. No single access policy is correct for all three.

Why not fix it in place? Because every one of these is forbidden: dropping two
goals is a **removal**; renaming the entity is a **rename**; redefining what
"shop-admin" means is a **repurpose**. The escape hatch is the only route.

## 1 — create the successors

One successor per real role. Each is a new entity at `version: 1`,
`status: draft`, in the same `actor/` bucket, and each carries the `supersedes`
edge toward the predecessor:

```yaml
# solutions/acme/actor/merchant-operator/index.md
---
name: merchant-operator
kind: actor
version: 1
title: Merchant operator
summary: Staff member who curates the sellable catalog and corrects stock counts.
status: draft
owner: team-commerce
actor-type: human
goals:
  - Publish a product so customers can buy it, without an engineer in the loop.
  - Correct a stock count that reality disagrees with, and see why it drifted.
relations:
  supersedes:
    - /actor/shop-admin
  uses:
    - /product/shop/component/inventory
tags:
  - internal
  - catalog
---
```

Notes on this block, each of which is a rule people get wrong:

- The edge sits on the **successor**, pointing back. `superseded-by` on
  `shop-admin` is derived by the portal and authoring it is `E_FM_SCHEMA`.
- `supersedes` targets the **same kind** as the source: actor → actor.
- Three successors may all supersede one predecessor. A split is not a special
  case; it is three ordinary swaps sharing a target.
- The reference is written solution-absolute (`/actor/shop-admin`). The relative
  form for a sibling in the same bucket is `../shop-admin` — one `..`, because
  one `..` pops one segment and this entity's directory is one segment inside
  the bucket. Two dots would land on the solution root.
- Names describe what the roles now are. `shop-admin-2` would have been legal
  and wrong: the name is the permanent address, and a version number in a name
  is a lie the moment the successor itself evolves.

The old entity is untouched in this commit. Both are live; the portal shows the
successors as drafts.

## 2 — census the referrers

```bash
grep -rn "shop-admin" solutions/ --include='*.md' --include='*.json' --include='*.yaml'
```

Classify every hit:

| Hit                                            | Live referrer? | Action                                        |
|------------------------------------------------|----------------|-----------------------------------------------|
| `relations:` edge in some entity's frontmatter | yes            | migrate (step 3)                              |
| `participants[].ref` in a protocol             | yes            | migrate                                       |
| `$ref` URL in a `schema.json`                  | yes            | migrate                                       |
| `primary-actors` on a product                  | yes            | migrate                                       |
| `srn://` link in prose                         | no             | leave, or reword to name the successor        |
| `x-srn` in the predecessor's own `schema.json` | no             | ignore — self-identification, not a reference |
| The predecessor's own directory                | no             | ignore                                        |

Only the first four are blocking. Prose that points at a retired concept is
often exactly right — the deprecated entity is the address of the history.

## 3 — migrate referrers, one at a time

Each migration is an ordinary additive edit on the **referrer**:

```diff
  relations:
    uses:
-     - /actor/shop-admin
+     - /actor/merchant-operator
- version: 4
+ version: 5
```

One commit per referrer, or one per owning team when they genuinely move
together. Referrers that cannot move yet keep pointing at `shop-admin`,
optionally pinned (`/actor/shop-admin@1`), for as long as they need: the
predecessor is still `approved` and still resolves. This is the whole reason the
window exists — a swap never requires a synchronized cutover.

Do not deprecate while this list is non-empty. Deprecating early converts every
outstanding referrer into `W_REF_DEPRECATED` noise and pressures teams into
rushed migrations.

## 4 — promote the successors

When each successor's content is settled, move it `draft → review → approved`
per the owning team's process. Status-only transitions do **not** bump `version`.

In the shipped catalog `merchant-operator` is deliberately still at
`status: review`: its stock-correction goal implies a write path into
`inventory` that no protocol describes yet. A successor may sit in review for a
long time; the swap is not blocked by it.

## 5 — deprecate the predecessor

Census empty, so:

```yaml
---
name: shop-admin
kind: actor
version: 2                      # bumped: title and summary changed too
title: Shop admin (retired role)
summary: Retired catch-all staff role, split into merchant-operator, support-agent, and release-bot.
status: deprecated
owner: team-commerce
actor-type: human
goals:
  - Curate the sellable catalog and correct stock counts.
  - Answer customer contacts about orders and refunds.
  - Run migrations and promote builds between environments.
tags:
  - internal
---
```

- `status: deprecated` alone would not bump `version`; rewriting `title` and
  `summary` is content, so this commit bumps to 2.
- The **goals are not deleted**. They are the record of what the role was, and
  removing them would be a reduction like any other.
- The prose is rewritten to say where the role went and why it was retired —
  that paragraph is what a reader lands on when they follow an old link.
- `deprecated` is terminal. Reviving the concept later means yet another
  successor, never an un-deprecate.

## 6 — verify

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/review-solution/scripts/catalog_facts.py solutions/acme
cd framework/portal && npx vitest run src/lib/catalog
```

The first reports `R_DEPRECATED_LIVE_REF` if any structural referrer was missed
and `R_SWAP_UNFINISHED` if a `supersedes` target was left un-deprecated. The
second must show zero error diagnostics.

---

## Variant: an ADR

Same shape, two deliberate differences. Real pair in the catalog:
`product/shop/adr/0001-event-sourcing` superseded by
`product/shop/adr/0002-change-data-capture`.

1. The successor gets its **own ordinal**, never a reused one, and starts at
   `decision-status: proposed`.
2. When it is accepted, set the successor to `decision-status: accepted` with
   its `date`, and set the predecessor to `decision-status: superseded` with the
   same date — **bumping the predecessor's `version`**, because `decision-status`
   is a fact about the architecture, not workflow state.
3. The predecessor keeps `status: approved`. **Do not set `status: deprecated`
   on a superseded ADR.** Referencing old decisions is the normal use of an ADR
   archive; deprecating them would flag every such reference `W_REF_DEPRECATED`.
   That is exactly what `0001-event-sourcing` looks like today: `status:
   approved`, `decision-status: superseded`, `version: 3`.
4. Never edit the predecessor's `## Decision`. It is a true statement about what
   was decided then, and it stays true. Chains are ordinary — a later ADR may
   supersede the successor in turn.

## Variant: a datamodel

The forbidden change is anything that breaks the instance-superset rule:
renaming `total` to `amount`, making `status` required, retyping `id` from
string to integer, removing an enum value.

1. Successor datamodel entity, own name, `version: 1`, and a `schema.json` whose
   identity keywords are derived from **its own** directory — never copied from
   the predecessor and edited:

   ```json
   {
     "$schema": "https://json-schema.org/draft/2020-12/schema",
     "$id": "https://schemas.metaframework.dev/acme/product/shop/datamodel/payment-intent",
     "x-srn": "srn://acme/product/shop/datamodel/payment-intent"
   }
   ```

   A copied-and-half-edited pair is the characteristic failure here: `$id`
   updated, `x-srn` still naming `charge`. Both are checked against the path
   (`E_DM_ID_MISMATCH`, `E_DM_SRN_MISMATCH`), so it fails loudly rather than
   shipping a schema that lies about its own identity.
2. `relations.supersedes: [../charge]` on the successor — one `..` for a sibling
   in the same `datamodel/` bucket.
3. Referrers repoint their **`$ref` URLs** (in `schema.json`) and any
   `relations.uses` pins, one entity at a time, each bumping its own version.
   Remember that a `$ref` names an entity and carries no `@N`; a pin, if one is
   wanted, lives in `relations.uses`.
4. Deprecate the predecessor when the census is empty: `status: deprecated` in
   the frontmatter **and** `"deprecated": true` at the root of its `schema.json`,
   one commit, one version bump. The keyword is stock JSON Schema 2020-12
   meta-data — an annotation, so always additive — and it is the half of the
   signal that travels with a schema copied out of the catalog, where no
   frontmatter follows it.

Do not confuse this with **promotion**, which is not a swap: lifting a shape out
of one entity's `$defs` into its own datamodel and replacing the local pointer
with a `$ref` leaves the instance shape unchanged, so it is an ordinary additive
bump on the promoting entity.

## Variant: renaming a container, and why not to

Renaming `product/shop` to `product/storefront` means every descendant's path
changes, and the SRN is the path — so every descendant is its own swap, with its
own successor, its own migration window and its own deprecation.

Count the cost before proposing it:

```bash
find solutions/acme/product/shop -name index.md | wc -l     # entities that must each swap
grep -rl "product/shop" solutions/ --include='*.md' --include='*.json' \
     --include='*.yaml' | wc -l                             # files that mention the old path
```

Against the fixture as it stands that is 23 and 86 — twenty-three swaps and
eighty-six files touched, to change a word that is the entity's address, not its
label: the portal titles entities by `title`. Run the two commands rather than
quoting these numbers; both grow with the catalog. Fix
`title` and `summary` in place, bump the version, and leave the address alone.
Reserve the container swap for a genuine change of concept: a product being
split in two, or absorbed into another.
