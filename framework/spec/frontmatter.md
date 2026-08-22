---
kind: spec
name: frontmatter
version: 8
status: review
title: Common frontmatter
summary: The common frontmatter contract every entity index.md must satisfy — fields, types, typed relation edges over the eleven kinds, the status-versus-lifecycle split, and validation.
---

# Common frontmatter

Every entity document — the `index.md` of every solution, product, component,
datamodel, protocol, actor, environment, adr, requirement, capability, journey,
and metric — begins with a YAML frontmatter block satisfying this contract.
Kind-specific fields are
**explicitly delegated** to the per-kind documents in
[`kinds/`](index.md#document-map); this document defines only what is common to
all kinds.

Format rules:

- Frontmatter is delimited by `---` lines at the very top of the file, YAML 1.2,
  no custom tags, no multi-document streams.
- Field names are lowercase kebab-case.
- Unknown top-level fields are rejected (`E_FM_UNKNOWN_FIELD`) unless prefixed
  `x-` — the escape hatch for local experimentation:

  ```yaml
  x-jira-epic: SHOP-142      # tolerated, ignored by the portal
  costcenter: 4711           # E_FM_UNKNOWN_FIELD
  ```

- **Kind fields do not leak across kinds.** The frontmatter schema is a
  discriminated union on `kind`: the fields a kind document adds are known only
  for that kind, and using one anywhere else is `E_FM_UNKNOWN_FIELD` like any
  other unknown field.

  ```yaml
  # solutions/acme/product/shop/index.md
  kind: product
  lifecycle: active          # legal — kinds/product.md defines it for products
  actor-type: human          # E_FM_UNKNOWN_FIELD — an actor field on a product
  ```

The portal validates every frontmatter block with a zod schema at build/load;
a type violation of any rule below is `E_FM_SCHEMA` unless a more specific
error class is named.

## Field table

| Field       | Type                                        | Required | Rule                                                                                                                                                                   |
|-------------|---------------------------------------------|----------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `name`      | string, kebab-case                          | yes      | MUST equal the directory name (`E_FM_NAME_MISMATCH`).                                                                                                                  |
| `kind`      | enum, see below                             | yes      | MUST match the entity's position on disk (`E_FM_KIND_LOCATION`).                                                                                                       |
| `version`   | integer ≥ 1                                 | yes      | Bumped per [evolution.md](evolution.md); integer, never a string.                                                                                                      |
| `title`     | string, ≤ 80 chars                          | yes      | Human display name; any characters.                                                                                                                                    |
| `summary`   | string, one line, ≤ 200 chars               | yes      | One sentence; shown in catalog lists; no markdown.                                                                                                                     |
| `status`    | `draft \| review \| approved \| deprecated` | yes      | Review state of **this document** per [evolution.md](evolution.md) — never the described thing's real-world stage ([below](#status-and-lifecycle-are-different-axes)). |
| `owner`     | string                                      | no       | Responsible team/person handle (e.g. `team-payments`); free-form, stable.                                                                                              |
| `relations` | map of edge type → list of SRN refs         | no       | Typed outgoing edges; see below.                                                                                                                                       |
| `tags`      | list of kebab-case strings                  | no       | Free navigation facets; no semantics attached.                                                                                                                         |

`kind` enum — the twelve kinds (eleven of them also bucket words; `solution` has
no bucket because it is the root):

```text
solution | product | component |
datamodel | protocol | actor | environment | adr | requirement |
capability | journey | metric
```

The third line is the later arrival. The enum grows by **appending**, never by
re-cutting: nothing that was a kind stops being one, and the `kind` a document
already declares never changes meaning ([evolution.md](evolution.md),
decision-record amendment 2026-08-20-a).

`kind` vs. location: **`kind` MUST equal the bucket the entity's directory sits
in** — for every kind, containers included. Nothing is inferred from depth: the
path states the kind at every level ([srn.md](srn.md)), so the check is a string
comparison against the second-to-last path segment. The solution root is the
only entity with no bucket, and its `kind` is always `solution`.

```yaml
# solutions/acme/product/shop/index.md
kind: product          # correct — the bucket is product/

# solutions/acme/product/shop/component/checkout/component/payment/index.md
kind: component        # correct — the bucket is component/, at any depth

# solutions/acme/product/shop/datamodel/order-line/index.md
kind: environment      # E_FM_KIND_LOCATION — the bucket says datamodel
```

Which bucket may sit where is grammar, not frontmatter: a `product/` bucket
below solution level, a `component/` bucket at solution level, or an `actor/`
bucket inside a product are all `E_SRN_PLACEMENT` — the directory's own path
fails to parse, so the entity never reaches frontmatter validation.
`E_FM_KIND_LOCATION` is left with exactly one job: a `kind` that disagrees with
a bucket that is itself legally placed.

(Framework spec documents like this file use `kind: spec` and live outside
`solutions/`; they follow this contract's shape but are not solution entities.)

## `status` and `lifecycle` are different axes

This is the single easiest thing in the whole contract to get wrong, so it is
stated here rather than only in the kind documents.

> **`status` is the review state of the DESCRIPTION.
> `lifecycle` is the delivery state of the THING DESCRIBED.**

They are separate fields with separate enums, they move independently, and
neither is ever inferred from the other.

| Field             | Subject — what it is about                             | Values                                                           | Defined in                                          |
| ----------------- | ------------------------------------------------------ | ---------------------------------------------------------------- | --------------------------------------------------- |
| `status`          | **this `index.md`** — the description you are reading  | `draft` `review` `approved` `deprecated`                         | [evolution.md](evolution.md) — common, every kind   |
| `lifecycle`       | **the product** as a funded position in the portfolio  | `concept` `incubating` `active` `maintenance` `sunset` `retired` | [kinds/product.md](kinds/product.md) — REQUIRED     |
| `lifecycle`       | **the component** as a thing that is built and shipped | `planned` `in-development` `released` `sunset` `retired`         | [kinds/component.md](kinds/component.md) — REQUIRED |
| `decision-status` | **the decision** an ADR records                        | `proposed` `accepted` `rejected` `superseded`                    | [kinds/adr.md](kinds/adr.md) — REQUIRED             |

The two axes **cross**, and every cell of the crossing is legal. The one the
framework exists for is the top-left:

```yaml
kind: component
status: approved          # the description has been written and reviewed …
lifecycle: planned        # … and not one line of it has been built yet
```

That is the design-first normal case, not an inconsistency: describing and
reviewing a component before building it is the point of the catalog. The
opposite corner is just as legal and just as common:

```yaml
kind: component
status: draft             # nobody has finished writing this down …
lifecycle: released       # … but it has been in production for two years
```

Consequences, all normative:

- **`lifecycle` is not an extension of `status`.** Adding a fifth `status` value
  like `built` or `shipped` is `E_FM_SCHEMA`; so is a `lifecycle` value borrowed
  from the `status` enum. The two vocabularies are disjoint on purpose — a word
  that appeared in both would make the sentence "this is deprecated" ambiguous
  about which axis it is on.
- **Neither implies the other.** A `lifecycle: retired` component may keep
  `status: approved` forever: the description of a thing that no longer runs is
  still accurate, and nothing is ever deleted ([evolution.md](evolution.md)).
- **The kinds that have no `lifecycle` have none by design.** A datamodel, a
  protocol, an actor, an ADR, a requirement, a capability, a journey, or a
  metric *is* its description — there is no separately-delivered artifact to
  track. Only `product` and `component` name a thing that is built and shipped
  apart from the document describing it.
- **`lifecycle` is deliberately coarse and global.** It says nothing about
  *where*: per-environment release state lives in the environment entities and
  in `topology.yaml` ([kinds/environment.md](kinds/environment.md)). A component
  live in staging and not yet in production is `lifecycle: in-development` — no
  consumer can call it for real — with a `uses` edge to the staging
  environment, never a value of its own like `released-in-staging`
  ([kinds/component.md](kinds/component.md)).
- **`status: deprecated` and a sunset `lifecycle` are unrelated moves.**
  `status: deprecated` retires the *document* at the end of a swap; a component
  whose replacement is being rolled out is `lifecycle: sunset` while its
  description stays `approved` and accurate.

## Relations — typed edges

`relations` is a map from **edge type** to a list of SRN references (absolute
or relative, optionally `@`-pinned — [srn.md](srn.md)). The v1 edge set is
closed; extending it is an additive spec change:

| Edge         | Legal source kinds | Legal target kinds                           | Meaning                                                            |
| ------------ | ------------------ | -------------------------------------------- | ------------------------------------------------------------------ |
| `uses`       | any                | datamodel, protocol, environment, component  | Source consumes the target (client/reader side).                   |
| `exposes`    | component, product | protocol, datamodel                          | Source offers the target as its public surface (provider side).    |
| `depends-on` | component, product | component, product                           | Structural dependency, coarser than `uses`.                        |
| `implements` | component, product | requirement                                  | Source satisfies the requirement.                                  |
| `realizes`   | component, product | capability                                   | Source is part of how the business does that thing.                |
| `measures`   | metric             | capability, component, protocol, requirement | Source is a number about the target.                               |
| `supersedes` | any                | same kind as source                          | Swap edge: successor → predecessor ([evolution.md](evolution.md)). |

The last two are the later arrivals; the set grows by appending, and no existing
edge changed source kinds, target kinds, or meaning when they landed. Only the
`implements` wording moved — it read "source realizes the requirement" before
`realizes` was an edge name, and now reads "satisfies" so the two cannot be
confused. The meaning is unchanged.

### `realizes` and `measures`

**`realizes`** answers *"what does this thing let the business do?"*. It points
**up**, from a product or component to a solution-level `capability` — never the
other way, which is why a capability owns nothing and authors nothing. One
capability is normally realized by several components across several products;
the `realized-by` fan-in is derived, so the capability page shows the whole set
without anyone maintaining a list on it.

```yaml
# solutions/acme/product/shop/component/checkout/index.md
relations:
  realizes:
    - /capability/order-fulfilment      # solution-absolute: capabilities are
                                        # always exactly one pair from the root
```

`realizes` is not `implements` in different clothes. A **requirement** is an
obligation someone wrote down and a component can be checked against it; a
**capability** is a standing ability of the business and is never "done". A
component may well have both edges, and they carry different reviews:

```yaml
relations:
  implements:
    - requirement/idem-cap              # an obligation this component satisfies
  realizes:
    - /capability/order-fulfilment      # an ability this component contributes to
```

**`measures`** is authored only by a `metric`, and points at the thing the
number is about. It is the one edge whose source is restricted to a single kind,
because a metric is the only kind that exists *in order to* say something about
something else.

```yaml
# solutions/acme/product/shop/metric/checkout-conversion/index.md
kind: metric
relations:
  measures:
    - /capability/order-fulfilment      # a capability, …
    - /product/shop/component/checkout  # … a component, …
    - requirement/p99-under-300ms       # … or a requirement it puts a number on
```

Four target kinds is the widest set in the table, because measuring is
orthogonal to the thing measured — but it is deliberately not "any". An
**actor**, an **environment** and an **adr** are a person, a place and a past
decision rather than parts of the system; a **datamodel** or a **journey** is
measured through the component that holds the data or the capability that
carries the path, so letting a metric attach directly would split one number
across two pages (decision-record amendment 2026-08-20-b). Pointing at an
illegal target is `E_FM_EDGE_TARGET`, and the fix is to move the edge, never to
widen the enum locally.

```yaml
# on a metric
relations:
  measures:
    - /environment/production           # E_FM_EDGE_TARGET — measure what runs
                                        # there, not the place
# on a component
relations:
  measures:
    - /capability/order-fulfilment      # E_FM_EDGE_SOURCE — only a metric measures
```

**Where a metric lives is not what it measures.** Placement states who is
accountable for the number; `measures` states what the number is about. A
component-owned metric measuring a solution-level capability is the ordinary
case, not a smell:

```text
srn://acme/product/shop/component/checkout/metric/p99-latency
  measures → srn://acme/capability/order-fulfilment
```

Rules:

- An edge whose target kind is illegal for its type is `E_FM_EDGE_TARGET`,
  checked once the catalog is resolved ([srn.md](srn.md)). Example:
  `implements: [/actor/customer]` from a component — actors are not
  implementable.
- An edge authored by a kind that is not in its **Legal source kinds** column is
  `E_FM_EDGE_SOURCE`. Example: `exposes` on a datamodel — only components and
  products have a public surface. The two codes are separate because they blame
  different documents: `E_FM_EDGE_SOURCE` is wrong in the file you are reading,
  `E_FM_EDGE_TARGET` is wrong about the file it points at.
- **A missing edge is a warning when the gap is a state of the world.** A
  capability that nothing `realizes` is `W_CAP_UNREALIZED`, on the precedent of
  `W_REQ_UNIMPLEMENTED` ([kinds/requirement.md](kinds/requirement.md)):
  describing a thing before building it is this framework's intended order of
  work, so the gap is a fact about the catalog, not a mistake in a file.
- **One edge is an exception, because its absence empties the entity.** A metric
  with no `measures` edge is `E_MET_NO_SUBJECT`, an **error**
  ([kinds/metric.md](kinds/metric.md)) — the only required relation edge any
  kind has. It is not the same shape of gap: an unrealized capability is a true
  sentence about a business that cannot do the thing yet, while a number with no
  subject is not an under-built observation, it is not an observation at all,
  the way a protocol with one participant is not a protocol. A `measures` edge
  that points at an illegal kind is `E_FM_EDGE_TARGET` and **not**
  `E_MET_NO_SUBJECT` — two separate mistakes, two separate complaints.
- **Inverse edges are derived, never authored.** The portal computes `used-by`,
  `exposed-by`, `depended-on-by`, `implemented-by`, `realized-by`, `measured-by`,
  `superseded-by` from the forward edges. Authoring both directions is double
  bookkeeping and drifts. The two newest inverses follow the same construction
  as the rest — the forward name plus `-by`, computed at load, never written in
  a file:

  | Forward      | Authored on            | Derived inverse   | Shown on                                     |
  | ------------ | ---------------------- | ----------------- | -------------------------------------------- |
  | `realizes`   | the product/component  | `realized-by`     | the capability page: everything realizing it |
  | `measures`   | the metric             | `measured-by`     | the measured entity's page: its numbers      |

  A `realized-by:` or `measured-by:` key in frontmatter is `E_FM_SCHEMA`, like
  every other authored inverse.
- Relations are the semantic graph the portal draws (component graphs, etc.).
  Prose markdown links are navigational only and never create edges.
- **`exposes`/`uses` is the authoritative side of the protocol graph.** A
  component or product points at a protocol with `exposes` (provider) or `uses`
  (consumer); those edges, and only those, carry direction and build the
  portal's participant graph. The protocol's own `participants` list
  ([kinds/protocol.md](kinds/protocol.md)) is authoritative for something else —
  the alias namespace its workflows use, and the NCA that fixes its directory.
  Neither side is derived from the other; they are cross-checked as warnings.
- **Artifact suffixes are fenced out of every frontmatter reference surface.**
  An artifact SRN ([srn.md](srn.md)) — a dot suffix on the final segment, as in
  `…/protocol/order-placement.transport` — addresses a file *of* an entity, and
  every reference surface in this contract means an entity: edges are typed
  over the kind columns above, and an artifact has no kind, so no edge type can
  accept one. An artifact SRN in any `relations` list, under any edge type, is
  `E_FM_EDGE_TARGET`, and the message names the artifact suffix as the problem;
  the fix is to point at the owning entity, whose page carries its artifacts.
  The fence is contract-wide, not an edge rule only: `primary-actors` is fenced
  identically under its own class ([kinds/product.md](kinds/product.md)), and
  each kind document extends the fence to its own reference surfaces — a
  participant's `ref`, the `payload`/`request`/`response`/`message` refs and an
  AsyncAPI `x-srn-payload`
  ([kinds/protocol.md](kinds/protocol.md)), a topology's `component` refs and a
  config's `for` refs ([kinds/environment.md](kinds/environment.md)), a
  journey's `actor`, step `touches`, and step `protocol`
  ([kinds/journey.md](kinds/journey.md)) — each under that surface's own error
  class. Prose is the legal home in v1: prose links are navigational
  only and create no edge, so a body-markdown link may name an artifact SRN
  with nothing to fence. Growing more legal surfaces later is an additive
  change.

  ```yaml
  # solutions/acme/product/shop/component/checkout/index.md
  relations:
    uses:
      - /product/shop/protocol/order-placement.transport  # E_FM_EDGE_TARGET —
                                                          # artifact suffix
                                                          # ".transport"; drop it
                                                          # and the edge is legal
  ```

  The same reference is legal one block down, in the body:

  ```markdown
  Serves the wire contract in the protocol's
  [transport](srn://acme/product/shop/protocol/order-placement.transport).
  ```

References are resolved from the referring entity's own directory, and a bucket
plus a name is **two** path segments — so a target outside the entity's own
subtree SHOULD be written solution-absolute rather than as a `..` chain
([srn.md](srn.md)).

```yaml
# solutions/acme/product/shop/component/checkout/index.md
relations:
  exposes:
    - /product/shop/protocol/order-placement   # this component provides it
  uses:
    - /datamodel/money@1                       # pinned solution-level datamodel
    - /environment/production
  depends-on:
    - /product/shop/component/inventory        # sibling component
  implements:
    - requirement/idem-cap                     # this component's own bucket:
                                               # relative, and correct at any depth
```

The last entry is the one case where relative still reads better: an entity's
own bucket is appended to its own path, so `requirement/idem-cap` resolves to
`srn://acme/product/shop/component/checkout/requirement/idem-cap` and survives
the component being renamed. The equivalent `../../protocol/order-placement` for
the first entry pops two segments (`checkout`, then the `component` bucket) and
is exactly the arithmetic the absolute form removes.

## Full example

`solutions/acme/product/shop/component/checkout/component/payment/datamodel/order/index.md`:

```yaml
---
name: order
kind: datamodel
version: 3
title: Order
summary: Customer order aggregate persisted by the payment component.
status: approved
owner: team-payments
usage: both                           # kind field, from kinds/datamodel.md
abstract: false                       # kind field, from kinds/datamodel.md
relations:
  supersedes:
    - ../cart-order                   # predecessor from the last swap. A
                                      # sibling in the same bucket needs the
                                      # `../`: the base of a relative ref is
                                      # this entity's own directory (srn.md)
tags:
  - commerce
  - aggregate
x-jira-epic: SHOP-142
---

Prose: intent, invariants, review notes. It opens with a paragraph, never a
heading: `title` above is the page's h1, and a second one would leave the
document with no outline ([structure.md](structure.md#the-document-body)).
The machine-readable shape lives in
the sibling `schema.json`, whose REQUIRED root `$id` and every cross-entity
`$ref` are canonical HTTP URLs, so stock JSON Schema tooling can dereference
them unaided (decision-record amendments 2026-08-19-c and 2026-08-19-d).
Identity is unchanged by the spelling: the `$id`
`https://schemas.metaframework.dev/acme/product/shop/component/checkout/component/payment/datamodel/order`
is this entity's SRN
`srn://acme/product/shop/component/checkout/component/payment/datamodel/order`
with a different prefix ([srn.md](srn.md)) — and the schema states that SRN
outright in its REQUIRED `x-srn`. The `version` above is the only copy of the
version: neither `$id` nor `x-srn` carries one.
```

`status` is the one frontmatter field a datamodel mirrors into its schema. When
it reaches `deprecated`, `schema.json` SHOULD also set `"deprecated": true` at
the root — a standard 2020-12 meta-data keyword, so the annotation reaches every
consumer that only ever sees the schema, not just the portal
([evolution.md](evolution.md), [kinds/datamodel.md](kinds/datamodel.md)). No
other frontmatter field is duplicated inside the schema.

The schema's `$ref` edges are deliberately **not** repeated under `relations` —
the portal derives them from `schema.json`
([kinds/datamodel.md](kinds/datamodel.md)). `relations` on a datamodel carries
only what the schema cannot say, and the standing example is a **version pin**: a
schema URL addresses the current schema and a `@N` inside one is rejected, so a
pin has exactly one legal home.

```yaml
relations:
  uses:
    - /datamodel/money@1      # good — the pin the schema's URL $ref cannot carry
    - /datamodel/base-record  # redundant — unpinned, and schema.json already $refs it
```

Counter-examples:

```yaml
name: Order            # E_FM_SCHEMA — not kebab-case
name: refund           # E_FM_NAME_MISMATCH — directory is "order"
version: "3"           # E_FM_SCHEMA — string, not integer
version: 3.1           # E_FM_SCHEMA — not an integer
summary: |             # E_FM_SCHEMA — multi-line summary
  Customer order
  aggregate.
relations:
  used-by:                    # E_FM_SCHEMA — inverse edges are derived, not authored
    - /product/shop/component/checkout
  exposes:                    # E_FM_EDGE_SOURCE — a datamodel has no public surface
    - /product/shop/protocol/order-placement
```

## Delegation to kind documents

Each `kinds/*.md` document MAY add fields for its kind — always **on top of**
this contract, never overriding it. What is delegated there: an ADR's
`decision-status`, `date`, `deciders` and its body template
([kinds/adr.md](kinds/adr.md)); a protocol's `participants`, `style`, and
transport artifacts ([kinds/protocol.md](kinds/protocol.md)); an environment's
`environment-type` and topology artifact
([kinds/environment.md](kinds/environment.md)); a requirement's acceptance
criteria ([kinds/requirement.md](kinds/requirement.md)); a component's
`component-type` (ten values, grown by appending — `content`, `application` and
`specification` arrived 2026-08-20), REQUIRED `lifecycle`, and optional
`criticality` ([kinds/component.md](kinds/component.md)); a journey's `actor` and its
ordered steps, which live in a `journey.yaml` artifact rather than in
frontmatter ([kinds/journey.md](kinds/journey.md)); a metric's `metric-type`, `target`,
`window` and `direction` ([kinds/metric.md](kinds/metric.md)); and so on for
every kind listed in [index.md](index.md#document-map). `capability` adds no
frontmatter field at all — the common contract already says everything a
capability needs, and a kind that arrives with speculative fields teaches
authors to fill in noise ([kinds/capability.md](kinds/capability.md)).

A kind document MUST NOT redefine the fields in this document, relax their
requiredness, or reuse an `x-` prefix for a normative field. In particular:

- **`status` is never re-specified by a kind.** Where a kind needs a second
  lifecycle it introduces a *differently named* field with its own enum —
  `lifecycle` on a product ([kinds/product.md](kinds/product.md)), `lifecycle`
  on a component ([kinds/component.md](kinds/component.md)), `decision-status`
  on an ADR ([kinds/adr.md](kinds/adr.md)). `status` always and only answers "is
  this document written and reviewed?"
  ([above](#status-and-lifecycle-are-different-axes)).
- **A shared field name does not mean a shared enum.** `lifecycle` is one name
  on two kinds because both answer "what stage is the thing in?", but the value
  sets differ and are validated per kind: the frontmatter schema is a
  discriminated union on `kind`, so `lifecycle: incubating` on a component is
  `E_FM_SCHEMA` even though it is valid on a product.
- **Inverse edges stay derived** in kind documents too; no kind may add an
  authored back-edge for something a forward edge already states.

## Frontmatter error classes

| Code                 | Meaning                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------- |
| `E_FM_SCHEMA`        | Frontmatter fails the common zod schema (type/enum/shape).                              |
| `E_FM_NAME_MISMATCH` | `name` ≠ entity directory name.                                                         |
| `E_FM_KIND_LOCATION` | `kind` ≠ the kind bucket the entity's directory sits in.                                |
| `E_FM_EDGE_TARGET`   | Relation edge targets an entity of an illegal kind — or an artifact, which has no kind. |
| `E_FM_EDGE_SOURCE`   | Relation edge authored by a kind that may not author it.                                |
| `E_FM_UNKNOWN_FIELD` | Unknown top-level field without `x-` prefix.                                            |

Placement of the bucket itself is not a frontmatter concern: an illegally
placed bucket is `E_SRN_PLACEMENT` ([srn.md](srn.md)), raised while the
directory's path is parsed.
