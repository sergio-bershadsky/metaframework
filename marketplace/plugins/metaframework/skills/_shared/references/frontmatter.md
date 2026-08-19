# Frontmatter — common contract and per-kind fields

> Distilled from `framework/spec/frontmatter.md` and the "Frontmatter additions"
> section of every `framework/spec/kinds/*.md`. **When `framework/spec/` is
> present in the repository, it is authoritative and wins over this file.** This
> bundled copy exists because an installed plugin cannot see the repo spec.

Every entity `index.md` opens with a YAML frontmatter block, delimited by `---`
at the very top of the file. YAML 1.2, no custom tags, no multi-document
streams. Field names are lowercase kebab-case.

**Unknown top-level fields are an error** (`E_FM_UNKNOWN_FIELD`) unless prefixed
`x-`, which is the escape hatch for local experimentation and is ignored by the
portal:

```yaml
x-jira-epic: SHOP-142      # tolerated
costcenter: 4711           # E_FM_UNKNOWN_FIELD
```

**Kind fields do not leak across kinds.** The frontmatter schema is a
discriminated union on `kind`: a field defined by one kind document is unknown
everywhere else, so `actor-type` on a product is `E_FM_UNKNOWN_FIELD` like any
other stray key.

## Common fields — every kind

| Field       | Type                                | Required | Rule                                                                                                    |
|-------------|-------------------------------------|----------|---------------------------------------------------------------------------------------------------------|
| `name`      | string, kebab-case                  | yes      | MUST equal the directory name (`E_FM_NAME_MISMATCH`).                                                   |
| `kind`      | one of the nine kinds               | yes      | MUST equal the bucket the directory sits in (`E_FM_KIND_LOCATION`).                                     |
| `version`   | integer ≥ 1                         | yes      | Integer, never a string; bumped per `evolution.md`.                                                     |
| `title`     | string, ≤ 80 chars                  | yes      | Human display name; any characters.                                                                     |
| `summary`   | string, one line, ≤ 200 chars       | yes      | One sentence, no markdown; shown in catalog lists.                                                      |
| `status`    | enum: `draft`, `review`, `approved`, `deprecated` | yes | **Document** lifecycle — never the described thing's real-world stage.                     |
| `owner`     | string                              | no       | Responsible team/person handle, e.g. `team-payments`.                                                   |
| `relations` | map of edge type → list of SRN refs | no       | Typed **outgoing** edges; see below.                                                                    |
| `tags`      | list of kebab-case strings          | no       | Free navigation facets; no semantics attached.                                                          |

`kind` enum (the closed v1 ontology):

```text
solution | product | component | datamodel | protocol | actor | environment | adr | requirement
```

The solution root is the only entity with no bucket; its `kind` is always
`solution`. Whether a bucket may sit where it sits is grammar, not frontmatter —
that is `E_SRN_PLACEMENT` (`srn.md`), raised before frontmatter is even read.

## Per-kind fields — the table people get wrong

Omitting a required kind field is an error. Each row is **on top of** the common
fields above, and never overrides them.

| Kind          | Required kind fields                                                    | Optional kind fields         |
|---------------|-------------------------------------------------------------------------|------------------------------|
| `solution`    | `vision`                                                                | `scope`, `contacts`          |
| `product`     | `lifecycle`                                                             | `primary-actors`             |
| `component`   | `component-type`                                                        | —                            |
| `datamodel`   | `usage`                                                                 | `abstract` (default `false`) |
| `protocol`    | `participants` (≥ 2), `style`                                           | `conforms-to`                |
| `actor`       | `actor-type`, `goals` (≥ 1)                                             | —                            |
| `environment` | `environment-type`                                                      | —                            |
| `adr`         | `decision-status`, `date`; `deciders` when accepted/rejected/superseded | —                            |
| `requirement` | `requirement-type`, `priority`                                          | —                            |

Value sets, all closed — anything outside is `E_FM_SCHEMA`:

| Field              | Values                                                                          |
|--------------------|---------------------------------------------------------------------------------|
| `lifecycle`        | `concept`, `incubating`, `active`, `maintenance`, `sunset`, `retired`           |
| `component-type`   | `service`, `library`, `ui`, `job`, `datastore`, `gateway`, `external`           |
| `usage`            | `storage`, `exchange`, `both`                                                   |
| `style`            | `point-to-point`, `bus`, `request-response`                                     |
| `actor-type`       | `human`, `system`, `external-system`, `service-account`                         |
| `environment-type` | `dev`, `staging`, `production`, `edge`, `local`                                 |
| `decision-status`  | `proposed`, `accepted`, `rejected`, `superseded`                                |
| `requirement-type` | `functional`, `non-functional`                                                  |
| `priority`         | `must`, `should`, `could`, `wont` — `wont` has no apostrophe                    |

Shapes of the non-scalar kind fields:

- `vision` — multi-line string ≤ 1000 chars. Distinct from `summary`: `summary`
  is the one catalog line, `vision` is the paragraph a newcomer reads first.
- `scope` — `{ in: [string], out: [string] }`, each line ≤ 200 chars. `out` is
  the anti-scope.
- `contacts` — list of `{ role, handle, channel? }`; `role` kebab-case and unique.
- `primary-actors` — list of SRN refs, each MUST resolve to a solution-level
  `actor` (`E_PROD_ACTOR_TARGET`). Not a relation edge, because no v1 edge type
  accepts an actor target.
- `goals` — list of one-line strings, ≥ 1, each ≤ 200 chars, verb-first, stated
  from the actor's point of view.
- `participants` — list of `{ alias, ref, role? }`. `alias` is kebab-case ≤ 32
  chars and unique within the protocol (`E_PROTO_ALIAS_DUP`); `ref` MUST resolve
  to a `component`, `product`, or `actor` (`E_PROTO_PARTICIPANT_KIND`). Fewer
  than two entries is `E_PROTO_PARTICIPANTS`. A participant carries no title of
  its own — the portal labels the lifeline from the target entity.
- `conforms-to` — list of `{ standard, version?, url? }`; display-only, never
  fetched, never resolved. For *standards*, not for files — an OpenAPI document
  in the directory is bound in `transport.yaml` under `spec`.
- `date` (adr) — calendar date `YYYY-MM-DD`, no time, no timezone
  (`E_ADR_DATE`). **Quote it: `date: "2026-02-03"`.** The spec says the native
  YAML timestamp is also accepted, but the portal parses frontmatter with
  gray-matter, which turns an unquoted `2026-02-03` into a JS `Date`, and the
  zod schema wants a string — so the unquoted form is `E_FM_SCHEMA` today. Every
  ADR in `solutions/acme/` is quoted.
- `deciders` (adr) — list of free-form handles; REQUIRED and non-empty once
  `decision-status` is `accepted`, `rejected`, or `superseded`
  (`E_ADR_DECIDERS`).

Two lifecycle fields never collide with `status`: `status` answers "is this
*document* written and reviewed?"; `lifecycle` (product) and `decision-status`
(adr) answer questions about the thing described. A retired product with an
approved description is normal and legal.

## Relations — forward edges only

`relations` maps an edge type to a list of SRN references (absolute,
solution-absolute, or relative; optionally `@`-pinned). The v1 edge set is
closed:

| Edge         | Legal source kinds | Legal target kinds                          | Meaning                                         |
|--------------|--------------------|---------------------------------------------|-------------------------------------------------|
| `uses`       | any                | datamodel, protocol, environment, component | Source consumes the target (client side).       |
| `exposes`    | component, product | protocol, datamodel                         | Source offers the target as its public surface. |
| `depends-on` | component, product | component, product                          | Structural dependency, coarser than `uses`.     |
| `implements` | component, product | requirement                                 | Source realizes the requirement.                |
| `supersedes` | any                | same kind as source                         | Swap edge: successor → predecessor.             |

**Inverse edges are DERIVED, never authored.** `used-by`, `exposed-by`,
`depended-on-by`, `implemented-by`, `superseded-by` are computed by the portal
from the forward edges. Writing one is a mistake, not a convenience —
`E_FM_SCHEMA`.

Other rules that bite:

- An illegal target kind is `E_FM_EDGE_TARGET`; an edge authored by a kind that
  may not author it is `E_FM_EDGE_SOURCE`. The two codes are separate because
  they blame different files.
- `uses` → `environment` **is** the deployment declaration: "this component runs
  in that environment". Environments never maintain a roster; the portal derives
  it.
- A datamodel MUST NOT restate its schema `$ref` edges under `relations.uses` —
  the portal derives those from `schema.json`. Reserve `uses` on a datamodel for
  what the schema cannot say, chiefly a **version pin** (`/datamodel/money@1`).
- A protocol SHOULD NOT list its payload datamodels under `relations.uses` —
  the message/datamodel matrix is derived from its artifacts.
- Prose markdown links are navigational only; they never create edges.

## A real frontmatter block

`solutions/acme/product/shop/component/checkout/index.md`:

```yaml
---
name: checkout
kind: component
version: 7
title: Checkout
summary: Converts a cart into a paid order — pricing, tax, stock reservation, and payment orchestration.
status: approved
owner: team-checkout
component-type: service
relations:
  uses:
    - /environment/production
    - /environment/staging
    - /datamodel/money@1
    - /product/shop/component/checkout/protocol/tax-quoting
  exposes:
    - /product/shop/protocol/order-placement
    - /product/shop/component/checkout/datamodel/cart@1
  depends-on:
    - /product/shop/component/inventory
    - /product/billing/component/ledger
  implements:
    - /product/shop/component/checkout/requirement/idem-cap
    - /product/shop/component/checkout/requirement/p99-checkout-latency
    - /requirement/gdpr-erasure
tags:
  - checkout
  - payments
x-runtime: kotlin-jvm
---
```

Counter-examples worth memorising:

```yaml
name: Order            # E_FM_SCHEMA — not kebab-case
name: refund           # E_FM_NAME_MISMATCH — directory is "order"
version: "3"           # E_FM_SCHEMA — string, not integer
version: 3.1           # E_FM_SCHEMA — not an integer
summary: |             # E_FM_SCHEMA — multi-line summary
  Customer order
  aggregate.
children: [checkout]   # E_FM_UNKNOWN_FIELD — containment is derived from disk
relations:
  used-by:             # E_FM_SCHEMA — inverse edges are derived, not authored
    - /product/shop/component/checkout
  exposes:             # E_FM_EDGE_SOURCE — a datamodel has no public surface
    - /product/shop/protocol/order-placement
```

## Error classes

| Code                 | Meaning                                                    |
|----------------------|------------------------------------------------------------|
| `E_FM_SCHEMA`        | Fails the zod schema (type / enum / shape / requiredness). |
| `E_FM_NAME_MISMATCH` | `name` ≠ entity directory name.                            |
| `E_FM_KIND_LOCATION` | `kind` ≠ the bucket the directory sits in.                 |
| `E_FM_EDGE_TARGET`   | Relation edge targets an entity of an illegal kind.        |
| `E_FM_EDGE_SOURCE`   | Relation edge authored by a kind that may not author it.   |
| `E_FM_UNKNOWN_FIELD` | Unknown top-level field without an `x-` prefix.            |

Kind-specific codes: `E_PROD_ACTOR_TARGET`, `E_PROTO_PARTICIPANTS`,
`E_PROTO_ALIAS_DUP`, `E_PROTO_PARTICIPANT_KIND`, `E_ADR_DATE`,
`E_ADR_DECIDERS`.
