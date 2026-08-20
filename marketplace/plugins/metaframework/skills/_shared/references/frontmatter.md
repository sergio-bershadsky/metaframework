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
| `kind`      | one of the twelve kinds             | yes      | MUST equal the bucket the directory sits in (`E_FM_KIND_LOCATION`).                                     |
| `version`   | integer ≥ 1                         | yes      | Integer, never a string; bumped per `evolution.md`.                                                     |
| `title`     | string, ≤ 80 chars                  | yes      | Human display name; any characters.                                                                     |
| `summary`   | string, one line, ≤ 200 chars       | yes      | One sentence, no markdown; shown in catalog lists.                                                      |
| `status`    | enum: `draft`, `review`, `approved`, `deprecated` | yes | Review state of **this document** — never the described thing's real-world stage.          |
| `owner`     | string                              | no       | Responsible team/person handle, e.g. `team-payments`.                                                   |
| `relations` | map of edge type → list of SRN refs | no       | Typed **outgoing** edges; see below.                                                                    |
| `tags`      | list of kebab-case strings          | no       | Free navigation facets; no semantics attached.                                                          |

`kind` enum — twelve kinds, eleven of which are also bucket words:

```text
solution | product | component | datamodel | protocol | actor | environment | adr | requirement |
capability | journey | metric
```

The second line is the later arrival. The enum grows by **appending**, never by
re-cutting: nothing that was a kind stops being one, and the `kind` a document
already declares never changes meaning.

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
| `component`   | `component-type`, `lifecycle`                                           | —                            |
| `datamodel`   | `usage`                                                                 | `abstract` (default `false`) |
| `protocol`    | `participants` (≥ 2), `style`                                           | `conforms-to`                |
| `actor`       | `actor-type`, `goals` (≥ 1)                                             | —                            |
| `environment` | `environment-type`                                                      | —                            |
| `adr`         | `decision-status`, `date`; `deciders` when accepted/rejected/superseded | —                            |
| `requirement` | `requirement-type`, `priority`                                          | —                            |
| `capability`  | — **none at all**                                                       | —                            |
| `journey`     | `actor`                                                                 | —                            |
| `metric`      | `metric-type`, `target`, `window`, `direction`                          | —                            |

Value sets, all closed — anything outside is `E_FM_SCHEMA`:

| Field                    | Values                                                                          |
|--------------------------|---------------------------------------------------------------------------------|
| `lifecycle` (product)    | `concept`, `incubating`, `active`, `maintenance`, `sunset`, `retired`           |
| `lifecycle` (component)  | `planned`, `in-development`, `released`, `sunset`, `retired`                     |
| `component-type`         | `service`, `library`, `ui`, `job`, `datastore`, `gateway`, `external`           |
| `usage`                  | `storage`, `exchange`, `both`                                                   |
| `style`                  | `point-to-point`, `bus`, `request-response`                                     |
| `actor-type`             | `human`, `system`, `external-system`, `service-account`                         |
| `environment-type`       | `dev`, `staging`, `production`, `edge`, `local`                                 |
| `decision-status`        | `proposed`, `accepted`, `rejected`, `superseded`                                |
| `requirement-type`       | `functional`, `non-functional`                                                  |
| `priority`               | `must`, `should`, `could`, `wont` — `wont` has no apostrophe                    |
| `metric-type`            | `ratio`, `duration`, `count`, `amount`                                          |
| `direction`              | `higher-is-better`, `lower-is-better` — spelled out; `higher` alone is `E_FM_SCHEMA` |

**A shared field name does not mean a shared enum.** `lifecycle` is one name on
two kinds because both answer "what stage is the thing in?", but the value sets
differ and are validated per kind — the schema is a discriminated union on
`kind`, so `lifecycle: incubating` on a component is `E_FM_SCHEMA` even though it
is valid on a product. The `sunset` / `retired` tail is shared and means the same
thing on both.

Shapes of the three newest kinds' fields:

- `capability` adds **nothing**. Any kind-specific field on a capability is
  `E_FM_UNKNOWN_FIELD` — including `capability-type`, `maturity` and
  `lifecycle`. A classification the business argues about goes in `tags`; a
  measure of how well the doing is done is a `metric`.
- `actor` (journey) — a single SRN reference, not a list, resolving to a
  solution-level `actor` (`E_JRN_ACTOR_KIND`). The protagonist. The ordered
  steps are **not** frontmatter: they live in `journey.yaml` (`journeys.md`), and
  a `steps:` key here is `E_FM_UNKNOWN_FIELD`.
- `target` and `window` (metric) — **quoted strings, always.** `target` is a
  literal of the grammar `metric-type` selects (`E_MET_TARGET`); `window` is
  `instant` or a rolling duration (`E_MET_WINDOW`).

  | `metric-type` | `target` literal        | Example       |
  |---------------|-------------------------|---------------|
  | `ratio`       | decimal + `%`           | `"99.9%"`     |
  | `duration`    | decimal + `ms/s/m/h/d`  | `"400ms"`     |
  | `count`       | bare decimal, may be negative | `"1200"` |
  | `amount`      | decimal, space, ISO 4217 code | `"12.50 EUR"` |

  Quoting is load-bearing for exactly one case — a `count` target of `1200`,
  which YAML turns into an integer before validation sees it, producing
  `E_FM_SCHEMA` for what looks to the author like the right value. Quote both
  and the rule needs no case analysis. `window` has the same units plus
  `instant`; there are no calendar tokens, because "this month" is an alignment
  the reporting tool applies and two teams would disagree about it.

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

## `status` and `lifecycle` are different axes

The single easiest thing in the contract to get wrong.

> **`status` is the review state of the DESCRIPTION.
> `lifecycle` is the delivery state of the THING DESCRIBED.**

| Field             | Is about                                          | Values                                                           |
|-------------------|---------------------------------------------------|-------------------------------------------------------------------|
| `status`          | **this `index.md`** — the description you read    | `draft` `review` `approved` `deprecated`                         |
| `lifecycle`       | **the product** as a funded portfolio position    | `concept` `incubating` `active` `maintenance` `sunset` `retired` |
| `lifecycle`       | **the component** as a thing built and shipped    | `planned` `in-development` `released` `sunset` `retired`         |
| `decision-status` | **the decision** an ADR records                   | `proposed` `accepted` `rejected` `superseded`                    |

The two axes **cross**, and every cell of the crossing is legal. The one the
framework exists for is the design-first case:

```yaml
kind: component
status: approved          # the description has been written and reviewed …
lifecycle: planned        # … and not one line of it has been built yet
```

```yaml
kind: component
status: draft             # nobody has finished writing this down …
lifecycle: released       # … but it has been in production for two years
```

Consequences:

- **`lifecycle` is not an extension of `status`.** A fifth `status` value like
  `built` is `E_FM_SCHEMA`, and so is a `lifecycle` value borrowed from the
  `status` enum. The vocabularies are disjoint on purpose.
- **Neither implies the other.** A `lifecycle: retired` component may keep
  `status: approved` forever — the description of a thing that no longer runs is
  still accurate, and nothing is ever deleted.
- **Only `product` and `component` have a `lifecycle`.** Every other kind *is*
  its description: a datamodel, protocol, actor, ADR, requirement, capability,
  journey or metric names no separately-delivered artifact to stage. Writing
  `lifecycle` on one is `E_FM_UNKNOWN_FIELD`.
- **`lifecycle` is deliberately coarse and global.** Per-environment release
  state lives in the environment entities and in `topology.yaml`. A component
  released to staging and not to production is `lifecycle: in-development` with
  a `uses: /environment/staging` edge — never `released-in-staging`.
- **`status: deprecated` and a sunset `lifecycle` are unrelated moves.**
  `status: deprecated` retires the *document* at the end of a swap; a component
  whose replacement is rolling out is `lifecycle: sunset` while its description
  stays `approved`.

Component `lifecycle`, read honestly:

| Value            | The honest test                                      |
|------------------|------------------------------------------------------|
| `planned`        | No code exists.                                      |
| `in-development` | Code exists; no consumer can call it for real.       |
| `released`       | Someone outside the building team depends on it now. |
| `sunset`         | A successor exists and migration is underway.        |
| `retired`        | Nothing calls it and nothing deploys it.             |

The value set is component's own and is **not** product's. Product stages a
funded position (`active` vs `maintenance` is an investment distinction, decided
at the product line); a component stages an artifact that is built and shipped,
and copying the investment split down would create a second, finer-grained
ledger with no independent source of truth. For a `library`, "released" means a
version is published and consumers can depend on it; for an `external`
component, `lifecycle` is that system as *we* see it, never a claim about the
vendor's roadmap.

The field is REQUIRED, so every component entity needs it — there is no back-fill
default, because guessing between `planned` and `released` on someone's behalf is
exactly the error the field exists to prevent.

## Relations — forward edges only

`relations` maps an edge type to a list of SRN references (absolute,
solution-absolute, or relative; optionally `@`-pinned). The v1 edge set is
closed:

| Edge         | Legal source kinds | Legal target kinds                           | Meaning                                         |
|--------------|--------------------|----------------------------------------------|-------------------------------------------------|
| `uses`       | any                | datamodel, protocol, environment, component  | Source consumes the target (client side).       |
| `exposes`    | component, product | protocol, datamodel                          | Source offers the target as its public surface. |
| `depends-on` | component, product | component, product                           | Structural dependency, coarser than `uses`.     |
| `implements` | component, product | requirement                                  | Source **satisfies** the requirement.           |
| `realizes`   | component, product | capability                                   | Source is part of how the business does that thing. |
| `measures`   | metric             | capability, component, protocol, requirement | Source is a number about the target.            |
| `supersedes` | any                | same kind as source                          | Swap edge: successor → predecessor.             |

`realizes` and `measures` are the later arrivals; the set grew by appending and
no existing edge changed source kinds, target kinds, or meaning. Only the
`implements` wording moved — it read "source realizes the requirement" before
`realizes` was an edge name, and now reads "satisfies" so the two cannot be
confused. The meaning is unchanged.

### `realizes` and `measures`

**`realizes`** answers *"what does this thing let the business do?"*. It points
**up**, from a product or component to a solution-level `capability` — never the
other way, which is why a capability owns nothing and authors nothing:

```yaml
# solutions/acme/product/shop/component/checkout/index.md
relations:
  implements:
    - /product/shop/component/checkout/requirement/idem-cap  # an obligation it satisfies
  realizes:
    - /capability/order-fulfilment      # two abilities it contributes to —
    - /capability/promotion-pricing     #   partial realization is normal
```

It is not `implements` in different clothes. A **requirement** is an obligation
someone wrote down and a component can be checked against it; a **capability** is
a standing ability of the business and is never "done". A component may well
carry both edges, and they carry different reviews. Partial realization is normal
and is not marked: a component realizing one slice writes the same edge as a
product realizing all of it.

**`measures`** is authored only by a `metric` — the one edge whose source is a
single kind, because a metric is the only kind that exists *in order to* say
something about something else. Four target kinds is the widest set in the
table, but deliberately not "any": an actor, an environment and an ADR are a
person, a place and a past decision rather than parts of the system, and a
datamodel or a journey is measured through the component that holds the data or
the capability that carries the path.

```yaml
# solutions/acme/product/shop/metric/checkout-conversion/index.md
kind: metric
relations:
  measures:
    - /capability/order-fulfilment       # required — a metric with no subject
                                         # is E_MET_NO_SUBJECT
  uses:
    - /environment/production            # where the number is observed
```

That metric is filed in `shop`'s bucket and measures a solution-level
capability, which is the ordinary case, not a smell. It is also the pair worth
memorising: the same capability is measured from the other end by
`/product/fulfilment/metric/delivery-on-time-rate` — one capability, two numbers,
two accountable owners, and no argument about where either lives.

```yaml
# on a metric
measures: [/environment/production]   # E_FM_EDGE_TARGET — measure what runs
                                      # there, not the place
# on a component
measures: [/capability/order-fulfilment]  # E_FM_EDGE_SOURCE — only a metric measures
```

**Where a metric lives is not what it measures.** Placement states who is
accountable for the number; `measures` states what the number is about. A
component-owned metric measuring a solution-level capability is the ordinary
case, not a smell.

**Inverse edges are DERIVED, never authored.** `used-by`, `exposed-by`,
`depended-on-by`, `implemented-by`, `realized-by`, `measured-by`,
`superseded-by` are computed by the portal from the forward edges. Writing one is
a mistake, not a convenience — `E_FM_SCHEMA`.

| Forward    | Authored on           | Derived inverse | Shown on                                     |
|------------|-----------------------|-----------------|----------------------------------------------|
| `realizes` | the product/component | `realized-by`   | the capability page: everything realizing it |
| `measures` | the metric            | `measured-by`   | the measured entity's page: its numbers      |

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

`solutions/acme/product/shop/component/checkout/index.md`, abridged — six edge
types on one component, including the two newest:

```yaml
---
name: checkout
kind: component
version: 8
title: Checkout
summary: Converts a cart into a paid order — pricing, tax, stock reservation, and payment orchestration.
status: approved
owner: team-checkout
component-type: service
lifecycle: released                    # the thing is shipped; `status` above
                                       # is about this document, not the thing
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
  realizes:
    - /capability/order-fulfilment
    - /capability/promotion-pricing
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

The three newest kinds add three more, all of them mistakes people make on the
first try:

```yaml
# on a capability
capability-type: core  # E_FM_UNKNOWN_FIELD — the kind adds no fields at all
lifecycle: active      # E_FM_UNKNOWN_FIELD — a product field on a capability

# on a journey
steps:                 # E_FM_UNKNOWN_FIELD — the steps live in journey.yaml
  - actor: /actor/customer
actor:                 # E_FM_SCHEMA — one protagonist, not a list
  - /actor/customer
  - /actor/courier

# on a metric
target: 1200           # E_FM_SCHEMA — YAML made it an integer; quote it
window: "1 month"      # E_MET_WINDOW — months are not a fixed duration
direction: higher      # E_FM_SCHEMA — "higher than what?"; the value spells it out
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

Kind-specific codes on the frontmatter surface:

| Code                     | Meaning                                                                                       |
|--------------------------|-----------------------------------------------------------------------------------------------|
| `E_PROD_ACTOR_TARGET`    | A `primary-actors` entry does not resolve to a solution-level actor.                          |
| `E_PROTO_PARTICIPANTS`   | `participants` missing or fewer than two.                                                     |
| `E_PROTO_ALIAS_DUP`      | Two participants share an alias.                                                              |
| `E_PROTO_PARTICIPANT_KIND` | A participant `ref` is not a component, product or actor.                                   |
| `E_ADR_DATE`             | `date` is not a bare `YYYY-MM-DD`.                                                            |
| `E_ADR_DECIDERS`         | `deciders` empty once the decision is accepted/rejected/superseded.                           |
| `E_JRN_ACTOR_KIND`       | The journey's `actor` resolves to something that is not an actor.                             |
| `E_MET_TARGET`           | `target` is not a literal of the grammar its `metric-type` selects.                           |
| `E_MET_WINDOW`           | `window` is neither `instant` nor a rolling duration literal.                                 |
| `E_MET_NO_SUBJECT`       | A metric with no `measures` edge, or an empty one. A number with no subject.                  |
| `W_MET_SUBJECT_SCOPE`    | The metric is filed outside its subject's ownership line. Capability subjects never raise it. |
| `W_CAP_UNREALIZED`       | No product or component `realizes` this capability — aspiration, not architecture.            |
| `W_CAP_REALIZATION_EDGE` | A capability authors `uses` toward a component; realization is the component's own edge.      |

Journey artifact codes (`E_JRN_SCHEMA`, `E_JRN_NAME`, `E_JRN_STEP_COUNT`,
`E_JRN_BRANCH`, `W_JRN_*`) belong to `journey.yaml`, not to frontmatter — see
`journeys.md`.
