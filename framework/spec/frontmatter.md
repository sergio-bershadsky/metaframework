---
kind: spec
name: frontmatter
version: 1
status: review
title: Common frontmatter
summary: The common frontmatter contract every entity index.md must satisfy — fields, types, typed relation edges, and validation.
---

# Common frontmatter

Every entity document — the `index.md` of every solution, product, component,
datamodel, protocol, actor, environment, adr, and requirement — begins with a
YAML frontmatter block satisfying this contract. Kind-specific fields are
**explicitly delegated** to the per-kind documents (`kinds/*.md`, planned);
this document defines only what is common to all kinds.

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

The portal validates every frontmatter block with a zod schema at build/load;
a type violation of any rule below is `E_FM_SCHEMA` unless a more specific
error class is named.

## Field table

| Field       | Type                              | Required | Rule                                                                    |
| ----------- | --------------------------------- | -------- | ----------------------------------------------------------------------- |
| `name`      | string, kebab-case                | yes      | MUST equal the directory name (`E_FM_NAME_MISMATCH`).                   |
| `kind`      | enum, see below                   | yes      | MUST match the entity's position on disk (`E_FM_KIND_LOCATION`).        |
| `version`   | integer ≥ 1                       | yes      | Bumped per [evolution.md](evolution.md); integer, never a string.       |
| `title`     | string, ≤ 80 chars                | yes      | Human display name; any characters.                                     |
| `summary`   | string, one line, ≤ 200 chars     | yes      | One sentence; shown in catalog lists; no markdown.                      |
| `status`    | `draft \| review \| approved \| deprecated` | yes | Lifecycle per [evolution.md](evolution.md).                     |
| `owner`     | string                            | no       | Responsible team/person handle (e.g. `team-payments`); free-form, stable. |
| `relations` | map of edge type → list of SRN refs | no     | Typed outgoing edges; see below.                                        |
| `tags`      | list of kebab-case strings        | no       | Free navigation facets; no semantics attached.                          |

`kind` enum — the closed v1 ontology:

```text
solution | product | component |
datamodel | protocol | actor | environment | adr | requirement
```

`kind` vs. location: a container's `kind` is determined by nesting depth
(solution → product → component, components at every deeper level); an owned
entity's `kind` MUST equal its kind bucket. Examples:

```yaml
# solutions/acme/shop/index.md
kind: product          # correct — direct child of a solution

# solutions/acme/shop/checkout/payment/index.md
kind: component        # correct — any container below product level

# solutions/acme/shop/datamodel/order/index.md
kind: environment      # E_FM_KIND_LOCATION — bucket says datamodel
```

(Framework spec documents like this file use `kind: spec` and live outside
`solutions/`; they follow this contract's shape but are not solution entities.)

## Relations — typed edges

`relations` is a map from **edge type** to a list of SRN references (absolute
or relative, optionally `@`-pinned — [srn.md](srn.md)). The v1 edge set is
closed; extending it is an additive spec change:

| Edge         | Legal source kinds        | Legal target kinds                            | Meaning                                                        |
| ------------ | ------------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| `uses`       | any                       | datamodel, protocol, environment, component   | Source consumes the target (client/reader side).               |
| `exposes`    | component, product        | protocol, datamodel                           | Source offers the target as its public surface (provider side).|
| `depends-on` | component, product        | component, product                            | Structural dependency, coarser than `uses`.                    |
| `implements` | component, product        | requirement                                   | Source realizes the requirement.                               |
| `supersedes` | any                       | same kind as source                           | Swap edge: successor → predecessor ([evolution.md](evolution.md)). |

Rules:

- An edge whose target kind is illegal for its type is `E_FM_EDGE_TARGET`
  (rule V7 in [srn.md](srn.md)). Example: `implements: [/actor/customer]` from
  a component — actors are not implementable.
- **Inverse edges are derived, never authored.** The portal computes `used-by`,
  `exposed-by`, `depended-on-by`, `implemented-by`, `superseded-by` from the
  forward edges. Authoring both directions is double bookkeeping and drifts.
- Relations are the semantic graph the portal draws (component graphs, etc.).
  Prose markdown links are navigational only and never create edges.
- A protocol's participant list lives in its own artifacts (kind-specific, see
  `kinds/protocol.md` when written), not in common relations; components point
  at protocols via `exposes`/`uses`.

```yaml
relations:
  exposes:
    - ../protocol/order-events          # this component provides the protocol
  uses:
    - /datamodel/money@1                # pinned solution-level datamodel
    - /environment/production
  depends-on:
    - /shop/inventory
  implements:
    - requirement/idem-cap              # this component's own requirement
```

## Full example

`solutions/acme/shop/checkout/payment/datamodel/order/index.md`:

```yaml
---
name: order
kind: datamodel
version: 3
title: Order
summary: Customer order aggregate persisted by the payment component.
status: approved
owner: team-payments
relations:
  uses:
    - /datamodel/money@1
    - refund                            # sibling datamodel, same bucket
  supersedes:
    - cart-order                        # predecessor from the last swap
tags:
  - commerce
  - aggregate
x-jira-epic: SHOP-142
---

# Order

Prose: intent, invariants, review notes. The machine-readable shape lives in
the sibling `schema.json`, whose `$id` is `srn://acme/shop/checkout/payment/datamodel/order@3`.
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
  used-by: [/shop/checkout]   # E_FM_SCHEMA — inverse edges are derived, not authored
```

## Delegation to kind documents

Each `kinds/*.md` document (planned) MAY add fields for its kind — always
**on top of** this contract, never overriding it. Examples of what will be
delegated there: an ADR's decision/consequences structure, a protocol's
participants and transport artifacts, an environment's topology artifact, a
requirement's acceptance criteria. A kind document MUST NOT redefine the
fields in this document, relax their requiredness, or reuse an `x-` prefix for
a normative field.

## Frontmatter error classes

| Code                  | Meaning                                                          |
| --------------------- | ---------------------------------------------------------------- |
| `E_FM_SCHEMA`         | Frontmatter fails the common zod schema (type/enum/shape).       |
| `E_FM_NAME_MISMATCH`  | `name` ≠ entity directory name.                                  |
| `E_FM_KIND_LOCATION`  | `kind` contradicts the entity's disk position.                   |
| `E_FM_EDGE_TARGET`    | Relation edge targets an entity of an illegal kind.              |
| `E_FM_UNKNOWN_FIELD`  | Unknown top-level field without `x-` prefix.                     |
