# Worked pair — an abstract base and the model derived from it

> Reproduced **verbatim** from the shipped catalog. Base:
> `solutions/acme/datamodel/base-record/`; derived:
> `solutions/acme/product/shop/component/checkout/component/payment/datamodel/order/`.
> When the repository is present, read the originals; this copy exists because
> an installed plugin cannot see them.

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
property its descendants add — the classic composition trap, and the reason the
framework names it as its own error class rather than leaving it to review.
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

