# Directory structure — layout, artifacts, placement

> Distilled from `framework/spec/structure.md`, the container rules in
> `framework/spec/kinds/solution.md`, and the "Entity directory shape" /
> "Sibling artifacts" / "Body template" sections of the other
> `framework/spec/kinds/*.md`. **When `framework/spec/` is present in the
> repository, it is authoritative and wins over this file.** This bundled copy
> exists because an installed plugin cannot see the repo spec.

Because SRN ≡ path (`srn.md`), most rules here are the same rules stated as
directories. Where the two disagree, `srn.md` is normative.

## Repository layout

| Path                | Contents                                                            |
|---------------------|---------------------------------------------------------------------|
| `framework/spec/`   | The specification, written in the framework's own format.           |
| `framework/portal/` | The Next.js portal — read-only presentation over `solutions/`.      |
| `solutions/`        | All described solutions. The only place solution entities may live. |
| `docs/`             | Repository meta-documents (decision record, contributor notes).     |

The portal reads `solutions/` and `.git/` only.

## Buckets and entity directories alternate

```text
solutions/{solution}( /{kind}/{name} )*
```

- A **kind bucket** is a directory named exactly after one of the eight reserved
  kinds. It is not an entity, has no `index.md`, and has no SRN.
- An **entity directory** is a directory inside a bucket. It holds `index.md`
  and — if its kind is a container — further kind buckets.

```bash
$ ls -d solutions/acme/*/                # a solution holds buckets only
actor  adr  datamodel  environment  product  protocol  requirement

$ ls -d solutions/acme/product/*/         # a bucket holds entities only
billing  shop

$ ls -d solutions/acme/product/shop/*/    # a product holds buckets only
adr  component  datamodel  protocol  requirement
```

A bucket MUST NOT hold an `index.md` or loose files. A bucket MAY be absent when
the owner has no entities of that kind; empty buckets should not be committed.

## The entity rule

**A directory under `solutions/` is an entity if and only if it contains an
`index.md`.** There are no other markers. An entity directory holds:

- `index.md` — REQUIRED. Frontmatter plus prose.
- **Sibling artifacts** — kebab-case, **bare** filenames named by role, never
  prefixed with the entity name. `schema.json`, not `order.schema.json`.
- **Asset subdirectories** — named for their role (`workflows/`, `examples/`),
  therefore never one of the eight kinds, and containing **no `index.md` at any
  depth** (`E_STRUCT_NESTED_ENTITY`).

## Where each kind may live

Every row is a grammar rule; a violation is `E_SRN_PLACEMENT` raised while the
path is parsed, not a later loader check.

| Kind          | Bucket may sit in                               | Example path                                                           |
|---------------|-------------------------------------------------|------------------------------------------------------------------------|
| `product`     | the solution, and nowhere else                  | `solutions/acme/product/shop/`                                         |
| `component`   | a product or a component                        | `solutions/acme/product/shop/component/checkout/component/payment/`    |
| `actor`       | the solution, and nowhere else                  | `solutions/acme/actor/customer/`                                       |
| `environment` | the solution, and nowhere else                  | `solutions/acme/environment/production/`                               |
| `datamodel`   | the solution, a product, or a component         | `solutions/acme/product/shop/component/checkout/datamodel/cart/`       |
| `adr`         | the solution, a product, or a component         | `solutions/acme/product/shop/adr/0001-event-sourcing/`                 |
| `requirement` | the solution, a product, or a component         | `solutions/acme/product/shop/component/checkout/requirement/idem-cap/` |
| `protocol`    | the nearest common ancestor of its participants | `solutions/acme/product/shop/protocol/order-placement/`                |

Datamodels, ADRs and requirements are **owner-scoped**: they live in the bucket
of the container *responsible* for them. Scope is responsibility, not
visibility — any entity in the solution may reference any of them.

### The protocol NCA rule

A protocol lives at the nearest common ancestor of its **component and product**
participants, computed over whole `{kind}/{name}` **pairs**, never raw segments.
Actors are excluded — they are solution-level, so counting them would collapse
every protocol to the root. Four fixture protocols, one per placement outcome
(the catalog ships more):

```text
checkout + inventory + payment                       → product/shop
  solutions/acme/product/shop/protocol/order-placement/

checkout + checkout/tax-engine                       → product/shop + component/checkout
  solutions/acme/product/shop/component/checkout/protocol/tax-quoting/

payment + billing/ledger + billing/reconciliation    → none (products diverge)
  solutions/acme/protocol/settlement/

support-agent (actor, excluded) + billing/ledger     → that one component
  solutions/acme/product/billing/component/ledger/protocol/refund-request/
```

A protocol below the NCA of its declared participants is `W_STRUCT_PROTOCOL_NCA`
(a warning — the participants list may legitimately lead the directory by a
commit or two during a swap).

## Artifacts each kind defines

| Kind          | Required siblings | Optional siblings                                                                                             | Asset dirs   | Enforced body sections   |
|---------------|-------------------|---------------------------------------------------------------------------------------------------------------|--------------|--------------------------|
| `solution`    | —                 | any (attachments; portal previews, attaches no semantics)                                                     | —            | —                        |
| `product`     | —                 | any (attachments)                                                                                             | —            | —                        |
| `component`   | —                 | any (attachments)                                                                                             | —            | —                        |
| `datamodel`   | `schema.json`     | —                                                                                                             | `examples/`  | —                        |
| `protocol`    | —                 | `transport.yaml`, `states.json`, external spec linked from `transport.yaml` `spec.file` (e.g. `openapi.yaml`) | `workflows/` | —                        |
| `actor`       | —                 | —                                                                                                             | —            | —                        |
| `environment` | —                 | `topology.yaml`, `config.yaml`                                                                                | —            | —                        |
| `adr`         | —                 | supporting material (linked, not interpreted)                                                                 | —            | four, see below          |
| `requirement` | —                 | supporting material (linked, not interpreted)                                                                 | —            | `## Acceptance criteria` |

Rules that catch authors out:

- A datamodel without `schema.json` is `E_DM_SCHEMA_MISSING`. Every file in
  `examples/` MUST validate against that schema (`E_DM_EXAMPLE_INVALID`).
- Protocol sibling names are **fixed and bare**: `transport.yaml`, `states.json`.
  Anything else unrecognised is `W_PROTO_ARTIFACT_UNKNOWN`. `workflows/` is the
  only recognised asset subdirectory: one `*.yaml` per workflow, kebab-case,
  no nesting.
- All protocol artifacts are optional. A protocol with only `index.md` is legal
  (intent-level, under design); it simply derives no diagrams.
- **Artifacts carry no version of their own.** A top-level `version:` key in
  `transport.yaml`, `topology.yaml`, `config.yaml`, or a workflow file is a
  shape violation. The entity's frontmatter `version` covers the whole
  directory.
- The `x-` escape hatch reaches into `transport.yaml`, `workflows/*.yaml`,
  `topology.yaml` and `config.yaml`: unknown keys at any level are rejected
  unless `x-` prefixed. `states.json` is exempt — it is an XState machine
  configuration and unknown keys there are `E_PROTO_STATES_SUBSET`.
- An ADR body MUST carry exactly these four level-2 headings, exact text and
  casing (`E_ADR_SECTIONS`); order is not enforced and extra sections are fine:

  ```markdown
  ## Context
  ## Decision
  ## Consequences
  ## Alternatives considered
  ```

- A requirement body MUST carry `## Acceptance criteria` exactly once, at level
  2, with this casing (`E_REQ_CRITERIA`). `## Rationale` and `## Out of scope`
  are conventional, not enforced.

## Naming

- Every path segment under `solutions/` — solution names, buckets, entity names
  alike — MUST match `^[a-z0-9]+(-[a-z0-9]+)*$`, 1–64 chars. `Shop`,
  `order_placement`, `-cart`, `café` are all `E_SRN_SYNTAX`.
- The eight reserved kinds MUST NOT be used as a solution or entity name
  (`E_SRN_RESERVED`). They appear only as bucket directories, at odd positions.
- `index.md` is reserved for the entity document.
- Sibling filenames are bare, kebab-case, with a standard extension. A file the
  framework only *links* rather than parses (`openapi.yaml`, `pricing.proto`)
  follows the external tool's convention instead.
- Frontmatter `name` MUST equal the directory name; frontmatter `kind` MUST
  equal the bucket.

## Container rules (solution, product, component alike)

- **C1 Containment is derived, never authored.** No `children`, `contains`, or
  `parent` field exists — the filesystem is the containment graph.
- **C2 Only containers may hold child entities.** The six leaf kinds hold
  artifacts and asset dirs, never entities.
- **C3 A child's version is not the container's version.** Adding, bumping, or
  deprecating a child does not bump the container.
- **C4 Containers define no mandatory siblings.** Their substance is children
  plus prose.
- **C5 Single ownership, single path.** Reuse elsewhere in the solution is by
  SRN reference only — never a copy, never a symlink.
- **C6 Kind fields extend, never replace** the common frontmatter contract.
- **C7 `status` is the document's, not a rollup.** A container may be `approved`
  while its children are `draft`; the portal derives the rollup.

## Annotated tree (abridged from the real fixture)

```text
solutions/
└── acme/                                   # solution                 srn://acme
    ├── actor/                              # kind bucket — never an entity
    │   └── customer/                       # srn://acme/actor/customer
    │       └── index.md
    ├── adr/
    │   └── 0001-single-currency/
    │       └── index.md
    ├── datamodel/
    │   └── money/                          # srn://acme/datamodel/money
    │       ├── examples/                   # asset dir — no index.md at any depth
    │       │   └── forty-nine-ninety.json
    │       ├── index.md
    │       └── schema.json
    ├── environment/
    │   └── production/
    │       ├── config.yaml
    │       ├── index.md
    │       └── topology.yaml
    ├── product/
    │   └── shop/                           # srn://acme/product/shop
    │       ├── adr/
    │       │   └── 0001-event-sourcing/
    │       │       └── index.md
    │       ├── component/
    │       │   ├── checkout/               # srn://…/component/checkout
    │       │   │   ├── component/
    │       │   │   │   └── payment/        # sub-component — a component pair again
    │       │   │   │       ├── datamodel/
    │       │   │   │       │   └── order/
    │       │   │   │       │       ├── examples/
    │       │   │   │       │       ├── index.md
    │       │   │   │       │       └── schema.json
    │       │   │   │       └── index.md
    │       │   │   ├── datamodel/
    │       │   │   │   └── cart/
    │       │   │   ├── protocol/
    │       │   │   │   └── tax-quoting/
    │       │   │   ├── requirement/
    │       │   │   │   └── idem-cap/
    │       │   │   └── index.md
    │       │   └── inventory/
    │       │       └── index.md
    │       ├── datamodel/
    │       │   └── order-line/
    │       ├── protocol/                   # NCA of the participants = the shop product
    │       │   └── order-placement/
    │       │       ├── workflows/          # asset dir — no index.md
    │       │       │   ├── cancel-order.yaml
    │       │       │   └── place-order.yaml
    │       │       ├── index.md
    │       │       ├── states.json
    │       │       └── transport.yaml
    │       ├── requirement/
    │       └── index.md
    ├── protocol/                           # NCA of the participants = the solution
    │   └── settlement/
    ├── requirement/
    │   └── gdpr-erasure/
    └── index.md                            # the solution's entity document
```

## Structure error classes

| Code                     | Meaning                                                                                    |
|--------------------------|--------------------------------------------------------------------------------------------|
| `E_STRUCT_MISSING_INDEX` | A directory that owns an entity has no `index.md`, so the owner's SRN resolves to nothing. |
| `E_STRUCT_NESTED_ENTITY` | An `index.md` sits directly below an entity that is not a container.                       |
| `E_STRUCT_DUPLICATE_SRN` | Two directories resolve to the same SRN (symlink, case-insensitive filesystem).            |
| `W_STRUCT_PROTOCOL_NCA`  | Protocol not at the NCA of its component/product participants.                             |

`E_STRUCT_KIND_PLACEMENT` is **retired** — every placement violation is now
`E_SRN_PLACEMENT` (`srn.md`, P1–P4). A directory without `index.md` and without
entities below it is a silent no-op, not a diagnostic: it is indistinguishable
from an asset directory.
