# SRN — identity and reference syntax

> Distilled from `framework/spec/srn.md` (and the placement projection in
> `framework/spec/structure.md`). **When `framework/spec/` is present in the
> repository, it is authoritative and wins over this file.** This bundled copy
> exists because an installed plugin cannot see the repo spec.

The SRN is the one identity and reference syntax. Every entity has exactly one
SRN; the SRN maps 1:1 to a directory under `solutions/`. There is no second
addressing scheme for catalog references.

One artifact is outside this rule: `schema.json` addresses other schemas by the
HTTP URL the portal serves them at, so that stock JSON Schema tooling can
dereference them. See `schemas.md` in this directory.

## Shape

```text
srn://{solution}( /{kind}/{name} )*  [@{version}]
```

Below the solution the path is a **strict alternation of kind bucket and name**,
so an entity's kind is stated at every level rather than inferred from depth:

```text
srn://acme                                                    # solution
srn://acme/product/shop                                       # product
srn://acme/product/shop/component/checkout                    # component
srn://acme/product/shop/component/checkout/component/payment  # sub-component
srn://acme/product/shop/component/checkout/datamodel/cart@1   # component-owned datamodel
srn://acme/product/shop/protocol/order-placement@2            # product-level protocol
srn://acme/actor/customer                                     # solution-level actor
srn://acme/datamodel/money@1                                  # solution-level datamodel
```

Segments are kebab-case, 1–64 chars: `^[a-z0-9]+(-[a-z0-9]+)*$`. No trailing
slash, no query, no fragment, no percent-encoding, no uppercase, no empty
segment. `@version` is a positive integer with no leading zeros and MAY appear
**only on the final segment** — `srn://acme/product/shop@2/component/checkout`
is `E_SRN_SYNTAX`.

In RFC 3986 terms the **solution occupies the authority position**; everything
after it is path. That is why a relative reference can never leave the solution:
sealed universes fall out of the URI grammar.

## The eight reserved kinds

```text
product  component  datamodel  protocol  actor  environment  adr  requirement
```

They may stand only in a **kind** position. Using one as a solution name or an
entity name is `E_SRN_RESERVED`.

| Property             | Kinds                                         |
|----------------------|-----------------------------------------------|
| Containers (may own) | `product`, `component`                        |
| Solution-level only  | `actor`, `environment`                        |
| Owner-scoped leaves  | `datamodel`, `protocol`, `adr`, `requirement` |

## Parsing is a pair walk

Segment 1 is the solution. Everything after it is read **two segments at a
time**: first is the kind, second is the name. No lookahead, no backtracking.

- An odd tail is `E_SRN_SYNTAX` — a bucket on its own is a directory, not an
  entity. `srn://acme/product/shop/datamodel` and `srn://acme/product` both fail.
- A first-of-pair that is not one of the eight is `E_SRN_SYNTAX`
  (`srn://acme/shop/checkout` → `"shop" is not a kind bucket`). The pre-bucket
  flat form does not parse; there is no compatibility mode.
- The SRN's kind is the kind of the last pair. `srn://acme` has no pairs and no
  kind — the only kind-less SRN.

## Placement is grammar, not a later check

Enforced by the parser in this fixed order, reported as `E_SRN_PLACEMENT`:

| #   | Rule                                                            | Rejected example                                |
| --  | --------------------------------------------------------------- | ----------------------------------------------- |
| P1  | Only a `product` or a `component` may own anything.             | `srn://acme/datamodel/money/datamodel/currency` |
| P2  | A `product` pair may only be the **first** pair.                | `srn://acme/product/shop/product/billing`       |
| P3  | A `component` pair may never be first — it follows a container. | `srn://acme/component/checkout`                 |
| P4  | `actor` and `environment` may only be the **first** pair.       | `srn://acme/product/shop/actor/operator`        |

A misplaced entity therefore has **no SRN at all** — the loader reports it while
reading the directory, before any graph is built.

## Resolution to disk

Strip `srn://`, prefix `solutions/`; the result is the entity **directory**, and
the entity document is `index.md` inside it. `@version` never appears on disk.

```text
srn://acme/product/shop/component/checkout/datamodel/cart@1
→ solutions/acme/product/shop/component/checkout/datamodel/cart/
→ solutions/acme/product/shop/component/checkout/datamodel/cart/index.md
```

The inverse holds and is how the loader works: a catalog-relative directory is
parsed as an SRN, so an illegal directory produces no entity.

## Relative references — the one real trap

Resolution is RFC 3986 §5 against **the URI of the referring document**
(`{entity-srn}/index.md`, or `{entity-srn}/workflows/place-order.yaml` for a file
in an asset subdirectory).

**One `..` pops ONE segment, and a bucket plus a name is TWO segments.** Climbing
out of an entity costs two `..`; a single `..` lands *inside the bucket*,
addressing a sibling.

Base entity `srn://acme/product/shop/component/checkout` (document
`.../checkout/index.md`):

```text
datamodel/cart                  → srn://acme/product/shop/component/checkout/datamodel/cart
../inventory                    → srn://acme/product/shop/component/inventory
                                  # ONE ".." pops the name only — still inside component/
../../protocol/order-placement  → srn://acme/product/shop/protocol/order-placement
                                  # TWO pop the whole pair, landing on the owning product
../../../../actor/customer      → srn://acme/actor/customer
                                  # FOUR pop two pairs, landing on the solution root
/datamodel/money@1              → srn://acme/datamodel/money@1
                                  # solution-absolute: no counting at all
```

Miscounts fail loudly, and the class says how:

```text
..                              → E_SRN_SYNTAX     # lands on a bucket: not addressable
../../../datamodel/money        → E_SRN_SYNTAX     # three pops leave a half pair
../../actor/operator            → E_SRN_PLACEMENT  # an actor under a product
../../../../../datamodel/money  → E_SRN_SYNTAX     # climbs above the solution root
```

**Rule of thumb: write solution-absolute (`/product/shop/datamodel/money@1`) for
anything outside the current entity.** Keep `..` chains to the one case where
they read better — a sibling in the same bucket (`../cart-order` from
`datamodel/order/`) — plus a reference into the entity's *own* bucket, which
needs no dots at all (`requirement/idem-cap` from a component).

A relative reference MUST NOT contain more `..` than the base has depth (RFC 3986
would silently clamp; the framework rejects it). A network-path reference
(`//other-solution/...`) is `E_SRN_CROSS_SOLUTION`.

## Version suffix

- `@N` pins the reference to integer version `N`.
- No suffix means **latest** — a moving target by design; pin for
  reproducibility.
- Only current versions exist on disk. `@N` resolves via the target's current
  frontmatter, else via the git version→commit index, else `E_SRN_VERSION`.
- The suffix pins only the entity the SRN addresses. There is no way to pin an
  ancestor.

## Where SRNs are written

| Surface                                       | Form                                                                |
|-----------------------------------------------|---------------------------------------------------------------------|
| Frontmatter `relations`, kind fields          | absolute / solution-absolute / relative — prefer absolute-from-root |
| Protocol `participants[].ref`, step `payload` | same; solution-absolute recommended                                 |
| Prose markdown links                          | **MUST** be the full `srn://…` form                                 |
| `schema.json` `$id` / `$ref`                  | **not an SRN** — an HTTP schema URL (`schemas.md`)                  |

In workflow YAML, `from`/`to` are participant **aliases** and `message` is a
logical message name — never SRNs. A bare relative path in a markdown link is
indistinguishable from a file link, so the portal leaves it as one and no entity
page resolves.

## Error classes

Per-reference (V1–V5); catalog-resolved (V6–V8):

| #   | Rule                                                                | Code                   |
| --  | ------------------------------------------------------------------- | ---------------------- |
| V1  | Parses under the grammar (incl. `..` depth, `@` position).          | `E_SRN_SYNTAX`         |
| V2  | Path alternates `{kind}/{name}`; every pair complete.               | `E_SRN_SYNTAX`         |
| V3  | No reserved keyword as a solution or entity **name**.               | `E_SRN_RESERVED`       |
| V4  | Placement legal (P1–P4).                                            | `E_SRN_PLACEMENT`      |
| V5  | Does not name a foreign solution.                                   | `E_SRN_CROSS_SOLUTION` |
| V6  | Resolved directory exists and contains `index.md`.                  | `E_SRN_DANGLING`       |
| V7  | Pinned `@N` exists on disk or in the version→commit index.          | `E_SRN_VERSION`        |
| V8  | Target kind legal for the referring **relation edge**.              | `E_FM_EDGE_TARGET`     |

V8 covers `relations` only. Other typed reference surfaces carry their own
codes — `E_PROD_ACTOR_TARGET`, `E_PROTO_PARTICIPANT_KIND`,
`E_PROTO_PAYLOAD_KIND`, `E_ENV_TARGET_KIND` — while V1–V7 apply unchanged.

`W_REF_DEPRECATED` (warning): the reference target has `status: deprecated`.
