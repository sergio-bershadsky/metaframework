---
kind: spec
name: solution
version: 5
status: review
title: Kind — solution
summary: The solution kind — the sealed universe and catalog root, its frontmatter additions, the shared container rules C1–C7, and the no-cross-solution boundary.
---

# Kind — solution

A **solution** is the top-level container and the root of one catalog:
`solutions/{name}/`. It is a *sealed universe* — nothing inside it may reference
anything outside it, and nothing outside it may reference in.

This document also carries the **container rules C1–C7**, shared by all three
container kinds. [product.md](product.md) and [component.md](component.md)
reference them rather than repeating them.

## Role in the hierarchy

```text
solutions/{solution}/                     ← this kind
  └── product/{product}/                  ← product.md
        └── component/{component}/…       ← component.md (nestable)
```

- Exactly one solution per directory directly under `solutions/`. Its `index.md`
  is the catalog root document.
- Solutions never nest. Every child of a solution directory is a **kind
  bucket**, never an entity directory — a solution has no unbucketed children,
  so `ls solutions/acme/` lists nothing but bucket names.
- The only container bucket a solution may hold is `product/`. A `component/`
  bucket at solution level is `E_SRN_PLACEMENT`: a component must live inside a
  product ([srn.md](../srn.md)).

  ```text
  solutions/acme/product/shop/       # legal — the one container bucket here
  solutions/acme/component/shop/     # E_SRN_PLACEMENT — no product owns it
  ```

- **The solution-level kinds live only here.** `actor/`, `environment/`,
  `capability/` and `journey/` buckets below solution level are
  `E_SRN_PLACEMENT` — the grammar admits those four pairs only as the first pair
  after the authority. Products and components *reference* them; they never own
  them, because all four describe the universe the whole solution shares: who
  pushes on it, where it runs, what the business can do, and the paths taken
  across it.

  ```text
  solutions/acme/actor/customer/                    # legal
  solutions/acme/environment/production/            # legal
  solutions/acme/capability/order-fulfilment/       # legal
  solutions/acme/journey/place-an-order/            # legal
  solutions/acme/product/shop/actor/customer/       # E_SRN_PLACEMENT
  solutions/acme/product/shop/capability/pricing/   # E_SRN_PLACEMENT
  ```

- A solution MAY also own `datamodel/`, `protocol/`, `adr/`, `requirement/`, and
  `metric/` buckets — for entities whose owner is the solution itself (a
  protocol whose participants span two products, a solution-wide `money`
  datamodel, a conversion number no single product is accountable for).

### The only path-less SRN

A solution's SRN is the authority alone — no path segments:

```text
srn://acme                 # the solution entity
srn://acme@2               # version 2 of the solution document (pinning works)
srn://acme/product/shop    # every other SRN has at least one {kind}/{name} pair
```

Three consequences fall out of [srn.md](../srn.md):

1. The solution is the base of every **path-absolute** reference. From anywhere
   in the catalog, `/actor/customer` → `srn://acme/actor/customer`.
2. `..` can never climb out. From `srn://acme/product/shop` the path is two
   segments, so `../..` lands exactly on `srn://acme` — the solution itself —
   and `../../..` is `E_SRN_SYNTAX`: the framework rejects the climb instead of
   clamping it at the root.
3. A network-path reference (`//globex/product/shop`) changes the authority and
   is `E_SRN_CROSS_SOLUTION`.

## The solution boundary

**No reference of any kind may cross a solution boundary**, on any surface:

| Surface                  | Crossing example                                           | Verdict                |
|--------------------------|------------------------------------------------------------|------------------------|
| frontmatter `relations`  | `depends-on: [srn://globex/product/shop/component/ledger]` | `E_SRN_CROSS_SOLUTION` |
| JSON Schema `$ref`       | `{"$ref": ".../globex/datamodel/money"}`                   | `E_SRN_CROSS_SOLUTION` |
| protocol / workflow YAML | `payload: srn://globex/product/shop/datamodel/order@1`     | `E_SRN_CROSS_SOLUTION` |
| prose markdown link      | `[Ledger](srn://globex/product/billing/component/ledger)`  | `E_SRN_CROSS_SOLUTION` |
| kind-specific fields     | `primary-actors: [srn://globex/actor/customer]`            | `E_SRN_CROSS_SOLUTION` |

The `$ref` row is the only one that is not an SRN, and its shape matters. A
`schema.json` references other schemas by **canonical schema URL** and never by
SRN (decision-record amendments 2026-08-19-c and 2026-08-19-d), so an `srn://`
in a `$ref` is `E_DM_REF_TARGET` — a malformed reference, caught before any
boundary question is asked. The way a schema crosses the boundary is plain to
read rather than counted: the first path segment after the host is the solution,
so `https://schemas.metaframework.dev/globex/datamodel/money` written from an
`acme` schema is `E_SRN_CROSS_SOLUTION` on inspection, with no normalisation
involved. Any other malformed URL — a foreign host, a serving address, a path
that is not an entity address — is `E_DM_REF_TARGET`
([datamodel.md](datamodel.md)); `E_DM_REF_ESCAPE` is retired.

Rationale: the boundary is what makes a solution reviewable and movable as a
unit — no build may depend on a catalog that is not in the tree. Cross-solution
sharing is explicitly deferred (decision record, *Portal → Deferred*).

To model a real dependency on a system that lives outside the solution, declare
an `external` component inside the solution and point at that
([component.md](component.md)). The external system is described locally, at the
fidelity this solution needs.

## Container rules (C1–C7)

These bind **solution, product, and component** alike.

- **C1 — Containment is derived, never authored.** There is no `children`,
  `contains`, or `parent` field: the filesystem is the containment graph. A
  `children:` key in frontmatter is `E_FM_UNKNOWN_FIELD`.

  ```yaml
  # solutions/acme/product/shop/index.md
  children: [checkout, inventory]     # E_FM_UNKNOWN_FIELD — derived from disk
  ```

- **C2 — Only containers may hold child entities.** A container's children are
  **kind buckets and nothing else**; each bucket holds entity directories of
  that kind. The nine non-container kinds (datamodel, protocol, actor,
  environment, adr, requirement, capability, journey, metric) hold no entities
  at all: they may carry sibling artifacts and asset subdirectories, but an
  `index.md` anywhere below one is `E_STRUCT_NESTED_ENTITY`
  ([structure.md](../structure.md)). The grammar states the same rule from the
  other side — only a `product` or `component` pair may be followed by another
  pair, so `srn://acme/datamodel/money/datamodel/currency` is
  `E_SRN_PLACEMENT` ([srn.md](../srn.md)).

- **C3 — A child's version is not the container's version.** `version` covers a
  container's own `index.md` and its own sibling artifacts only. Adding,
  bumping, or deprecating a child entity does **not** bump the container.

  ```text
  add solutions/acme/product/shop/component/wishlist/index.md   → shop unchanged
  edit solutions/acme/product/shop/index.md prose               → shop 4 → 5
  ```

  (This is [evolution.md](../evolution.md)'s bump rule applied literally: a child
  is a separate entity with its own `version`, not the container's content. The
  container row of evolution.md's additive table describes what is legal across
  the container's *subtree*.)

- **C4 — Containers define no mandatory sibling artifacts.** Unlike a datamodel
  (`schema.json`) or an environment (`topology.yaml`), a container's substance
  is its children plus its prose. A container MAY carry siblings; the portal
  lists them as attachments and previews markdown/YAML/JSON, but attaches no
  semantics to them.

  ```text
  solutions/acme/product/shop/
  ├── index.md            # the entity document
  ├── roadmap.md          # legal attachment — portal previews it, nothing more
  └── component/          # kind bucket
      └── checkout/       # child entity
  ```

- **C5 — Single ownership, single path.** Every container sits at exactly one
  path, and that path is its identity. Reuse elsewhere in the solution is by SRN
  reference only — never a copy, never a symlink
  ([component.md](component.md)).

- **C6 — Kind fields extend, never replace.** Each kind's zod schema extends the
  common one from [frontmatter.md](../frontmatter.md). A violation of a
  kind-specific field's type, enum, or requiredness is `E_FM_SCHEMA`, exactly
  like a common field; kind documents introduce new error classes only for rules
  a schema cannot express.

  ```yaml
  lifecycle: Active        # E_FM_SCHEMA — not in the product lifecycle enum
  component-type: worker   # E_FM_SCHEMA — not in the component-type enum
  ```

- **C7 — `status` is the document's, not a rollup.** A container may be
  `approved` while children are `draft`. The portal renders a derived child
  status rollup; it is never authored.

## Frontmatter additions

On top of [frontmatter.md](../frontmatter.md). Nothing there is redefined.

| Field      | Type                                     | Required | Rule                                                                                    |
|------------|------------------------------------------|----------|-----------------------------------------------------------------------------------------|
| `vision`   | string, multi-line allowed, ≤ 1000 chars | yes      | The durable *why* of the solution. Distinct from `summary` (one catalog line).          |
| `scope`    | map `{ in: [string], out: [string] }`    | no       | Boundary statements, one line ≤ 200 chars each; `out` is the anti-scope. SHOULD be set. |
| `contacts` | list of `{ role, handle, channel? }`     | no       | `role` kebab-case and unique in the list; `handle` free-form. SHOULD hold ≥ 1 entry.    |

- `vision` vs `summary`: `summary` is the one-line label shown in catalog lists;
  `vision` is the paragraph a newcomer reads first on the solution page. Both are
  required; neither substitutes for the other.
- `contacts` vs `owner`: `owner` (common, optional) is the single responsible
  handle. `contacts` is the routing table — several roles, each with a handle.

  ```yaml
  owner: team-platform
  contacts:
    - role: architect
      handle: s.bershadsky
      channel: "#acme-arch"
    - role: architect            # E_FM_SCHEMA — duplicate role
      handle: someone-else
  ```

## What may nest inside

| Child                                                                | Allowed | Note                                                                              |
| -------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------- |
| `product/` bucket                                                    | yes     | Any number of products; the only container bucket here.                           |
| `actor/`, `environment/`, `capability/`, `journey/` buckets          | yes     | **Only** here (`E_SRN_PLACEMENT` elsewhere).                                      |
| `datamodel/`, `protocol/`, `adr/`, `requirement/`, `metric/` buckets | yes     | For solution-owned entities.                                                      |
| another solution                                                     | no      | Solutions never nest.                                                             |
| a `component/` bucket                                                | no      | A component needs a product ancestor — `E_SRN_PLACEMENT`.                         |
| an entity directory not inside a bucket                              | no      | Every child of a solution is a bucket; the path would not parse (`E_SRN_SYNTAX`). |

## Validation rules

| #  | Rule                                                                                                                       | Error class                                 |
|----|----------------------------------------------------------------------------------------------------------------------------|---------------------------------------------|
| S1 | Every directory directly under `solutions/` contains an `index.md`.                                                        | `E_SOL_NO_ROOT`                             |
| S2 | That `index.md` declares `kind: solution` and `name` = directory name.                                                     | `E_FM_KIND_LOCATION` / `E_FM_NAME_MISMATCH` |
| S3 | `vision` present; `scope`/`contacts` well-shaped if present.                                                               | `E_FM_SCHEMA`                               |
| S4 | No reference on any surface names a foreign solution.                                                                      | `E_SRN_CROSS_SOLUTION`                      |
| S5 | No `actor`/`environment`/`capability`/`journey`/`component` bucket below solution level, and no `product` bucket above it. | `E_SRN_PLACEMENT`                           |

```text
S1  solutions/legacy-import/product/shop/index.md   # "legacy-import" has no
                                                    # index.md → E_SOL_NO_ROOT
S4  relations: { uses: [srn://globex/datamodel/money@1] }   # from acme
S5  solutions/acme/product/shop/environment/staging/        # a product owning
                                                            # an environment
```

## Worked example

`solutions/acme/index.md`:

```yaml
---
name: acme
kind: solution
version: 3
title: Acme Retail Platform
summary: The retail platform describing acme's storefront, fulfilment, and billing systems.
status: approved
owner: team-platform
vision: |
  One described universe for everything acme sells online: a single catalog in
  which every product, component, protocol, and data model is addressable,
  reviewable in git, and rendered by the portal without a second source of
  truth. The catalog is the contract between the teams — the code repositories
  implement it, they do not define it.
scope:
  in:
    - Customer-facing commerce, fulfilment, and billing systems.
    - Internal tooling those systems depend on.
  out:
    - Corporate IT, HR, and finance back office.
    - Anything acme does not own or operate (modelled as external components).
contacts:
  - role: architect
    handle: s.bershadsky
    channel: "#acme-arch"
  - role: product-lead
    handle: j.okonkwo
  - role: on-call
    handle: team-platform
    channel: "#acme-oncall"
relations:
  uses:
    - /environment/production
tags:
  - retail
  - flagship
---

Acme sells physical goods online. This catalog describes the systems that take
an order from a customer's cart to a settled payment and a shipped parcel.

## Reading order

Start at the [shop](srn://acme/product/shop) product and its
[checkout](srn://acme/product/shop/component/checkout) component; the money model
shared across products is [money](srn://acme/datamodel/money@1).

## Boundary

Everything acme does not operate — the payment processor, the carrier APIs — is
described as an `external` component inside the product that depends on it. No
reference in this catalog leaves `srn://acme`.
```

## What the portal derives

- **Solution dashboard** — product cards with lifecycle badge
  ([product.md](product.md)), entity counts by kind and by `status`, and the
  `vision` / `scope` panel.
- **Actor and environment catalogs** — the two solution-level buckets, each with
  derived inverse edges (which products name an actor, which components run in
  an environment).
- **Cross-product graph** — `depends-on` edges between products and components,
  clustered by product; the fastest read of coupling in the solution.
- **Shared component list** — components whose derived `depended-on-by` spans
  more than one product ([component.md](component.md)).
- **Integrity report** — dangling refs (`E_SRN_DANGLING`), boundary violations
  (`E_SRN_CROSS_SOLUTION`), deprecated targets (`W_REF_DEPRECATED`), and every
  error class above, scoped to this solution.
- **Contacts panel** — `contacts` rendered as the routing table; `owner` as the
  page's responsible handle.

## Solution error classes

| Code                   | New here | Meaning                                                                                                                                                                          |
|------------------------|----------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `E_SOL_NO_ROOT`        | yes      | Directory directly under `solutions/` has no `index.md`.                                                                                                                         |
| `E_SRN_CROSS_SOLUTION` | no       | Defined by [srn.md](../srn.md); listed here because the solution boundary is this kind's central rule.                                                                           |
| `E_SRN_PLACEMENT`      | no       | Defined by [srn.md](../srn.md); a bucket that may not sit where it does. Replaces the former `E_STRUCT_KIND_PLACEMENT`, which had no subject left once placement became grammar. |
