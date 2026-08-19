---
name: model-data
description: This skill should be used when the user asks to "add a datamodel", "model this order/cart/invoice in the catalog", "create a schema.json", "add a JSON Schema entity", "write an abstract base model", "add a mixin", "build a discriminated union", "promote a $defs shape to its own datamodel", "extract a shared type", "where should this shared model live", "pick usage storage or exchange", "what should the $id be", or asks whether a schema edit is additive or needs a swap — in a metaframework solution catalog under `solutions/`. It owns the `datamodel` kind only: use `add-entity` for a product, component, actor, environment, ADR or requirement, and `protocol-design` for a protocol (a payload datamodel comes back here). For rewriting an EXISTING published schema, decide the mechanism with `evolve-entity` first.
---

# Authoring a datamodel

A datamodel is a directory holding `index.md` (prose and frontmatter) and
`schema.json` (JSON Schema 2020-12). The schema states the shape; the prose
states what the schema cannot. It is the only kind whose contract surface is
fully machine-checked, which means most mistakes here are caught — and the
handful that are not are the expensive ones.

## Where the rules live — do not restate them here

| Need                                                            | Read                                                              |
|-----------------------------------------------------------------|-------------------------------------------------------------------|
| Schema conventions, error codes, the additive/swap keyword table | `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/schemas.md`      |
| Placement, artifact filenames, `examples/`                       | `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/structure.md`    |
| Common + per-kind frontmatter, relation edges                    | `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/frontmatter.md`  |
| Reference syntax and the `..` arithmetic                         | `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/srn.md`          |
| Version bumps, the swap procedure                                | `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/evolution.md`    |

**When `framework/spec/` is present in the repository it is authoritative and
wins over the bundled copies** — read `framework/spec/kinds/datamodel.md` first
in that case. The bundle exists because an installed plugin cannot see the repo.

**One stale source to distrust.** An earlier convention had `schema.json` carry
no `$id` and use relative file-path `$ref`s. It was retired because those
references are not dereferenceable. The spec and every shipped `schema.json` are
current, but the **prose** of
`solutions/acme/product/shop/component/checkout/component/payment/datamodel/order/index.md`
still tells the reader the schema has no `$id` and reaches `order-line` by
relative file path — while the sibling `schema.json` next to it does neither.
Never author the retired form, and never copy prose that explains it.

## Procedure

Do these in order. Steps 1–3 are decisions; reversing one after the files exist
costs a swap, not an edit.

1. **Decide the owner** — which container's `datamodel/` bucket this belongs in.
2. **Decide `usage` and `abstract`.**
3. **Decide the composition shape** — standalone, `allOf` base, `oneOf` union,
   or a `$defs` local shape.
4. **Compute the `$id`** mechanically from the directory path.
5. **Write `schema.json`**: `$schema`, `$id`, `title`, composition (`allOf` /
   `oneOf`), own `properties`, `required`, `$defs` last.
6. **Write `index.md`**: frontmatter, then prose stating the invariants the
   schema cannot express and why the shape is what it is.
7. **Add `examples/*.json`** — concrete models only.
8. **Run the catalog check** and report the result.

### 1. Owner scope is responsibility, not visibility

Any entity in the solution may reference any datamodel of that solution, so
"who needs to see it" is never the question. Ask **who is asked to approve a
change to it**:

| Signal                                                        | Bucket                             |
|---------------------------------------------------------------|------------------------------------|
| One component writes it and owns its meaning                  | that component's `datamodel/`      |
| Several components of one product share it                    | that product's `datamodel/`        |
| Two products, or the solution's vocabulary, depend on it      | the solution's `datamodel/`        |

Solution level is not the safe default. It makes every change a solution-wide
review. In the acme fixture `base-record`, `money` and `auditable` are
solution-level because fifteen, twelve and six datamodels spread across every
product `$ref` them, and `problem` is there because six protocols in five
products name it as their failure payload — a model can earn the root through
the protocol graph without a single schema `$ref` pointing at it. In contrast
`payment-method` sits in the shop product
because exactly two shop datamodels use it. Recount before promoting; do not
trust these numbers, which drift as the fixture grows:

```bash
grep -rho 'schemas/acme/[a-z0-9/-]*' --include='schema.json' solutions/ | sort | uniq -c | sort -rn
```

An entity is never moved once it exists (`evolution.md`) — getting the bucket
wrong costs a swap. Decide before creating the directory.

### 2. `usage` and `abstract`

`usage` is required and has no default, because it cannot be inferred: a model
with no protocol reference today may be pure storage or an exchange model whose
protocol is not written yet.

| Value      | Means                                                              | Fixture archetype                        |
|------------|--------------------------------------------------------------------|------------------------------------------|
| `storage`  | Persisted; this shape never crosses a boundary.                    | —                                        |
| `exchange` | Exists only in flight — request, response, or event body.          | `order-request` ("never persisted in this shape") |
| `both`     | The same shape is persisted *and* published.                       | `order` — the aggregate and the settlement payload |

`both` is not a hedge. It widens the review surface: an additive change then
needs both a migration plan and a producer/consumer rollout order. Declare the
narrower value and widen it when the second use actually appears — `usage` is
frontmatter metadata, so widening it is an ordinary `version` bump. Declaring
`storage` on a model a protocol names as a payload is `W_DM_USAGE_MISMATCH`, so
the value is a checked claim, not a label.

Set `abstract: true` **only** for a model that is never instantiated on its own
— a base or a mixin. It is not a way to say "nothing uses it yet". An abstract
model is excluded from the store/exchange views, MUST NOT carry `examples/`, and
raises `W_DM_ABSTRACT_USE` when a protocol payload or an `exposes` edge points
at it. Using one as an `allOf` base is the intended use and is never flagged.

### 3. Pick the composition shape

| Situation                                                        | Shape                                                              |
|-------------------------------------------------------------------|--------------------------------------------------------------------|
| Two or more concrete models share identity/lifecycle properties  | An `abstract: true` base; each derives via root-level `allOf` + `$ref` |
| A cross-cutting property set with no identity of its own         | The same mechanism. "Mixin" is a word, not a flag — order in `allOf` is irrelevant |
| One field holds one of several alternative shapes                | `oneOf` over `$ref`s to concrete sibling entities, each tagged by a shared `const` property |
| A shape repeats inside **one** document only                     | `$defs` + `#/$defs/name`                                            |
| …and a second entity now needs that shape                        | **Promote it** to its own datamodel entity                          |

Inheritance is stock `allOf` + `$ref` and nothing else — there is no `extends`,
no `x-inherits`, no portal-side merge. A schema whose root carries `allOf`
branches that `$ref` other datamodels *is* a derived model.

**Do not pre-promote.** Keep a shape in `$defs` while all of these hold: one
entity, structurally trivial, no independent meaning, no separate lifecycle.
`positive-int` stays; `money` was promoted the moment a second entity needed it.
The full promotion trigger table is in `schemas.md`. Promotion is additive on the
promoting entity — add the new datamodel at `version: 1`, replace `#/$defs/x`
with a `$ref` to its schema URL, bump the promoting entity's `version`. The
instance shape does not change, so no swap.

For a union, the portal derives a variant map **only** if every branch is an
object schema, every branch declares the same tag property, each tag is a
distinct `const`, and the tag is in each branch's `required`. Anything less
still validates but renders as an opaque blob (`W_DM_UNION_TAG`).

### 4. Compute `$id` — never hand-type it

The `$id` is the URL the portal serves the document at. The path after
`/schemas/` is the entity's SRN path verbatim:

```text
solutions/acme/product/shop/datamodel/order-line/schema.json
          └────────────────────────────────────┘
          strip "solutions/" and "/schema.json" — what is left is the SRN path

$id = $SCHEMA_BASE_URL + "/schemas/" + acme/product/shop/datamodel/order-line
SRN = "srn://"          +              acme/product/shop/datamodel/order-line
```

`SCHEMA_BASE_URL` defaults to `http://localhost:3000` and is a deployment-wide
constant baked into the files; changing it means rewriting every `$id` and
`$ref` with `scripts/migrate_schema_ids.py`. Verify what was written rather than
eyeballing it:

```bash
python3 - <<'PY'
import json, os, pathlib
base = os.environ.get("SCHEMA_BASE_URL", "http://localhost:3000").rstrip("/")
for s in sorted(pathlib.Path("solutions").glob("**/datamodel/*/schema.json")):
    want = f"{base}/schemas/{s.parent.relative_to('solutions')}"
    got = json.loads(s.read_text()).get("$id")
    if got != want:
        print(f"{s}\n  want {want}\n  got  {got}")
PY
```

Why URLs at all: a stock tool — `ajv`, `json-schema-to-typescript`,
`quicktype`, `json-schema-ref-parser` — given only the `$id` can fetch the whole
transitive closure over HTTP, knowing nothing about this framework. A relative
file path resolved only inside a clone of the repo, invoked from the right
directory. That is the whole reason for the form; the fact that references stop
encoding the referrer's depth is a side benefit, not the argument.

### 5–7. Write the files

Skeleton — every keyword here is load-bearing:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "http://localhost:3000/schemas/acme/<srn-path>",
  "title": "…",
  "type": "object",
  "allOf": [ { "$ref": "http://localhost:3000/schemas/acme/datamodel/base-record" } ],
  "properties": { "x": { "$ref": "#/$defs/positive-int" } },
  "required": [ "x" ],
  "$defs": { "positive-int": { "type": "integer", "minimum": 1 } }
}
```

Prose in `index.md` earns its place by carrying what JSON Schema cannot: ordering
invariants, cross-field constraints, why a representation was chosen, and the
version history in words. Link with full `srn://…` form; prose links may pin.

## Traps

- **A base MUST NOT close itself.** `"additionalProperties": false` on anything
  used as an `allOf` base is `E_DM_CLOSED_BASE` — `allOf` branches evaluate
  independently, so a closed base rejects every property the derived model adds.
  Leave `additionalProperties` unset on concrete models too: consumers must
  tolerate unknown properties from later versions.
- **Adding an `allOf` branch to a base that declares `required` is a tightening,
  not an addition.** `required` is the union across branches. Pulling
  `base-record` (`required: [id, created-at]`) into an existing concrete model
  invalidates every stored instance — that is a swap.
- **A `$ref` names an entity, never a version.** `…/money@1` is
  `E_DM_REF_TARGET`. Pins live in `relations.uses` (`/datamodel/money@1`), the
  only surface where they resolve.
- **Do not mirror `$ref` edges under `relations.uses`.** The portal derives the
  reference graph and the inheritance tree from `schema.json`. Reserve `uses` on
  a datamodel for what the schema cannot say — chiefly a version pin.
- **`$defs` are entity-private.** A `$ref` into another entity's `$defs` is
  `E_DM_FOREIGN_DEFS`. That prohibition is what forces promotion.
- **No `$id` below the root** (`E_DM_ID_FORBIDDEN`) — it re-bases every
  reference beneath it, and one document quietly becomes two. No `x-srn`
  (`E_DM_SRN_RETIRED`) — `$id` carries identity now.
- **Forbidden keywords** (`E_DM_KEYWORD`): `$dynamicRef` and `$dynamicAnchor`
  make the inheritance graph late-bound, so the portal cannot derive it
  statically; `$anchor` is a second, ungreppable way to address a local shape;
  `$vocabulary` authors a dialect, and the dialect is fixed.
- **Every file in `examples/` must validate against the *flattened* schema** —
  including `required` inherited through `allOf` (`E_DM_EXAMPLE_INVALID`).
- **Any edit to any file in the entity directory bumps `version`** — schema-only
  and examples-only edits included. Only a `status`-alone change is exempt.
- **Renaming a property is never additive**, at any version number. Add the new
  one as optional, mark the old `"deprecated": true`, let them coexist.

## Additive in place, or a swap?

The test is mechanical: **version N+1 MUST accept every instance version N
accepted.** The full keyword table is in `schemas.md`. Four rows are the ones
authors get wrong:

| Edit                                              | Looks like | Actually            |
|---------------------------------------------------|------------|---------------------|
| Add an `allOf` `$ref` to a base with `required`   | addition   | tightening → swap   |
| Add or tighten a `pattern`                        | doc polish | tightening → swap   |
| Set `"additionalProperties": false`               | hygiene    | tightening → swap   |
| A `$ref` target evolves additively                | a change here | no edit, no bump — the obligation sits with the target |

`E_DM_NOT_ADDITIVE` covers only the decidable subset; a clean build is evidence,
not proof. Semantic breaks — same name, same type, new meaning — are invisible
to any checker and are caught in review.

## Worked pair

`references/worked-pair.md` reproduces an abstract base and a model derived from
it — `solutions/acme/datamodel/base-record/` and
`.../component/payment/datamodel/order/` — verbatim: both `index.md`
frontmatters, both `schema.json` files, one `examples/` document, and an audit
of the pair against every rule above. It exercises two `allOf` branches, a
union-typed property, an array of another entity, one private `$defs` shape, and
the flattened-`required` rule that makes the example valid. Read it before
writing a datamodel for the first time.

The tagged-union reference implementation is a second pair:
`solutions/acme/product/shop/datamodel/payment-method/` is a bare `oneOf` of two
`$ref`s, each branch a concrete sibling (`card-payment`, `sepa-payment`)
declaring `"method": { "const": … }` inside its `required`.

## Finish

Every run that writes files ends here:

```bash
cd framework/portal && npx vitest run src/lib/catalog
```

Zero **error** diagnostics is the pass condition; there is no CLI. Report
pass/fail and every diagnostic with its code and file. Codes are documented in
`schemas.md` and in `framework/spec/kinds/datamodel.md`. If a diagnostic demands
removing, renaming, narrowing or moving an entity, that is not a fix — stop and
say it requires a swap.

**The catalog check does not run the schema registry over the shipped tree.**
`E_DM_*` is raised when the portal renders a datamodel page, not by this suite —
which asserts only that every `$id` equals the URL the portal serves it at and
that every non-local `$ref` names a real datamodel with a `schema.json` behind
it. After writing or editing a `schema.json`, open that entity's page
(`npm run dev`, then the datamodel's URL) or use the `validate-catalog` skill,
which carries the full coverage map.
