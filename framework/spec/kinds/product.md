---
kind: spec
name: product
version: 1
status: review
title: Kind — product
summary: The product kind — the deliverable and ownership unit directly under a solution, its lifecycle and primary-actors fields, and its validation rules.
---

# Kind — product

A **product** is a direct child of a solution: the unit that is *delivered*,
*funded*, and *owned*. It owns components; it does not implement anything
itself.

Shared container rules **C1–C7** are defined in [solution.md](solution.md) and
bind products unchanged. This document adds only what is product-specific.

## Role in the hierarchy

```text
solutions/acme/                     # solution
└── shop/                           # ← product: srn://acme/shop
    ├── index.md
    ├── checkout/                   # component (product-owned)
    ├── protocol/order-events/      # product-owned protocol
    └── requirement/pci-scope/      # product-owned requirement
```

- A product is a container path of **exactly one segment**:
  `srn://{solution}/{product}`.
- **Products do not nest.** Every container below a product is a component, at
  every depth. A directory under a product whose `index.md` says
  `kind: product` is `E_FM_KIND_LOCATION` — `kind` is fixed by nesting depth
  ([frontmatter.md](../frontmatter.md)).

  ```yaml
  # solutions/acme/shop/checkout/index.md
  kind: product        # E_FM_KIND_LOCATION — below product level ⇒ component
  ```

- Two products in one solution are peers. A product needing something another
  product owns states `depends-on` and gets it by reference
  ([component.md](component.md)); it never absorbs it.

## Why the boundary sits here

The product line is the **ownership** line. Everything below it — components,
sub-components, their datamodels, ADRs, and requirements — has exactly one
responsible product, and that is what the portal rolls up, what a reviewer
routes a PR to, and what `owner` on the product page means. Solutions are too
coarse to own anything (they are the whole universe); components are too fine
(they are reused across products). One line, one owner.

## Frontmatter additions

On top of [frontmatter.md](../frontmatter.md); nothing there is redefined. Kept
deliberately minimal — two fields.

| Field            | Type                                                              | Required | Rule                                                        |
| ---------------- | ----------------------------------------------------------------- | -------- | ----------------------------------------------------------- |
| `lifecycle`      | enum: `concept \| incubating \| active \| maintenance \| sunset \| retired` | yes | Real-world stage of the product. |
| `primary-actors` | list of SRN refs                                                   | no       | Each MUST resolve to a solution-level `actor` (`E_PROD_ACTOR_TARGET`). SHOULD be set. |

### `lifecycle` — and why it is not `status`

`status` (common) describes **the document**: is this description drafted,
reviewed, approved, or retired as a description. `lifecycle` describes **the
product in the world**. They move independently, and conflating them would make
one of the two unreadable.

| `lifecycle`   | Meaning                                                             |
| ------------- | ------------------------------------------------------------------- |
| `concept`     | Described before it is built; nothing runs yet.                     |
| `incubating`  | Being built; contracts still moving.                                |
| `active`      | In production and invested in.                                      |
| `maintenance` | In production, no new capability; fixes and compliance only.        |
| `sunset`      | Migration away is underway; new consumers are refused.              |
| `retired`     | No longer running. The description is kept (nothing is ever deleted).|

```yaml
lifecycle: retired
status: approved      # legal and common: an accurate, reviewed description of
                      # a product that no longer runs
```

```yaml
lifecycle: active
status: draft         # legal: a running product whose description is unfinished
```

Six stages, closed. Adding a stage is an additive spec change (bump this
document's `version`); a team-local nuance goes in an `x-` field, never in a
seventh value.

### `primary-actors` — and why it is not a relation edge

The v1 relation edge set ([frontmatter.md](../frontmatter.md)) has **no edge
whose legal target kind is `actor`** — `uses` targets datamodel, protocol,
environment, and component. So actor attachment cannot be expressed as a
relation without redefining the common contract, which kind documents MUST NOT
do. Hence a kind field.

`primary-actors` carries the same SRN semantics as a relation list: absolute or
relative refs, optional `@` pin, validated by [srn.md](../srn.md) rules V1–V6.
It answers exactly one question on the product page: *who is this for?*

```yaml
primary-actors:
  - /actor/customer                 # path-absolute → srn://acme/actor/customer
  - srn://acme/actor/support-agent  # absolute form, equivalent
  - /actor/warehouse-picker@2       # pinned
```

```yaml
primary-actors:
  - /shop/checkout                  # E_PROD_ACTOR_TARGET — a component, not an actor
  - /actor/courier                  # E_SRN_DANGLING — no such entity
  - srn://globex/actor/customer     # E_SRN_CROSS_SOLUTION
```

*Primary* means the actors the product exists to serve — not every actor that
ever touches it. Incidental actors show up through protocol participation and
are derived, not listed here.

## What may nest inside

| Child                                                     | Allowed | Note                                                  |
| --------------------------------------------------------- | ------- | ------------------------------------------------------ |
| component directories (nestable)                           | yes     | Any number, any depth ([component.md](component.md)).  |
| `datamodel/`, `protocol/`, `adr/`, `requirement/` buckets   | yes     | Product-owned entities; protocol only at the NCA of its participants. |
| `actor/`, `environment/` buckets                            | no      | Solution-level only — `E_STRUCT_KIND_PLACEMENT`.       |
| another product                                             | no      | Products do not nest — `E_FM_KIND_LOCATION`.           |

## Validation rules

| #  | Rule                                                                        | Error class            |
| -- | --------------------------------------------------------------------------- | ---------------------- |
| P1 | Product directory is a direct child of a solution directory.                | `E_FM_KIND_LOCATION`   |
| P2 | `lifecycle` present and in the closed enum.                                 | `E_FM_SCHEMA`          |
| P3 | Every `primary-actors` entry resolves to an entity with `kind: actor`.      | `E_PROD_ACTOR_TARGET`  |
| P4 | Every `primary-actors` entry parses, resolves, and stays in the solution.   | `E_SRN_*` (V1–V6)      |
| P5 | No `actor`/`environment` bucket inside the product.                         | `E_STRUCT_KIND_PLACEMENT` |

## Worked example

`solutions/acme/shop/index.md`:

```yaml
---
name: shop
kind: product
version: 4
title: Shop
summary: Customer-facing storefront, cart, and checkout for the acme retail business.
status: approved
owner: team-shop
lifecycle: active
primary-actors:
  - /actor/customer
  - /actor/support-agent
relations:
  exposes:
    - protocol/order-events           # product-owned, relative to this document
  depends-on:
    - /billing/ledger                 # component owned by the billing product
  implements:
    - requirement/pci-scope
  uses:
    - /datamodel/money@1
tags:
  - commerce
  - customer-facing
x-cost-center: "4711"
---

# Shop

Everything a customer touches between browsing and a confirmed order. Fulfilment
and settlement happen elsewhere: shop emits
[order-events](srn://acme/shop/protocol/order-events) and stops there.

## Components

- [checkout](srn://acme/shop/checkout) — cart to order, pricing, payment
  orchestration.
- [inventory](srn://acme/shop/inventory) — stock availability projection.

Both run in [production](srn://acme/environment/production); the component pages
carry the environment declarations.

## Ownership

`team-shop` owns this product and everything under it. Reuse of
[ledger](srn://acme/billing/ledger) is by reference — it stays owned by
`team-billing`.
```

## What the portal derives

- **Component tree** — the product's whole subtree, each node badged with its
  `component-type` ([component.md](component.md)).
- **Lifecycle badge** — `lifecycle` beside `status`, never merged; the solution
  dashboard sorts product cards by it.
- **Actors panel** — resolved `primary-actors`, with the inverse ("products
  serving this actor") derived onto each actor page. Never authored there (C1).
- **Public surface** — the product's `exposes` edges, plus every `exposes` edge
  of its components, as one list of protocols and datamodels other products may
  consume.
- **Inbound reuse** — derived `depended-on-by`: which other products depend on
  this product or on components it owns.
- **Environment matrix** — environments × components, rolled up from the
  components' `uses` edges to environment entities; shows where the product runs
  without any product-level declaration.
- **Owned entity lists** — datamodels, protocols, ADRs, requirements in this
  product's buckets, with status rollup (C7).

## Product error classes

| Code                    | Meaning                                                              |
| ----------------------- | --------------------------------------------------------------------- |
| `E_PROD_ACTOR_TARGET`   | A `primary-actors` entry does not resolve to a solution-level `actor`.|
