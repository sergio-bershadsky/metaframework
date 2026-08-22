# SRN — identity and reference syntax

> Distilled from `framework/spec/srn.md` (and the placement projection in
> `framework/spec/structure.md`). **When `framework/spec/` is present in the
> repository, it is authoritative and wins over this file.** This bundled copy
> exists because an installed plugin cannot see the repo spec.

The SRN is the one identity and reference syntax. Every entity has exactly one
SRN; the SRN maps 1:1 to a directory under `solutions/`. There is no second
addressing scheme for catalog references.

One artifact *writes* it differently: `schema.json` addresses schemas by their
canonical HTTP URL, so that stock JSON Schema tooling can dereference them
unaided. That is a change of spelling, not of scheme.

## The consolidating principle

> **The SRN is the identity. The schema URL is its dereferenceable projection.
> The disk path is its storage. All three are mechanically inter-convertible,
> and none of them is a second addressing scheme.**

Three views of one string. The catalog reasons in the SRN, the filesystem stores
it, and JSON Schema tooling dereferences it. Converting between the views is
surgery on a prefix — never a lookup, never a table:

```text
srn://acme/datamodel/money                              # identity   — what the catalog says
solutions/acme/datamodel/money/                         # storage    — strip "srn://", prefix "solutions/"
https://schemas.metaframework.dev/acme/datamodel/money  # projection — strip "srn://", prefix the canonical host
```

Every rule below follows from that. Placement is a directory rule *and* a grammar
rule because the path and the SRN are one string. The solution boundary is
checkable on a bare URL because the first path segment after the host is the
solution. A `$ref` maps back to an SRN by deleting a prefix, which is why the
portal can render URL edges as SRN pairs without resolving anything.

The host is a **stable canonical constant**, not an environment variable —
identity must not differ between a laptop and production. `SCHEMA_BASE_URL`
controls only where the portal *serves* schemas (its `/schemas` route); it never
appears in `$id` or `$ref`. See `schemas.md` in this directory.

The one asymmetry, stated so it is not mistaken for drift: **the projection drops
the `@version` pin.** A schema URL addresses the *current* schema of an entity,
and a `@N` inside one is rejected rather than ignored. Pins live where git-backed
history can resolve them — frontmatter `relations` and prose — so the identity
view carries a version and the projection does not.

## Shape

```text
srn://{solution}( /{kind}/{name} )*  [.{artifact}]  [@{version}]
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
srn://acme/capability/order-fulfilment                        # solution-level capability
srn://acme/journey/first-purchase                             # solution-level journey
srn://acme/product/shop/metric/checkout-conversion            # product-owned metric
```

Segments are kebab-case, 1–64 chars: `^[a-z0-9]+(-[a-z0-9]+)*$`. No trailing
slash, no query, no fragment, no percent-encoding, no uppercase, no empty
segment. `@version` is a positive integer with no leading zeros and MAY appear
**only on the final segment** — `srn://acme/product/shop@2/component/checkout`
is `E_SRN_SYNTAX`.

In RFC 3986 terms the **solution occupies the authority position**; everything
after it is path. That is why a relative reference can never leave the solution:
sealed universes fall out of the URI grammar.

## The eleven reserved kinds

```text
product  component  datamodel  protocol  actor  environment  adr  requirement
capability  journey  metric
```

They may stand only in a **kind** position. Using one as a solution name or an
entity name is `E_SRN_RESERVED`.

| Property             | Kinds                                                   |
|----------------------|---------------------------------------------------------|
| Containers (may own) | `product`, `component`                                  |
| Solution-level only  | `actor`, `environment`, `capability`, `journey`         |
| Owner-scoped leaves  | `datamodel`, `protocol`, `adr`, `requirement`, `metric` |

A **solution-level** kind describes the solution as a whole and may only be the
first pair: an actor and an environment sit outside any one product, a
capability is something the business can do rather than something a component
happens to contain, and a journey crosses the solution by definition — a product
owning one would be claiming a path whose ends it cannot see.

An **owner-scoped** kind hangs under whatever it belongs to, from the solution
down to the deepest component. `metric` is scoped exactly as `requirement` is,
and for the same reason: a number is only meaningful about *something*, so it
lives with whatever is accountable for it rather than in one solution-wide pile.
What it *measures* is an edge, not its placement.

The second line of the bucket list is the later arrival. The set grows by
**appending**, never by re-sorting or re-cutting, so a word that was a bucket
stays a bucket — and a word that was free for naming may stop being free. That
last direction has a cost: adopting a bucket takes its word out of circulation
everywhere at once, and any entity already named after it does not merely become
illegal, its path silently changes meaning. `srn://acme/product/shop/metric/checkout-conversion` was `E_SRN_SYNTAX` before
`metric` became a bucket and is now a legal metric address; `srn://acme/product/shop/datamodel/metric` is `E_SRN_RESERVED`, not a
datamodel called "metric".

## Parsing is a pair walk

Segment 1 is the solution. Everything after it is read **two segments at a
time**: first is the kind, second is the name. No lookahead, no backtracking.

- An odd tail is `E_SRN_SYNTAX` — a bucket on its own is a directory, not an
  entity. `srn://acme/product/shop/datamodel` and `srn://acme/product` both fail.
- A first-of-pair that is not one of the eleven is `E_SRN_SYNTAX`
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
| P4  | A **solution-level** kind may only be the **first** pair.       | `srn://acme/product/shop/actor/operator`        |

P4 reads over the set, not over a pair of literals, which is why admitting
`capability` and `journey` added no rule — they joined `actor` and `environment`
in it. `metric` added none either, for the opposite reason: an owner-scoped kind
is exactly a kind that no rule after P1 mentions.

```text
srn://acme/product/shop/capability/order-fulfilment  # P4 — capabilities are solution-level
srn://acme/product/shop/journey/checkout-flow        # P4 — so are journeys
srn://acme/journey/first-purchase/metric/drop-off    # P1 — a journey owns nothing
srn://acme/capability/order-fulfilment/metric/lead-time
                                                     # P1 — nor does a capability
```

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

**None of this arithmetic applies to `schema.json`.** A `$ref` is a canonical
schema URL: absolute and complete, encoding what the target *is* and never how
far it sits from the referrer. No `$ref` in a catalog contains a `..` at all, and
moving an entity would rewrite the references *inside* it and none of the
references *out* of it. A relative `$ref` is `E_DM_REF_TARGET` (`schemas.md`).

## Version suffix

- `@N` pins the reference to integer version `N`.
- No suffix means **latest** — a moving target by design; pin for
  reproducibility.
- Only current versions exist on disk. `@N` resolves via the target's current
  frontmatter, else via the git version→commit index, else `E_SRN_VERSION` (an
  error: the pin names nothing).
- A pin that *does* resolve but is behind its target — `@1` against a current
  `@4` — is legal and is `W_REF_STALE_PIN`, a warning. It is reported and never
  failed: a forgotten migration and a deliberate freeze look identical from
  outside the file.
- The suffix pins only the entity the SRN addresses. There is no way to pin an
  ancestor.

## Artifact suffix — addressing an entity's files

A **dot suffix on the final segment** addresses one artifact of an entity:

```text
srn://{solution}( /{kind}/{name} )*.{artifact}  [@{version}]
```

```text
srn://acme/product/shop/protocol/order-placement.transport@2  # transport.yaml of snapshot @2
srn://acme/product/shop/protocol/order-placement.workflows.place-order
                                                              # workflows/place-order.yaml, current
```

Lexing strips `@version` from the end **first**, then splits the final segment
at its **first** dot. `order-placement@2.transport` is `E_SRN_SYNTAX` — the
artifact suffix precedes `@version`. The split is unambiguous because no
segment may contain a dot; that exclusion is a **normative, one-way
reservation** of the dot, exactly like a reserved word.

Artifact names come from a **closed, per-kind role table with fixed
filenames** — `transport` → `transport.yaml`; depth 2 exists only for
`workflows.<name>` and `examples.<name>` (the compact table is in
`structure.md`). The table is a spec constant like the reserved kinds:
SRN→path conversion needs the spec, never a catalog read. It is also the one
place SRN ≡ path bends — the suffix maps *through* the table, not to a
literal path segment.

- **No version of its own.** `X.transport@N` is "the transport artifact of
  snapshot `X@N`": `@N` is a coordinate of the **parent**, resolved through
  the ordinary version→commit index (`evolution.md`).
- **Entity surfaces are fenced.** An artifact SRN is illegal in `relations`
  (every edge), `primary-actors`, protocol `participants[].ref` and
  `payload`/`request`/`response`/`message` refs and AsyncAPI `x-srn-payload`
  refs, `topology.yaml` component refs,
  `config.yaml` `for` refs, and `journey.yaml` `actor`/`touches`/step
  `protocol` — those surfaces mean entities, and an artifact has no kind for
  an edge to be typed over. The surface's own code fires (`E_FM_EDGE_TARGET`
  and kin) with a message naming the artifact suffix; a suffix that is illegal
  vocabulary for the kind it names fails earlier, as `E_SRN_ARTIFACT`. Legal
  in v1: prose markdown links and external consumers.
- **Absolute forms only.** A relative reference carrying an artifact suffix is
  `E_SRN_SYNTAX` — dot-splitting stays out of `..` arithmetic. Write the
  `srn://…` or solution-absolute `/product/…` form.
- `E_SRN_ARTIFACT`: unknown role for the addressed kind, wrong depth, or any
  suffix on a kind with no roles — statically checkable, no catalog read.
- `E_SRN_DANGLING`: a **legal** role whose file is absent (`transport.yaml` is
  optional on a protocol).
- `.schema` on a datamodel is legal for uniformity but **normalizes to the
  entity**: its URL projection is the entity's canonical schema URL, and no
  second URL is ever minted (`schemas.md`).

## Where SRNs are written

| Surface                                         | Form                                                                |
|-------------------------------------------------|---------------------------------------------------------------------|
| Frontmatter `relations`, kind fields            | absolute / solution-absolute / relative — prefer absolute-from-root |
| Protocol `participants[].ref`, step `payload`   | same; solution-absolute recommended                                 |
| `journey.yaml` `actor` / `touches` / `protocol` | same; solution-absolute is the readable form (`journeys.md`)        |
| Prose markdown links                            | **MUST** be the full `srn://…` form                                 |
| `schema.json` `$id` / `$ref`                    | the canonical schema URL — the SRN's projection (`schemas.md`)      |
| `schema.json` `x-srn`                           | **required**: the entity's own SRN, unversioned, no relative form   |

In workflow YAML, `from`/`to` are participant **aliases** and `message` is a
logical message name — never SRNs. A bare relative path in a markdown link is
indistinguishable from a file link, so the portal leaves it as one and no entity
page resolves. No typed surface in the table accepts an **artifact SRN** (dot
suffix) — prose links are the one authoring surface that does.

## Error classes

Per-reference (V1–V6); catalog-resolved (V7–V9):

| #   | Rule                                                                            | Code                   |
| --- | ------------------------------------------------------------------------------- | ---------------------- |
| V1  | Parses under the grammar (incl. lexing order, `..` depth, `@` position).        | `E_SRN_SYNTAX`         |
| V2  | Path alternates `{kind}/{name}`; every pair complete.                           | `E_SRN_SYNTAX`         |
| V3  | No reserved keyword as a solution or entity **name**.                           | `E_SRN_RESERVED`       |
| V4  | Placement legal (P1–P4).                                                        | `E_SRN_PLACEMENT`      |
| V5  | Artifact suffix names a role of the addressed kind, at that role's depth.       | `E_SRN_ARTIFACT`       |
| V6  | Does not name a foreign solution.                                               | `E_SRN_CROSS_SOLUTION` |
| V7  | Resolved directory exists with `index.md`; an addressed artifact's file exists. | `E_SRN_DANGLING`       |
| V8  | Pinned `@N` exists on disk or in the version→commit index.                      | `E_SRN_VERSION`        |
| V9  | Target kind legal for the referring **relation edge**.                          | `E_FM_EDGE_TARGET`     |

V9 covers `relations` only. Other typed reference surfaces carry their own
codes — `E_PROD_ACTOR_TARGET`, `E_PROTO_PARTICIPANT_KIND`,
`E_PROTO_PAYLOAD_KIND`, `E_ENV_TARGET_KIND` — while V1–V8 apply unchanged.

`W_REF_DEPRECATED` (warning): the reference target has `status: deprecated`.
