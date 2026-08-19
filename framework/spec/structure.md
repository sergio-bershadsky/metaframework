---
kind: spec
name: structure
version: 2
status: review
title: Directory structure
summary: The full directory layout contract — monorepo layout, kind buckets at every level, the entity-directory convention, placement, and naming rules.
---

# Directory structure

This document is the layout contract for the repository. The portal loader,
every author, and every AI agent MUST be able to rely on it exactly as written.

Because SRN ≡ path ([srn.md](srn.md)), almost every rule here is the same rule
stated as directories. Where the two documents overlap, srn.md is normative and
this one is the projection onto the filesystem.

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

## Kind buckets at every level

Below a solution directory, the tree strictly alternates **kind bucket** and
**entity directory**:

```text
solutions/{solution}( /{kind}/{name} )*
```

- A **kind bucket** is a directory named exactly after one of the eight reserved
  kinds. It is not an entity, has no `index.md`, and has no SRN.
- An **entity directory** is a directory inside a bucket. It holds `index.md`,
  and — if its kind is a container — further kind buckets.

The consequence is that a directory listing anywhere in the catalog answers
"what is in here?" without knowing any vocabulary beyond the eight kinds:

```bash
$ ls -d solutions/acme/*/                       # a solution holds buckets only
actor  adr  datamodel  environment  product  protocol  requirement

$ ls -d solutions/acme/product/*/               # a bucket holds entities only
billing  shop

$ ls -d solutions/acme/product/shop/*/          # a product holds buckets only
adr  component  datamodel  protocol  requirement
```

Nesting rules, all of them enforced by the SRN grammar (`E_SRN_PLACEMENT`, see
[srn.md](srn.md#placement-is-grammar)) rather than by a filesystem pass:

- A **solution** is the top-level unit and a sealed universe: no reference of
  any kind may cross from one solution into another ([srn.md](srn.md), rule V5).
- A **product** lives in the solution's `product/` bucket and nowhere else.
- A **component** lives in a `component/` bucket inside a product or inside
  another component; components nest arbitrarily deep. A sub-component is not a
  distinct thing — it is a component whose owner happens to be a component.
- Components are product-owned. Reuse of a component elsewhere in the same
  solution is by SRN reference, never by copying or symlinking the directory.
- Only products and components own buckets. Every other kind is a leaf: a
  datamodel, protocol, actor, environment, adr, or requirement directory
  contains artifacts, never further entities.

Example — `payment` is a sub-component of `checkout`, which belongs to the
`shop` product of the `acme` solution:

```text
solutions/acme/product/shop/component/checkout/component/payment/
→ srn://acme/product/shop/component/checkout/component/payment
```

Each `component/` in that path is a bucket directory, not a name. The word
repeats because the kind repeats, which is exactly the point: the kind of every
entity on the path is written down, never inferred from how deep it sits.

## Entity directories

**Rule:** a directory under `solutions/` is an entity **iff** it contains an
`index.md`. There are no other markers.

Every entity — containers (solution, product, component) and leaf kinds
(datamodel, protocol, actor, environment, adr, requirement) alike — is a
directory holding:

- `index.md` — REQUIRED. YAML frontmatter (see
  [frontmatter.md](frontmatter.md)) plus free prose.
- Sibling artifacts — OPTIONAL. YAML/JSON/markdown files carrying the
  machine-readable substance of the entity (e.g. `schema.json` for a datamodel,
  `transport.yaml` for a protocol). Which siblings a kind defines is specified
  in that kind's `kinds/*.md` document.
- Asset subdirectories — OPTIONAL. An entity directory MAY contain
  subdirectories to organize its artifacts (e.g. `workflows/`, `examples/`). An
  asset subdirectory is named for its role and is therefore never one of the
  eight kinds; it MUST NOT contain an `index.md` at any depth, otherwise it
  would itself parse as an entity.

```text
solutions/acme/product/shop/protocol/order-placement/
├── index.md              # the entity document (frontmatter + prose)
├── states.json           # sibling artifact
├── transport.yaml        # sibling artifact
└── workflows/            # asset subdirectory — no index.md inside
    ├── cancel-order.yaml
    └── place-order.yaml
```

Kind buckets are the mirror image: they hold entity directories and nothing
else.

- A kind bucket MUST NOT contain an `index.md`. It has no SRN —
  `srn://acme/product/shop/datamodel` is not addressable by grammar
  ([srn.md](srn.md#parsing-algorithm)) — so an `index.md` there would be an
  entity whose own name is a reserved keyword (`E_SRN_RESERVED`).
- A kind bucket MUST NOT contain loose files or asset subdirectories: its
  children are entity directories, each with an `index.md`. The loader detects
  the violation only where it breaks something — an entity whose owner has no
  document is `E_STRUCT_MISSING_INDEX` ([below](#structure-error-classes)) —
  because a childless directory without `index.md` is indistinguishable from an
  asset directory.
- A kind bucket MAY be absent when the owner has no entities of that kind.
  Empty kind buckets SHOULD NOT be committed (git does not track empty
  directories anyway).

## Where each kind may live

Every row below is a grammar rule, not a convention. A path that violates it has
no SRN at all, so the loader reports `E_SRN_PLACEMENT` while reading the
directory rather than after building the graph. Example paths are real entities
in the fixture under `solutions/`.

| Kind          | Bucket may sit in                               | Example path                                                           |
| ------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| `product`     | the solution, and nowhere else                  | `solutions/acme/product/shop/`                                         |
| `component`   | a product or a component                        | `solutions/acme/product/shop/component/checkout/component/payment/`    |
| `actor`       | the solution, and nowhere else                  | `solutions/acme/actor/customer/`                                       |
| `environment` | the solution, and nowhere else                  | `solutions/acme/environment/production/`                               |
| `datamodel`   | the solution, a product, or a component         | `solutions/acme/product/shop/component/checkout/datamodel/cart/`       |
| `adr`         | the solution, a product, or a component         | `solutions/acme/product/shop/adr/0001-event-sourcing/`                 |
| `requirement` | the solution, a product, or a component         | `solutions/acme/product/shop/component/checkout/requirement/idem-cap/` |
| `protocol`    | the nearest common ancestor of its participants | `solutions/acme/product/shop/protocol/order-placement/`                |

Rules:

- An `actor/` or `environment/` bucket below solution level is
  `E_SRN_PLACEMENT`. Actors and environments describe the solution's universe;
  products and components reference them, never own them.

  ```text
  solutions/acme/product/shop/actor/customer/index.md   # ILLEGAL — E_SRN_PLACEMENT
  solutions/acme/actor/customer/index.md                # legal
  ```

- A `product/` bucket below solution level is `E_SRN_PLACEMENT`, and so is a
  `component/` bucket directly under the solution. Products are the solution's
  only structural children; components are always inside one.

  ```text
  solutions/acme/product/shop/product/billing/index.md  # ILLEGAL — E_SRN_PLACEMENT
  solutions/acme/component/checkout/index.md            # ILLEGAL — E_SRN_PLACEMENT
  ```

- A bucket inside a leaf entity is `E_SRN_PLACEMENT` — a datamodel, protocol,
  actor, environment, adr, or requirement owns nothing.

  ```text
  solutions/acme/datamodel/money/datamodel/currency/index.md   # ILLEGAL — E_SRN_PLACEMENT
  ```

- Datamodels, ADRs, and requirements are **owner-scoped**: they live in the
  bucket of the container that owns them. Owner scope is a statement of
  responsibility, not visibility — any entity in the solution may reference
  them.
- A protocol MUST live at the **nearest common ancestor (NCA)** of its
  *component and product* participants — the entries of the `participants` list
  in the protocol's own `index.md` frontmatter, which is the authoritative input
  to this rule ([kinds/protocol.md](kinds/protocol.md)). The NCA is computed
  over whole `{kind}/{name}` **pairs**, never over raw segments: the longest
  common prefix of the participants' pair chains. Actors MAY participate in a
  protocol but do not affect placement — actors are solution-level, so counting
  them would degenerate every placement to the solution root.

  All four fixture protocols, and the ancestor each one lands on:

  ```text
  # participants: /product/shop/component/checkout, /product/shop/component/inventory,
  #               /product/shop/component/checkout/component/payment
  # common pair prefix: product/shop
  solutions/acme/product/shop/protocol/order-placement/

  # participants: /product/shop/component/checkout,
  #               /product/shop/component/checkout/component/tax-engine
  # common pair prefix: product/shop + component/checkout
  solutions/acme/product/shop/component/checkout/protocol/tax-quoting/

  # participants: /product/shop/component/checkout/component/payment,
  #               /product/billing/component/ledger, /product/billing/component/reconciliation
  # common pair prefix: none — the two products diverge at the first pair
  solutions/acme/protocol/settlement/

  # participants: /actor/support-agent (an actor: excluded), /product/billing/component/ledger
  # one component participant, so the NCA is that component itself
  solutions/acme/product/billing/component/ledger/protocol/refund-request/
  ```

  A protocol placed below the NCA of its declared participants is flagged
  `W_STRUCT_PROTOCOL_NCA` (a warning, not an error: the `participants` list may
  legitimately lead the directory's placement by a commit or two during a swap).

## Naming rules

- Every path segment under `solutions/` — solution names, kind buckets, and
  entity names alike — MUST match:

  ```text
  ^[a-z0-9]+(-[a-z0-9]+)*$        # kebab-case, 1–64 characters
  ```

  Legal: `shop`, `order-placement`, `0001-event-sourcing`.
  Illegal: `Shop` (uppercase), `order_placement` (underscore), `-cart` (leading
  hyphen), `café` (non-ASCII). Violations are `E_SRN_SYNTAX` — naming and SRN
  share one grammar, because the path *is* the SRN.

- The eight reserved kind keywords —

  ```text
  product  component  datamodel  protocol  actor  environment  adr  requirement
  ```

  — MUST NOT be used as a solution or entity name. They may appear only as
  bucket directories, at the odd positions of the path. Violation:
  `E_SRN_RESERVED`.

  ```text
  solutions/acme/protocol/                     # legal — kind bucket at solution level
  solutions/acme/product/actor-portal/         # legal — a name, one level down, not a keyword
  solutions/acme/product/component/index.md    # ILLEGAL — E_SRN_RESERVED: a product named
                                               #   "component"
  solutions/acme/actor-portal/index.md         # ILLEGAL — E_SRN_SYNTAX: a solution's child is
                                               #   a bucket, and this is not one of the eight
  ```

  Note the last line: bucketing tightened this rule. Previously a solution's
  children were a mix of buckets and product names, so `actor-portal` was a fine
  product name at that level. Now every child of a solution directory is a
  bucket, so the name moves down one level into `product/` — where it is still
  legal, because it is still not a reserved word.

- `index.md` is a reserved filename: it may appear only as an entity document.
  Sibling artifact filenames MUST be kebab-case, **bare** — never prefixed with
  the entity name — and carry a standard extension (`.md`, `.yaml`, `.json`);
  e.g. `schema.json`, `transport.yaml`, `states.json`, `topology.yaml`.

  ```text
  datamodel/order-line/schema.json                # correct — named by role
  datamodel/order-line/order-line.schema.json     # ILLEGAL — prefixed with the entity name
  protocol/order-placement/transport.yaml         # correct
  ```

  A kind document MAY additionally recognise a foreign extension for a file it
  merely *links* rather than interprets — `openapi.yaml`, `pricing.proto`,
  `schema.graphql` under a protocol's `spec.file`
  ([kinds/protocol.md](kinds/protocol.md)). Such a file is named by the external
  tool's convention; everything the framework itself parses obeys the rule
  above.

- The frontmatter `name` field MUST equal the entity's directory name
  (`E_FM_NAME_MISMATCH`, see [frontmatter.md](frontmatter.md)), and the
  frontmatter `kind` field MUST equal the bucket the directory sits in
  (`E_FM_KIND_LOCATION`). Neither is inferred from depth any more; both are read
  straight off the path.

## Annotated example tree

Abridged from the real fixture under `solutions/` — every path below exists on
disk. Directories are listed before files:

```text
solutions/
└── acme/                                   # solution                 srn://acme
    ├── actor/                              # kind bucket — never an entity, never an index.md
    │   └── customer/                       # srn://acme/actor/customer
    │       └── index.md
    ├── adr/
    │   └── 0001-single-currency/           # srn://acme/adr/0001-single-currency
    │       └── index.md
    ├── datamodel/
    │   └── money/                          # srn://acme/datamodel/money
    │       ├── examples/                   # asset dir — no index.md at any depth
    │       │   └── forty-nine-ninety.json
    │       ├── index.md
    │       └── schema.json
    ├── environment/
    │   └── production/                     # srn://acme/environment/production
    │       ├── index.md
    │       └── topology.yaml               # sibling artifact
    ├── product/                            # the product bucket — products live nowhere else
    │   ├── billing/                        # srn://acme/product/billing
    │   │   ├── component/
    │   │   │   └── ledger/                 # srn://acme/product/billing/component/ledger
    │   │   │       └── index.md
    │   │   └── index.md
    │   └── shop/                           # product                  srn://acme/product/shop
    │       ├── adr/
    │       │   └── 0001-event-sourcing/    # srn://acme/product/shop/adr/0001-event-sourcing
    │       │       └── index.md
    │       ├── component/                  # the component bucket, repeated at every level
    │       │   ├── checkout/               # component                srn://…/component/checkout
    │       │   │   ├── component/
    │       │   │   │   └── payment/        # sub-component — a component pair again
    │       │   │   │       ├── datamodel/
    │       │   │   │       │   └── order/  # srn://…/payment/datamodel/order
    │       │   │   │       │       ├── index.md
    │       │   │   │       │       └── schema.json
    │       │   │   │       └── index.md
    │       │   │   ├── datamodel/
    │       │   │   │   └── cart/           # srn://…/component/checkout/datamodel/cart
    │       │   │   │       └── index.md
    │       │   │   ├── requirement/
    │       │   │   │   └── idem-cap/       # srn://…/checkout/requirement/idem-cap
    │       │   │   │       └── index.md
    │       │   │   └── index.md
    │       │   └── inventory/              # srn://acme/product/shop/component/inventory
    │       │       └── index.md
    │       ├── datamodel/
    │       │   └── order-line/             # srn://acme/product/shop/datamodel/order-line
    │       │       ├── index.md
    │       │       └── schema.json
    │       ├── protocol/                   # NCA of the participants = the shop product
    │       │   └── order-placement/        # srn://acme/product/shop/protocol/order-placement
    │       │       ├── workflows/          # asset dir — no index.md
    │       │       │   └── place-order.yaml
    │       │       └── index.md
    │       └── index.md
    ├── protocol/                           # NCA of the participants = the solution
    │   └── settlement/                     # srn://acme/protocol/settlement
    │       ├── workflows/
    │       │   └── settle-order.yaml
    │       ├── index.md
    │       └── transport.yaml
    ├── requirement/
    │   └── gdpr-erasure/                   # srn://acme/requirement/gdpr-erasure
    │       └── index.md
    └── index.md                            # the solution's entity document
```

The four elided SRNs in full:

```text
srn://acme/product/shop/component/checkout
srn://acme/product/shop/component/checkout/component/payment/datamodel/order
srn://acme/product/shop/component/checkout/datamodel/cart
srn://acme/product/shop/component/checkout/requirement/idem-cap
```

## Structure error classes

Placement is grammar now, so the structural checks are only what the grammar
cannot see: a document that should exist and does not, an entity where no entity
may be, and two directories claiming one SRN.

| Code                     | Meaning                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `E_STRUCT_MISSING_INDEX` | A directory that owns an entity has no `index.md`, so the owner's SRN resolves to nothing. |
| `E_STRUCT_NESTED_ENTITY` | An `index.md` sits directly below an entity that is not a container.                       |
| `E_STRUCT_DUPLICATE_SRN` | Two directories resolve to the same SRN.                                                   |
| `W_STRUCT_PROTOCOL_NCA`  | Protocol not at the NCA of its component/product participants.                             |

Notes on each, because the grammar overlaps them:

- `E_STRUCT_MISSING_INDEX` is what a missing entity document looks like **from
  below**. The loader walks the tree, parses each entity directory as an SRN,
  and then links each entity to its owner; when the owner directory has no
  `index.md` there is no owner entity to link to, and the diagnostic is reported
  against the orphan. A directory without `index.md` is otherwise
  indistinguishable from an asset directory, so nothing is reported until
  something below it needs a parent — meaning an entity-less leaf directory
  inside a bucket is a silent no-op, not a diagnostic.

  ```text
  solutions/acme/product/shop/component/checkout/               # index.md deleted here …
  solutions/acme/product/shop/component/checkout/component/payment/index.md
  # E_STRUCT_MISSING_INDEX, reported against payment:
  #   "parent entity srn://acme/product/shop/component/checkout has no index.md"
  ```

- `E_STRUCT_NESTED_ENTITY` fires when a non-container entity has a child
  directory holding `index.md`. The grammar rejects that path too — the asset
  directory's name is not a kind bucket, or the leaf kind may own nothing — but
  the structural diagnostic is kept because it names the **owner**, whereas the
  SRN error can only say the path is not an SRN.

  ```text
  solutions/acme/datamodel/money/examples/index.md
  # E_STRUCT_NESTED_ENTITY — an entity below a datamodel (owner: srn://acme/datamodel/money)
  # E_SRN_SYNTAX          — and "…/datamodel/money/examples" is not a legal SRN either
  ```

  Below the entity's immediate children only the grammar catches it. In
  `solutions/acme/product/shop/protocol/order-placement/workflows/rogue/index.md`
  the directory directly above `rogue` is an asset directory, not an entity, so
  no owner is available to blame and the sole diagnostic is `E_SRN_SYNTAX`
  (`"workflows" is not a kind bucket`).

- `E_STRUCT_DUPLICATE_SRN` cannot arise from two distinct paths on a
  case-sensitive filesystem, since SRN ≡ path. It exists for the cases that
  break that assumption — a symlinked directory, or a case-insensitive
  filesystem folding two names into one. The loader keeps the first entity and
  reports the second.

`E_STRUCT_KIND_PLACEMENT` is **retired**. Every placement violation it used to
cover is now `E_SRN_PLACEMENT`, raised by the parser, and is listed in
[srn.md](srn.md#placement-is-grammar) as rules P1–P4.

SRN-level naming violations (`E_SRN_SYNTAX`, `E_SRN_RESERVED`) are defined in
[srn.md](srn.md); frontmatter violations in
[frontmatter.md](frontmatter.md). All are enforced at portal build/load — there
is no CLI in v1.
