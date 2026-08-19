---
kind: spec
name: structure
version: 1
status: review
title: Directory structure
summary: The full directory layout contract — monorepo layout, entity-directory convention, kind placement, and naming rules.
---

# Directory structure

This document is the layout contract for the repository. The portal loader,
every author, and every AI agent MUST be able to rely on it exactly as written.

## Monorepo layout

The repository root has exactly these top-level areas:

| Path                | Contents                                                            |
| ------------------- | ------------------------------------------------------------------- |
| `framework/spec/`   | This specification, written in the framework's own format.          |
| `framework/portal/` | The Next.js portal (read-only presentation over `solutions/`).      |
| `solutions/`        | All described solutions. The only place solution entities may live. |
| `docs/`             | Repository meta-documents (decision record, contributor notes).     |

The portal reads `solutions/` and `.git/` only. Nothing under `framework/` or
`docs/` is part of any solution catalog.

## Solution nesting

Under `solutions/`, containers nest in a fixed order:

```text
solutions/{solution}/{product}/{component}/{sub-component}/...
```

- A **solution** is the top-level unit and a sealed universe: no reference of
  any kind may cross from one solution into another (see
  [srn.md](srn.md), rule V4).
- A **product** is a direct child of a solution.
- A **component** is a child of a product, and components nest arbitrarily deep
  (a sub-component is just a component whose parent is a component).
- Components are product-owned. Reuse of a component elsewhere in the same
  solution is by SRN reference, never by copying or symlinking the directory.

Example — `payment` is a sub-component of `checkout`, which belongs to the
`shop` product of the `acme` solution:

```text
solutions/acme/shop/checkout/payment/
```

## Entity directories

**Rule:** a directory under `solutions/` is an entity **iff** it contains an
`index.md`. There are no other markers.

Every entity — containers (solution, product, component) and owned kinds
(datamodel, protocol, actor, environment, adr, requirement) alike — is a
directory holding:

- `index.md` — REQUIRED. YAML frontmatter (see
  [frontmatter.md](frontmatter.md)) plus free prose.
- Sibling artifacts — OPTIONAL. YAML/JSON/markdown files carrying the
  machine-readable substance of the entity (e.g. `schema.json` for a datamodel,
  `transport.yaml` for a protocol). Which siblings a kind defines is specified
  in that kind's `kinds/*.md` document.
- Asset subdirectories — OPTIONAL. An entity directory MAY contain
  subdirectories to organize its artifacts (e.g. `workflows/`). An asset
  subdirectory MUST NOT contain an `index.md` at any depth below the entity —
  otherwise it would itself parse as an entity. Only container entities
  (solution, product, component) may contain child entity directories.

```text
solutions/acme/shop/protocol/order-events/
├── index.md              # the entity document (frontmatter + prose)
├── transport.yaml        # sibling artifact
└── workflows/            # asset subdirectory — no index.md inside
    └── place-order.yaml
```

Violations: an `index.md`-bearing directory nested inside a datamodel entity is
`E_STRUCT_NESTED_ENTITY`; a directory sitting inside a kind bucket without an
`index.md` is `E_STRUCT_MISSING_INDEX`.

## Kind buckets

Owned entities live inside **kind buckets** — directories named exactly after
the reserved kind keyword, holding one entity directory per entity:

```text
solutions/acme/shop/datamodel/            # kind bucket — NOT an entity
solutions/acme/shop/datamodel/order/      # entity  srn://acme/shop/datamodel/order
```

- A kind bucket MUST NOT contain an `index.md` (it is not an entity and has no
  SRN — `srn://acme/shop/datamodel` is unresolvable by grammar, see srn.md).
- A kind bucket MAY be absent when the owner has no entities of that kind.
  Empty kind buckets SHOULD NOT be committed (git does not track empty
  directories anyway).

## Where each kind may live

| Kind          | Allowed owner                                         | Example path                                        |
| ------------- | ----------------------------------------------------- | --------------------------------------------------- |
| `actor`       | solution only                                         | `solutions/acme/actor/customer/`                    |
| `environment` | solution only                                         | `solutions/acme/environment/production/`            |
| `datamodel`   | solution, product, or component (its owner)           | `solutions/acme/shop/checkout/datamodel/cart/`      |
| `adr`         | solution, product, or component (its owner)           | `solutions/acme/shop/adr/0001-event-sourcing/`      |
| `requirement` | solution, product, or component (its owner)           | `solutions/acme/shop/checkout/requirement/idem-cap/`|
| `protocol`    | the nearest common ancestor of its participants       | `solutions/acme/shop/protocol/order-events/`        |

Rules:

- An `actor/` or `environment/` bucket below solution level is
  `E_STRUCT_KIND_PLACEMENT`. Actors and environments describe the solution's
  universe; products and components reference them, never own them.

  ```text
  solutions/acme/shop/actor/customer/index.md   # ILLEGAL — E_STRUCT_KIND_PLACEMENT
  solutions/acme/actor/customer/index.md        # legal
  ```

- Datamodels, ADRs, and requirements are **owner-scoped**: they live in the
  bucket of the container that owns them. Owner scope is a statement of
  responsibility, not visibility — any entity in the solution may reference
  them.
- A protocol MUST live at the **nearest common ancestor (NCA)** of its
  *component* participants (the containers that expose or use it). Actors MAY
  participate in a protocol but do not affect placement — actors are
  solution-level, so counting them would degenerate every placement to the
  solution root.

  ```text
  # participants: acme/shop/checkout and acme/shop/inventory → NCA = acme/shop
  solutions/acme/shop/protocol/order-events/           # correct

  # participants: acme/shop/checkout and acme/billing/ledger → NCA = acme
  solutions/acme/protocol/settlement/                  # correct
  ```

  A protocol placed below the NCA of its declared participants is flagged
  `W_STRUCT_PROTOCOL_NCA` (a warning, not an error: participant lists live in
  protocol artifacts and may legitimately lead placement during a swap).

## Naming rules

- Every path segment under `solutions/` — solution, product, component, and
  entity names — MUST match:

  ```text
  ^[a-z0-9]+(-[a-z0-9]+)*$        # kebab-case, 1–64 characters
  ```

  Legal: `shop`, `order-events`, `0001-event-sourcing`.
  Illegal: `Shop` (uppercase), `order_events` (underscore), `-cart` (leading
  hyphen), `café` (non-ASCII). Violations are `E_SRN_SYNTAX` — naming and SRN
  share one grammar, because the path *is* the SRN.

- The reserved kind keywords — `datamodel`, `protocol`, `actor`, `environment`,
  `adr`, `requirement` — MUST NOT be used as solution, product, component, or
  entity names. They may appear only as kind buckets. Violation:
  `E_SRN_RESERVED`.

  ```text
  solutions/acme/protocol/            # legal — kind bucket at solution level
  solutions/acme/actor-portal/        # legal — "actor-portal" is not a keyword
  solutions/acme/shop/protocol/index.md   # ILLEGAL — a product/component named
                                          # "protocol" (bucket with index.md)
  ```

- `index.md` is a reserved filename: it may appear only as an entity document.
  Sibling artifact filenames MUST be kebab-case with a standard extension
  (`.md`, `.yaml`, `.json`); e.g. `schema.json`, `transport.yaml`,
  `state-machine.json`.

- The frontmatter `name` field MUST equal the entity's directory name
  (`E_FM_NAME_MISMATCH`, see [frontmatter.md](frontmatter.md)).

## Annotated example tree

A minimal but complete solution demonstrating every placement rule:

```text
solutions/
└── acme/                             # solution        srn://acme
    ├── index.md                      # solution entity document
    ├── actor/                        # kind bucket (never an entity, no index.md)
    │   └── customer/                 # srn://acme/actor/customer
    │       └── index.md
    ├── environment/
    │   └── production/               # srn://acme/environment/production
    │       ├── index.md
    │       └── topology.yaml         # sibling artifact
    ├── datamodel/                    # solution-owned datamodels
    │   └── money/                    # srn://acme/datamodel/money
    │       ├── index.md
    │       └── schema.json
    ├── protocol/                     # NCA of participants = solution
    │   └── settlement/               # srn://acme/protocol/settlement
    │       └── index.md
    └── shop/                         # product         srn://acme/shop
        ├── index.md
        ├── adr/
        │   └── 0001-event-sourcing/  # srn://acme/shop/adr/0001-event-sourcing
        │       └── index.md
        ├── protocol/                 # NCA of participants = shop
        │   └── order-events/         # srn://acme/shop/protocol/order-events
        │       ├── index.md
        │       ├── transport.yaml
        │       └── workflows/        # asset subdirectory, no index.md
        │           └── place-order.yaml
        └── checkout/                 # component       srn://acme/shop/checkout
            ├── index.md
            ├── requirement/
            │   └── idem-cap/         # srn://acme/shop/checkout/requirement/idem-cap
            │       └── index.md
            └── payment/              # sub-component   srn://acme/shop/checkout/payment
                ├── index.md
                └── datamodel/
                    └── order/        # srn://acme/shop/checkout/payment/datamodel/order
                        ├── index.md
                        └── schema.json
```

## Structure error classes

| Code                       | Meaning                                                           |
| -------------------------- | ----------------------------------------------------------------- |
| `E_STRUCT_MISSING_INDEX`   | Directory inside a kind bucket has no `index.md`.                 |
| `E_STRUCT_NESTED_ENTITY`   | `index.md` found below a non-container entity.                    |
| `E_STRUCT_KIND_PLACEMENT`  | `actor`/`environment` bucket below solution level.                |
| `W_STRUCT_PROTOCOL_NCA`    | Protocol not at the NCA of its declared component participants.   |

SRN-level naming violations (`E_SRN_SYNTAX`, `E_SRN_RESERVED`) are defined in
[srn.md](srn.md); frontmatter violations in
[frontmatter.md](frontmatter.md). All are enforced at portal build/load — there
is no CLI in v1.
