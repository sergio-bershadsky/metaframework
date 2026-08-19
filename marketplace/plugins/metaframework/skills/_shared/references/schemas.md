# JSON Schema conventions for datamodels

> Distilled from `framework/spec/kinds/datamodel.md` (version 4). **When
> `framework/spec/` is present in the repository, it is authoritative and wins
> over this file.** This bundled copy exists because an installed plugin cannot
> see the repo spec.
>
> **Version caveat:** an earlier convention had `schema.json` carry no `$id` and
> use relative file-path `$ref`s. It was superseded because those references are
> resolvable only inside a clone of the repo, from the right directory — they
> are not *dereferenceable*. Some core spec documents (`index.md`, `srn.md`,
> `frontmatter.md`, `evolution.md`) still show that retired form in passing;
> `kinds/datamodel.md` and the actual catalog under `solutions/` are current.
> Write the HTTP-URL form below. Never author the retired form.

## Dialect, filename, identity

Exactly one dialect: **JSON Schema draft 2020-12**. One filename, bare:
`schema.json` — never `order.schema.json`, never `order.json`. The portal's
schema route looks for that exact name, so a renamed file 404s at every address
that points at it.

The document's `$id` is **the URL the portal serves it at**. The path after
`/schemas/` is the entity's SRN path verbatim, because SRN ≡ path ≡ URL path:

```text
solutions/acme/datamodel/money/schema.json
→ srn://acme/datamodel/money
→ http://localhost:3000/schemas/acme/datamodel/money
```

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "http://localhost:3000/schemas/acme/datamodel/money",
  "title": "Money",
  "type": "object",
  "properties": {
    "amount": { "type": "string", "pattern": "^-?[0-9]+\\.[0-9]{2}$" },
    "currency": { "type": "string", "enum": ["EUR", "GBP", "USD"] }
  },
  "required": ["amount", "currency"]
}
```

The origin comes from **`SCHEMA_BASE_URL`** (default `http://localhost:3000`)
and is never hand-typed. It is baked into the artifacts, which makes it a
deployment-wide constant: changing it requires rewriting every `$id` and `$ref`
(`scripts/migrate_schema_ids.py` does it, idempotently). The loader enforces
agreement, so the variable and the files cannot drift.

| Requirement                                                                  | Violation             |
|------------------------------------------------------------------------------|-----------------------|
| `$schema` present and exactly `https://json-schema.org/draft/2020-12/schema` | `E_DM_DIALECT`        |
| Valid against the 2020-12 meta-schema                                        | `E_DM_SCHEMA_INVALID` |
| Root `$id` present                                                           | `E_DM_ID_MISSING`     |
| Root `$id` equals this entity's schema URL, origin included                  | `E_DM_ID_MISMATCH`    |
| No `$id` at any level **below** the root                                     | `E_DM_ID_FORBIDDEN`   |
| No `x-srn` — the annotation is retired                                       | `E_DM_SRN_RETIRED`    |

A nested `$id` re-bases every reference beneath it onto a second identity, which
is how one document quietly becomes two. Local shapes use `#/$defs` pointers,
which need no identity.

## `$ref` is an absolute schema URL

Every reference to **another** entity is that entity's schema URL, complete with
origin. There is no relative form, no `srn://`, no file path, no depth
arithmetic — and therefore no `..` chains to recount when anything moves.

```json
{ "$ref": "http://localhost:3000/schemas/acme/datamodel/money" }
```

Rejected forms and why:

```json
{ "$ref": "../money/schema.json" }                                  /* E_DM_REF_TARGET — retired relative form */
{ "$ref": "srn://acme/datamodel/money@1" }                          /* E_DM_REF_TARGET — no tool dereferences srn:// */
{ "$ref": "/schemas/acme/datamodel/money" }                         /* E_DM_REF_TARGET — origin-relative, not portable */
{ "$ref": "https://elsewhere.example/schemas/acme/datamodel/money" }/* E_DM_REF_TARGET — foreign host */
{ "$ref": "http://localhost:3000/schemas/acme/datamodel" }          /* E_DM_REF_TARGET — a bucket is not addressable */
{ "$ref": "http://localhost:3000/schemas/acme/datamodel/money@1" }  /* E_DM_REF_TARGET — a URL carries no version pin */
{ "$ref": "http://localhost:3000/api/history/acme/datamodel/money" }/* E_DM_REF_ESCAPE — outside /schemas/ */
{ "$ref": "http://localhost:3000/schemas/globex/datamodel/money" }  /* E_SRN_CROSS_SOLUTION — sealed universes */
```

**A `$ref` names an entity, never a version.** A pin is rejected rather than
ignored. Where a pin genuinely matters — "this model is reviewed against
`money@1`" — it lives in frontmatter `relations.uses` as `/datamodel/money@1`,
which is the only place it can live and the only edge worth authoring by hand.
Do **not** mirror ordinary `$ref` edges under `relations`; the portal derives
them from the schema.

Mapping back to an SRN is a rename: strip `SCHEMA_BASE_URL + "/schemas/"`,
prefix `srn://`. Readers see SRNs because that is the catalog's vocabulary;
authors write URLs because tools dereference them.

## Local pointers and `$defs` privacy

Fragments resolve inside the document and are unchanged by all of the above:

```json
{ "$ref": "#/$defs/positive-int" }   /* a shape defined in this document */
{ "$ref": "#" }                      /* this document's root — self-recursion */
```

**A `$ref` MUST NOT point into another entity's `$defs`** (`E_DM_FOREIGN_DEFS`).
`$defs` is local scratch space; the moment a shape is needed elsewhere it is
**promoted to its own datamodel entity**. This keeps the reference graph a graph
of entities, not of anonymous fragments.

Promote as soon as any of these is true:

| Trigger                                              | Example                                        |
|------------------------------------------------------|------------------------------------------------|
| A second entity needs it                             | `money`, used by `order`, `refund`, `invoice`  |
| It is persisted or exchanged in its own right        | `address`, stored and posted to a lookup API   |
| It needs its own `version`, `status`, `owner`, prose | `tax-code`, owned by finance, its own cadence  |
| It should be a first-class node in derived views     | anything a protocol names as a message payload |

Keep it in `$defs` only when all of these hold: single entity, structurally
trivial, no independent meaning, no separate lifecycle — `positive-int`, a local
enum, a tuple used twice in one document.

Promotion is **additive** on the promoting entity: add the new datamodel at
`version: 1`, replace `#/$defs/x` with a `$ref` to its schema URL, bump the
promoting entity's `version`. The instance shape does not change, so no swap.

## Forbidden keywords

| Keyword                         | Why forbidden                                                                     |
|---------------------------------|-----------------------------------------------------------------------------------|
| `$dynamicRef`, `$dynamicAnchor` | Late binding makes the inheritance graph non-static; the portal cannot derive it. |
| `$anchor`                       | A second way to address a local shape; `#/$defs/name` stays greppable.            |
| `$vocabulary`                   | Dialect authoring — the dialect is fixed.                                         |

All are `E_DM_KEYWORD`. A nested `$id` is also forbidden, under
`E_DM_ID_FORBIDDEN`.

## Inheritance is stock `allOf` + `$ref`

There is no `extends`, no `x-inherits`, no portal-side merge directive. A schema
whose root carries `allOf` branches that `$ref` other datamodels **is** a
derived model; that is the entire inheritance layer.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "http://localhost:3000/schemas/acme/product/shop/component/checkout/component/payment/datamodel/order",
  "title": "Order",
  "type": "object",
  "allOf": [
    { "$ref": "http://localhost:3000/schemas/acme/datamodel/base-record" },
    { "$ref": "http://localhost:3000/schemas/acme/datamodel/auditable" }
  ],
  "properties": {
    "total": { "$ref": "http://localhost:3000/schemas/acme/datamodel/money" },
    "lines": {
      "type": "array",
      "items": { "$ref": "http://localhost:3000/schemas/acme/product/shop/datamodel/order-line" }
    },
    "line-count": { "$ref": "#/$defs/positive-int" }
  },
  "required": ["total"],
  "$defs": { "positive-int": { "type": "integer", "minimum": 1 } }
}
```

**The composition trap: a base MUST NOT close itself.**
`"additionalProperties": false` on a schema used as an `allOf` base is
`E_DM_CLOSED_BASE` — `allOf` branches are evaluated independently, so a closed
base rejects every property the derived model adds. Concrete models should also
leave `additionalProperties` unset, because consumers must tolerate unknown
properties from later versions.

A base or mixin is an ordinary datamodel entity with `abstract: true`. There is
no `mixin` flag — mechanically a mixin is just another `allOf` branch, and
branch order is irrelevant (conjunction is commutative). An abstract model must
not carry `examples/`, and pointing a protocol payload or an `exposes` edge at
one is `W_DM_ABSTRACT_USE`; using it as an `allOf` base is the intended use and
never flagged.

A cycle in the root-`allOf` graph is `E_DM_INHERIT_CYCLE`. Recursion **through
properties or items** is legal and useful.

## Discriminated unions

`oneOf` over branches, each tagged by a `const` property with the same name in
every branch, present in each branch's `required`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "http://localhost:3000/schemas/acme/product/shop/datamodel/payment-method",
  "oneOf": [
    { "$ref": "http://localhost:3000/schemas/acme/product/shop/datamodel/card-payment" },
    { "$ref": "http://localhost:3000/schemas/acme/product/shop/datamodel/sepa-payment" }
  ]
}
```

Every branch must be an object schema; tags must be distinct `const` values,
lowercase kebab-case. A `oneOf` that fails this still validates but renders as
an opaque blob and is reported `W_DM_UNION_TAG`.

## Additive evolution of a schema

The test never changes: **version N+1 MUST accept every instance version N
accepted.** See `evolution.md` for the general rules and the swap procedure.

| Legal in place — bump `version`                             | Forbidden in place — requires a swap                     |
|-------------------------------------------------------------|----------------------------------------------------------|
| Add an optional property                                    | Add a name to `required`                                 |
| Widen a type (`"string"` → `["string","null"]`)             | Narrow a type                                            |
| Add an enum value                                           | Remove an enum value                                     |
| Relax a bound (`maxLength: 64` → `256`)                     | Tighten a bound                                          |
| Remove a name from `required` (loosens)                     | Remove or rename a property                              |
| Add a `oneOf` branch with a new `const` tag                 | Remove a branch, or reuse a tag for a new shape          |
| Add an `allOf` branch introducing only optional properties  | Add an `allOf` `$ref` to a base that declares `required` |
| A `$ref` target evolving additively — no edit here at all   | Repoint a `$ref` at a different or narrower entity       |
| Add `description`, `examples`, `format`, `deprecated: true` | Set `"additionalProperties": false` where it was not     |
| Add a `$defs` shape, or drop an unreferenced one            | Add or tighten a `pattern`                               |

Notes:

- `format` is annotation-only here — the validator runs with format assertion
  disabled, so adding `"format": "uuid"` rejects nothing.
- `deprecated: true` is the additive replacement for property removal. You can
  never remove a property; mark it, stop writing it, let consumers migrate.
- A `$ref` names an entity, so a target's additive evolution is silent — the
  referrer's `version` does not move for a change it did not make.

The portal diffs the current file against version N read from git and reports
`E_DM_NOT_ADDITIVE` for the decidable subset. The check is deliberately
conservative; a clean build is evidence, not proof.

## Error classes

| Code                   | Meaning                                                                    |
|------------------------|----------------------------------------------------------------------------|
| `E_DM_SCHEMA_MISSING`  | Datamodel entity directory has no `schema.json`.                           |
| `E_DM_SCHEMA_INVALID`  | Not valid JSON, or not valid against the 2020-12 meta-schema.              |
| `E_DM_DIALECT`         | `$schema` missing or not exactly the 2020-12 dialect URI.                  |
| `E_DM_ID_MISSING`      | Root `$id` absent.                                                         |
| `E_DM_ID_MISMATCH`     | Root `$id` ≠ the entity's schema URL (wrong entity, origin, or a pin).     |
| `E_DM_ID_FORBIDDEN`    | `$id` present below the root.                                              |
| `E_DM_SRN_RETIRED`     | `x-srn` still present.                                                     |
| `E_DM_KEYWORD`         | Forbidden keyword used.                                                    |
| `E_DM_REF_TARGET`      | A `$ref` is not an absolute schema URL of this portal.                     |
| `E_DM_REF_ESCAPE`      | A `$ref` is on this origin but outside `/schemas/`.                        |
| `E_DM_FOREIGN_DEFS`    | `$ref` points into another entity's `$defs`.                               |
| `E_DM_INHERIT_CYCLE`   | Cycle in the root-`allOf` inheritance graph.                               |
| `E_DM_CLOSED_BASE`     | `"additionalProperties": false` on a schema used as an `allOf` base.       |
| `E_DM_EXAMPLE_INVALID` | A file in `examples/` fails validation against the entity's own schema.    |
| `E_DM_NOT_ADDITIVE`    | Detectable instance-superset violation between version N and N+1.          |
| `W_DM_ABSTRACT_USE`    | Abstract model used as a payload / `exposes` target, or carrying examples. |
| `W_DM_UNION_TAG`       | `oneOf` without a derivable shared `const` tag.                            |
| `W_DM_CONTRADICTION`   | Derived model contradicts (rather than restricts) an inherited constraint. |
| `W_DM_USAGE_MISMATCH`  | Model named as a protocol payload while declaring `usage: storage`.        |

Retired, MUST NOT be emitted: `E_DM_SRN_MISMATCH`, `E_DM_REF_KIND`,
`E_DM_ID_INVALID`, `W_DM_UNPINNED_REF`, `E_VER_ID_MISMATCH`.
