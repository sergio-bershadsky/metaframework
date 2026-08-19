---
name: model-data
description: This skill should be used when the user asks to "add a datamodel", "create a schema.json", "model this data in the catalog", "add a JSON Schema entity", "write an abstract base model", "add a mixin", "build a discriminated union", "promote a $defs shape to its own datamodel", "extract a shared type", "pick usage storage or exchange", or asks whether a schema edit is additive or needs a swap — in a metaframework solution catalog under `solutions/`.
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

**One version trap in the sources themselves.** An earlier convention had
`schema.json` carry no `$id` and use relative file-path `$ref`s. It was retired
because those references are not dereferenceable. Some core spec documents, and
the prose of `solutions/acme/.../datamodel/order/index.md`, still describe that
retired form in passing. Never author it, and never copy prose that explains it.

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
review. In the acme fixture `money`, `base-record`, `auditable` and `problem`
are solution-level because five, four, two and three entities respectively
depend on them; `payment-method` sits in the shop product because exactly two
shop entities use it.

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

## Worked pair — abstract base and derived model

Verbatim from the shipped catalog. Base:
`solutions/acme/datamodel/base-record/`, derived:
`solutions/acme/product/shop/component/checkout/component/payment/datamodel/order/`.

```text
solutions/acme/
├── datamodel/
│   ├── base-record/      index.md  schema.json                 abstract base
│   ├── auditable/        index.md  schema.json                 abstract mixin
│   └── money/            index.md  schema.json  examples/      concrete vocabulary
└── product/shop/component/checkout/component/payment/datamodel/
    └── order/            index.md  schema.json  examples/      concrete, derived
```

`base-record/index.md` frontmatter, then the prose section that carries the
non-obvious part:

```yaml
---
name: base-record
kind: datamodel
version: 1
title: Base record
summary: Identity and creation timestamp shared by every persisted or exchanged record in the solution.
status: approved
owner: team-platform
usage: both
abstract: true
tags:
  - foundation
---
```

```markdown
## Why it does not close itself

`additionalProperties` is deliberately unset. In JSON Schema an `allOf` branch is
evaluated independently of its siblings, so a closed base would reject every
property its descendants add — the classic composition trap.
```

`base-record/schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "http://localhost:3000/schemas/acme/datamodel/base-record",
  "title": "Base record",
  "description": "Identity and creation time. Extended through allOf; never instantiated alone.",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "description": "Stable identity, assigned by the writer before first persistence."
    },
    "created-at": {
      "type": "string",
      "format": "date-time",
      "description": "RFC 3339 timestamp of first persistence, in UTC."
    }
  },
  "required": [
    "id",
    "created-at"
  ]
}
```

`order/index.md` frontmatter — note `abstract: false`, `usage: both`, and that
the schema's `$ref` edges are absent from `relations`:

```yaml
---
name: order
kind: datamodel
version: 3
title: Order
summary: Customer order aggregate persisted by the payment component and published on settlement.
status: approved
owner: team-payments
usage: both
abstract: false
tags:
  - commerce
  - aggregate
x-jira-epic: SHOP-142
---
```

`order/schema.json` — two `allOf` branches (base plus mixin), a union-typed
property, an array of another entity, and one private `$defs` shape:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "http://localhost:3000/schemas/acme/product/shop/component/checkout/component/payment/datamodel/order",
  "title": "Order",
  "description": "Order aggregate owned by the payment component.",
  "type": "object",
  "allOf": [
    {
      "$ref": "http://localhost:3000/schemas/acme/datamodel/base-record"
    },
    {
      "$ref": "http://localhost:3000/schemas/acme/datamodel/auditable"
    }
  ],
  "properties": {
    "total": {
      "$ref": "http://localhost:3000/schemas/acme/datamodel/money",
      "description": "Gross amount payable."
    },
    "discount": {
      "$ref": "http://localhost:3000/schemas/acme/datamodel/money",
      "description": "Applied discount; added in version 2. Never exceeds total."
    },
    "status": {
      "enum": [
        "placed",
        "paid",
        "refunded"
      ],
      "description": "\"refunded\" added in version 3. Moves forward only."
    },
    "payment": {
      "$ref": "http://localhost:3000/schemas/acme/product/shop/datamodel/payment-method",
      "description": "The instrument that was actually charged."
    },
    "lines": {
      "type": "array",
      "items": {
        "$ref": "http://localhost:3000/schemas/acme/product/shop/datamodel/order-line"
      },
      "description": "Lines as authorized."
    },
    "line-count": {
      "$ref": "#/$defs/positive-int",
      "description": "Denormalized count, kept for reporting."
    }
  },
  "required": [
    "total"
  ],
  "$defs": {
    "positive-int": {
      "type": "integer",
      "minimum": 1
    }
  }
}
```

`order/examples/minimal.json` — satisfies the **flattened** required union
`["id", "created-at", "total"]`, not the four names visible in this file:

```json
{
  "id": "0f6f0f2a-1a6b-4a0e-9c3a-6a2f4a0c1d55",
  "created-at": "2026-08-19T09:41:00Z",
  "total": { "amount": "49.90", "currency": "EUR" },
  "status": "placed"
}
```

Audit of the pair: the base is `abstract: true`, carries no `examples/`, and does
not close itself; both `allOf` branches point at abstract models, so no
`W_DM_ABSTRACT_USE`; the `$id` of each equals `SCHEMA_BASE_URL + "/schemas/" +`
its SRN path; every cross-entity `$ref` is an unpinned absolute schema URL;
`positive-int` stays private because it is trivial and single-entity, while
`money` was promoted because five entities need it; the `money@1` pin, where a
pin is wanted, lives in a `relations.uses` edge and never in a `$ref`.

The union `payment-method` (`solutions/acme/product/shop/datamodel/`) is the
tagged-union reference implementation: a bare `oneOf` of two `$ref`s, each branch
a concrete sibling declaring `"method": { "const": … }` inside its `required`.

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
