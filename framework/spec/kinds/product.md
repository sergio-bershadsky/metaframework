---
kind: spec
name: product
version: 4
status: review
title: Kind — product
summary: The product kind — the deliverable and ownership unit in the solution's product/ bucket, its lifecycle and primary-actors fields, and the grammar that fixes its placement.
---

# Kind — product

A **product** lives in the solution's `product/` bucket: the unit that is
*delivered*, *funded*, and *owned*. It owns components; it does not implement
anything itself.

Shared container rules **C1–C7** are defined in [solution.md](solution.md) and
bind products unchanged. This document adds only what is product-specific.

## Role in the hierarchy

```text
solutions/acme/                            # solution        srn://acme
└── product/                               # kind bucket — never an entity
    └── shop/                              # ← product      srn://acme/product/shop
        ├── index.md
        ├── component/                     # kind bucket
        │   └── checkout/                  # component (product-owned)
        ├── protocol/
        │   └── order-events/              # product-owned protocol
        └── requirement/
            └── pci-scope/                 # product-owned requirement
```

- A product's SRN is **exactly one `{kind}/{name}` pair**:
  `srn://{solution}/product/{product}`. Nothing shorter addresses a product, and
  nothing longer is one.
- Its children are kind buckets only. Components sit inside a `component/`
  bucket, not directly under the product directory — `srn://acme/product/shop`
  plus a bare `checkout` segment is an odd number of segments after the
  authority, which is `E_SRN_SYNTAX`.
- Two products in one solution are peers. A product needing something another
  product owns states `depends-on` and gets it by reference
  ([component.md](component.md)); it never absorbs it.

### Placement is grammar, not a loader check

A `product` pair may only be the **first** pair after the solution, and no other
pair may precede it. The parser enforces this while reading the path, so both
failures below happen before the entity's frontmatter is ever opened, and both
are `E_SRN_PLACEMENT` ([srn.md](../srn.md)):

```text
solutions/acme/product/shop/                              # legal
solutions/acme/product/shop/product/wishlist/             # products do not nest
solutions/acme/product/shop/component/checkout/product/x/ # nor sit below one
```

This is what replaced the old depth inference. A container's kind used to be
read off how deep it sat; now it is written in the path, so "products do not
nest" is a statement about the grammar rather than a rule the loader applies
afterwards. `E_FM_KIND_LOCATION` still exists but has a narrower job — a
`kind:` that disagrees with a bucket that is itself legally placed:

```yaml
# solutions/acme/product/shop/component/checkout/index.md
kind: product        # E_FM_KIND_LOCATION — the bucket says component
```

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
| `maintenance` | In production, no new features; fixes and compliance only.          |
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

A **component** carries a `lifecycle` too, and it is a different enum:
`planned | in-development | released | sunset | retired`
([component.md](component.md)). The field name is shared on purpose — one word
for "where is this in the real world" on both kinds that name a thing built
apart from the document describing it — and the values are not, because a
product is *positioned in a portfolio* while a component is *built and
shipped*. `concept` and `incubating` are investment states, which a component
inside a funded product is not in; `active` and `maintenance` are investment
states too, and the delivery fact underneath both is simply `released`. Only
`sunset` and `retired` mean the same thing on both, and that shared tail is what
earns the shared name (decision-record amendment 2026-08-20-b). The two are
validated per kind — `lifecycle: released` on a product is `E_FM_SCHEMA`, and so
is `lifecycle: incubating` on a component.

### `primary-actors` — and why it is not a relation edge

The relation edge set ([frontmatter.md](../frontmatter.md)) has **no edge whose
legal target kind is `actor`** — `uses` targets datamodel, protocol,
environment, and component, and the two edges added later did not change that
(`realizes` targets a capability, `measures` targets what a number is about). So
actor attachment cannot be expressed as a relation without redefining the common
contract, which kind documents MUST NOT do. Hence a kind field.

`primary-actors` carries the same SRN semantics as a relation list: absolute or
relative refs, optional `@` pin, validated by the reference rules in
[srn.md](../srn.md).
It answers exactly one question on the product page: *who is this for?*

```yaml
primary-actors:
  - /actor/customer                 # path-absolute → srn://acme/actor/customer
  - srn://acme/actor/support-agent  # absolute form, equivalent
  - /actor/warehouse-picker@2       # pinned
```

```yaml
primary-actors:
  - /product/shop/component/checkout   # E_PROD_ACTOR_TARGET — a component
  - /actor/courier                     # E_SRN_DANGLING — no such entity
  - /product/shop/actor/courier        # E_SRN_PLACEMENT — actors are solution-level,
                                       # so this path cannot exist at all
  - srn://globex/actor/customer        # E_SRN_CROSS_SOLUTION
```

*Primary* means the actors the product exists to serve — not every actor that
ever touches it. Incidental actors show up through protocol participation and
are derived, not listed here.

## What may nest inside

| Child                                                                | Allowed | Note                                                                           |
| -------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------ |
| `component/` bucket                                                  | yes     | Any number of components, nesting to any depth ([component.md](component.md)). |
| `datamodel/`, `protocol/`, `adr/`, `requirement/`, `metric/` buckets | yes     | Product-owned entities; protocol only at the NCA of its participants.          |
| `actor/`, `environment/`, `capability/`, `journey/` buckets          | no      | Solution-level only — `E_SRN_PLACEMENT`.                                       |
| a `product/` bucket                                                  | no      | Products do not nest — `E_SRN_PLACEMENT`.                                      |
| an entity directory not inside a bucket                              | no      | The path would have an odd segment count — `E_SRN_SYNTAX`.                     |

## Validation rules

Numbered `PD*` to avoid collision with the placement rules P1–P4 in
[srn.md](../srn.md), which also bind here — the same reason
[component.md](component.md) numbers its rules `CV*`.

| #   | Rule                                                                       | Error class            |
| --- | --------------------------------------------------------------------------- | ---------------------- |
| PD1 | The `product/` bucket is a direct child of a solution, and the product is a direct child of that bucket. | `E_SRN_PLACEMENT` |
| PD2 | `lifecycle` present and in the closed enum.                                | `E_FM_SCHEMA`          |
| PD3 | Every `primary-actors` entry resolves to an entity with `kind: actor`.     | `E_PROD_ACTOR_TARGET`  |
| PD4 | Every `primary-actors` entry parses, resolves, and stays in the solution.  | `E_SRN_*`              |
| PD5 | No `actor`/`environment`/`product` bucket inside the product.              | `E_SRN_PLACEMENT`      |
| PD6 | Frontmatter `kind: product` matches the `product/` bucket holding it.      | `E_FM_KIND_LOCATION`   |

PD1 and PD5 are the grammar's P1–P4 seen from this kind: they fail while the
directory's path is parsed, so no misplaced product ever reaches PD2–PD4 or PD6.

## Worked example

`solutions/acme/product/shop/index.md`:

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
    - protocol/order-events                 # this product's own bucket, so the
                                            # relative form is short and stable
  depends-on:
    - /product/billing/component/ledger     # component owned by billing
  implements:
    - requirement/pci-scope
  realizes:
    - /capability/order-fulfilment          # solution-level: an ability this
                                            # product is part of delivering
  uses:
    - /datamodel/money@1
tags:
  - commerce
  - customer-facing
x-cost-center: "4711"
---

Everything a customer touches between browsing and a confirmed order. Fulfilment
and settlement happen elsewhere: shop emits
[order-events](srn://acme/product/shop/protocol/order-events) and stops there.

## Components

- [checkout](srn://acme/product/shop/component/checkout) — cart to order,
  pricing, payment orchestration.
- [inventory](srn://acme/product/shop/component/inventory) — stock availability
  projection.

Both run in [production](srn://acme/environment/production); the component pages
carry the environment declarations.

## Ownership

`team-shop` owns this product and everything under it. Reuse of
[ledger](srn://acme/product/billing/component/ledger) is by reference — it stays
owned by `team-billing`.
```

Two reference styles appear above and the split is deliberate. The product's own
buckets are addressed **relative** (`protocol/order-events`,
`requirement/pci-scope`): the ref is appended to this entity's path, so it stays
correct wherever the product sits and says "mine" at a glance. Anything outside
the product is addressed **solution-absolute**. The relative equivalent of the
`depends-on` entry is `../billing/component/ledger` — one `..` pops `shop` and
lands back in the `product/` bucket, from which `billing` is a sibling — and
that is exactly the misreading to avoid: it looks like it climbs out of the
product when it only steps sideways. `/product/billing/component/ledger` says
where it lands and needs no counting ([srn.md](../srn.md)).

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
