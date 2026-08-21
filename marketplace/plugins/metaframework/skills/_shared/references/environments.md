# Environments — and the artifact-free kinds (actor, ADR, requirement)

> Distilled from `framework/spec/kinds/environment.md` (version 4), with the
> field and body detail of `framework/spec/kinds/actor.md` (2),
> `framework/spec/kinds/adr.md` (2) and `framework/spec/kinds/requirement.md`
> (2). **When `framework/spec/` is present in the repository, it is
> authoritative and wins over this file.** This bundled copy exists because an
> installed plugin cannot see the repo spec.
>
> Placement grammar is in `srn.md`, artifact filenames and enforced body
> headings in `structure.md`, field types in `frontmatter.md`. This file carries
> what only the kind documents say: the `topology.yaml` / `config.yaml`
> contracts, the enum rationales, and the per-kind error codes.

These four kinds share a shape: **one enum-bearing frontmatter field, prose, and
almost no machine-readable substance.** Only `environment` defines sibling
artifacts; actor, ADR and requirement are `index.md` and nothing else.

---

# `environment`

A deployment target: a named **place** where components run, with a declared
class of guarantees, a placement topology, and a configuration surface. It
describes a target, never a release — pipelines, build numbers and versions are
not catalog content.

## Placement and naming

**Solution-level only.** An `environment` pair may only be the first pair after
the authority, so placement is grammar, not a loader check:

```text
solutions/acme/environment/production/index.md                # legal
solutions/acme/product/shop/environment/production/index.md   # E_SRN_PLACEMENT
```

The rationale is that an environment is **shared**. `production` is one place,
and components from every product land in it; per-product `production` entities
would give one target several SRNs and fragment the config surface into copies
that immediately disagree. One target, one entity, one SRN.

Names are free kebab-case and SHOULD name the **place**, not its class:
`production`, `staging`, `eu-production`, `store-edge`, `local`. The class is
`environment-type`.

## `environment-type` — the closed enum

| Value        | What a component may assume about the target                                                                        | Typical names                 |
|--------------|----------------------------------------------------------------------------------------------------------------------|-------------------------------|
| `local`      | One developer's machine. No shared state, no SLO, no data of record, ephemeral. Anyone may break it at any moment.   | `local`                       |
| `dev`        | Shared and integrated, disposable, synthetic data only. Components may be `draft` here.                             | `dev`, `integration`          |
| `staging`    | Production-shaped: same topology, same protocol versions, non-production data. The last gate before real users.      | `staging`, `uat`, `perf`      |
| `production` | Real data, real users, real SLOs. Deprecation windows and migration order are binding here.                          | `production`, `eu-production` |
| `edge`       | Production-grade obligations, but geographically distributed and only intermittently connected to the core.         | `store-edge`, `vehicle-fleet` |

```yaml
environment-type: production
```

```yaml
environment-type: prod        # E_FM_SCHEMA — not a member of the enum
environment-type: [staging]   # E_FM_SCHEMA — list, not a scalar
```

Why exactly five, and why closed:

- Four values are rungs on **one ladder of data reality and blast radius** —
  nobody's machine, everybody's sandbox, production's rehearsal, production
  itself. That ladder is what gives the portal a promotion order with no extra
  field.
- `edge` is deliberately **not on the ladder**. It is a shape, not a stage: it
  carries production obligations but breaks the assumption every other value
  grants for free — that a component can reach the core synchronously and see
  one consistent state. That is a contract statement, it changes what a
  component may be designed to do, and the portal must know it *before* it opens
  `topology.yaml`. Folding `edge` into `production` and expressing distribution
  only in the topology artifact was considered and rejected for that reason.
- Rejected values and where they go instead: `qa`, `uat`, `sandbox`, `preview`,
  `demo` are **instances**, not classes — separate entities typed `staging`.
  `dr`, `failover` carry real data and real obligations — name the entity
  `dr-eu-west` and type it `production`. `ci` is not a deployment target of this
  solution's components — model the runner as an actor (`actor-type: system`).
- An open string would make the promotion badge, the `draft`-in-production
  check, and any type-based filtering undecidable. A sixth value later is an
  ordinary additive spec change.

## Membership is authored on the component side

**A component declares the environments it runs in; the environment keeps no
roster.**

```yaml
# solutions/acme/product/shop/component/checkout/index.md
relations:
  uses:
    - /environment/production      # "this component runs in that environment"
    - /environment/staging
```

`uses` → `environment` already exists in the common edge set, so a kind-specific
`environments:` field on a component would duplicate a common field and is
forbidden. The component kind adds the *reading*, not a field, and the portal
partitions a component's `uses` list by resolved target kind — environments
render as deployment chips, protocols and datamodels as consumed contracts.

Component-side rules that bite:

| #  | Rule                                                                                | Class                        |
|----|--------------------------------------------------------------------------------------|------------------------------|
| T1 | A `library` MUST NOT declare an environment — it has no runtime of its own.          | `E_COMP_LIBRARY_ENVIRONMENT` |
| T2 | A `service`, `ui`, `job`, `datastore` or `gateway` SHOULD declare ≥ 1 environment.   | `W_COMP_NO_ENVIRONMENT`      |

An `external` component MAY declare environments — that is exactly how a sandbox
endpoint is distinguished from a live one.

This document defines **no second membership channel**: `topology.yaml`
annotates members with placement detail, it does not create them. The reason is
the inverse-edge rule — authoring both "checkout runs in production" and
"production hosts checkout" is double bookkeeping that drifts within a sprint.
The portal derives the roster (`used-by`) from the forward edges.

A `topology.yaml` host entry for a component that does not declare this
environment is `W_ENV_HOST_UNDECLARED` — a warning, not an error, on the same
grounds as `W_STRUCT_PROTOCOL_NCA`: during a rollout the topology may
legitimately lead the component's own declaration by a commit or two.

## Sibling artifacts

```text
solutions/acme/environment/production/
├── index.md         # REQUIRED
├── topology.yaml    # OPTIONAL — placement and scale of hosted components
└── config.yaml      # OPTIONAL — the configuration surface this target provides
```

Both are part of the entity's version snapshot: **no `version:` key of their
own**, and any change to either bumps the entity's frontmatter `version` in the
same commit. In both, unknown keys — top level and inside entries — are rejected
unless `x-` prefixed. Each is SRN-addressable by a dot suffix on the entity
(`srn.md` reference): `….topology` and `….config`; `@N` on such an address is
the **entity's** version, never the file's.

### `topology.yaml`

| Top-level key | Type                | Required | Meaning                                                                |
|---------------|---------------------|----------|-------------------------------------------------------------------------|
| `regions`     | list of region maps | no       | The regions this environment occupies. Absent = single unnamed region. |
| `hosts`       | list of host maps   | yes      | Placement detail, one entry per hosted component or subtree.           |

Region map: `name` (kebab-case, unique in the file, free-form — `eu-west-1`,
`store-berlin`), `zones` (list of short strings), `notes` (prose, may be
multi-line).

Host map:

| Key         | Type                             | Required | Rule                                                                        |
|-------------|----------------------------------|----------|------------------------------------------------------------------------------|
| `component` | SRN reference                    | yes      | MUST resolve to a `component` or `product` (`E_ENV_TARGET_KIND`).            |
| `regions`   | list of region names             | no       | Each MUST be declared in `regions` (`E_ENV_REGION_UNKNOWN`). Absent = placement **not recorded**, not "everywhere". |
| `replicas`  | map `{ min: int ≥ 0, max: int }` | no       | `min` ≤ `max`. A fixed count is `{ min: n, max: n }`.                       |
| `scaling`   | one-line string ≤ 200 chars      | no       | A human sentence naming the trigger — not the YAML of an autoscaler.        |
| `notes`     | string                           | no       | Prose; may be multi-line.                                                   |

```yaml
regions:
  - name: eu-west-1
    zones: [a, b, c]
    notes: Primary; the write side of the order store lives here.
  - name: us-east-1
    zones: [a, b]

hosts:
  - component: /product/shop/component/checkout
    regions: [eu-west-1, us-east-1]
    replicas: { min: 3, max: 24 }
    scaling: horizontal on p95 request latency above 200ms
    notes: stateless; sticky sessions disabled
  - component: /product/shop/component/checkout/component/payment
    regions: [eu-west-1]
    replicas: { min: 2, max: 6 }
    scaling: manual
```

**Product shorthand.** A `product` target means "every component beneath it,
with these settings". **The most specific entry wins**, so a subtree entry plus
an explicit entry for one descendant is an override, not a conflict:

```yaml
hosts:
  - component: /product/shop                     # every component under shop
    regions: [eu-west-1]
    replicas: { min: 1, max: 2 }
  - component: /product/shop/component/checkout  # override for one of them
    regions: [eu-west-1]
    replicas: { min: 2, max: 2 }
```

**References resolve against the artifact's own URI**
(`srn://acme/environment/production/topology.yaml`), so solution-absolute form is
strongly preferred: it is shorter and it survives the environment being renamed.

```yaml
component: /product/shop/component/checkout            # recommended
component: srn://acme/product/shop/component/checkout  # equivalent, verbose
component: ../../product/shop/component/checkout       # legal, and nobody should
                                                       # have to verify it
```

```yaml
hosts:
  - component: /actor/customer                # E_ENV_TARGET_KIND — not a component
    regions: [eu-west-1]
  - component: /product/shop/component/inventory
    regions: [ap-south-1]                     # E_ENV_REGION_UNKNOWN — not declared
    replicas: { min: 5, max: 2 }              # E_ENV_TOPOLOGY_SCHEMA — min > max
    tier: gold                                # E_ENV_TOPOLOGY_SCHEMA — unknown key
                                              # (write x-tier: gold to keep it)
```

The format is deliberately minimal — regions, zones, counts, one sentence of
intent. It is a description for a reviewer and an input to the derived placement
view, **not an infrastructure manifest**. Anything a deployment tool needs and
this cannot express belongs in that tool's repository, referenced from prose.

### `config.yaml` — the configuration surface

The convention is one sentence long: **an environment declares which
configuration keys it provides, and where their values come from; it never
carries a secret value.**

Top-level key `config`, a list of entries, REQUIRED if the file exists:

| Key           | Type                  | Required           | Rule                                                                    |
|---------------|-----------------------|--------------------|--------------------------------------------------------------------------|
| `key`         | `^[A-Z][A-Z0-9_]*$`   | yes                | Env-var casing; unique per `(key, for)` pair.                           |
| `for`         | SRN reference         | no                 | Component or product it applies to (`E_ENV_TARGET_KIND`). Absent = environment-wide. |
| `secret`      | boolean               | no (default false) | Marks the value sensitive.                                              |
| `value`       | string                | no                 | The literal value. FORBIDDEN when `secret: true` (`E_ENV_SECRET_VALUE`).|
| `source`      | string                | when `secret`      | A **locator** for the value — never the value. Free-form but stable.    |
| `description` | one-line string ≤ 200 | no                 | What the key controls.                                                  |

```yaml
config:
  - key: LOG_LEVEL
    value: warn
    description: Root log level for every hosted component.
  - key: DATABASE_URL
    for: /product/shop/component/checkout
    secret: true
    source: vault:kv/acme/production/checkout#database-url
    description: Primary Postgres DSN for the checkout component.
```

```yaml
- key: database-url                # E_ENV_CONFIG_SCHEMA — wrong casing
- key: DATABASE_PASSWORD
  secret: true
  value: hunter2                   # E_ENV_SECRET_VALUE — never, at any status
- key: API_TOKEN
  secret: true                     # E_ENV_CONFIG_SCHEMA — secret without source
```

Key casing is `SCREAMING_SNAKE_CASE`, not kebab-case, on purpose: config keys
belong to the **runtime's** namespace, not the catalog's. Env-var casing is what
an operator copy-pastes, and it makes `grep -r DATABASE_URL solutions/`
unambiguous against SRN segments, which are kebab-case by grammar.

**Relationship to the component side.** A component declares which environments
it runs in — a `uses` edge, and nothing more. **v1 has no component-side
declaration of required configuration keys**, so the most valuable check — a
component needs a key no environment provides — is not expressible, and the spec
deliberately does not invent a component-side field to make it so. What *is*
checkable is the other direction: a `for:` entry naming a component that does not
run in this environment is dead configuration, `W_ENV_CONFIG_ORPHAN`.

Removing a key is therefore a **review-time** responsibility: no build check
catches a component left reading a value that vanished. **Land the component
change first, the `config.yaml` change second.**

## Evolution

The contract surface is **the identity, the `environment-type`, and the
configuration keys provided**.

- Legal at `version: N+1` — add a region, add a host entry, widen a replica
  range, add a config key, clarify prose or scaling notes.
- ILLEGAL in place — repurposing the name (`staging` becoming the real
  production target), or changing `environment-type` to a class with different
  guarantees. Both are swaps: create the successor, add `supersedes`, repoint the
  components' `uses` edges one at a time, then deprecate the old environment.
- Removing a config key or a host entry is a **reduction** and is legal only once
  nothing depends on it. The warnings catch only the environment-side half.

## Validation and error classes

| #     | Rule                                                                          | Class                                  |
|-------|-------------------------------------------------------------------------------|----------------------------------------|
| ENV1  | `environment/` bucket is a direct child of a solution directory.              | `E_SRN_PLACEMENT`                      |
| ENV2  | `environment-type` present and in the closed enum.                            | `E_FM_SCHEMA`                          |
| ENV3  | `environment-type` appears only on `kind: environment`.                       | `E_FM_UNKNOWN_FIELD`                   |
| ENV4  | `topology.yaml` parses and matches its schema (incl. `min ≤ max`, `x-` rule). | `E_ENV_TOPOLOGY_SCHEMA`                |
| ENV5  | `config.yaml` parses and matches its schema (casing, uniqueness, `source`).   | `E_ENV_CONFIG_SCHEMA`                  |
| ENV6  | Every SRN in either artifact resolves to a `component` or `product`.          | `E_ENV_TARGET_KIND`                    |
| ENV7  | Every host `regions` name is declared in the file's `regions` list.           | `E_ENV_REGION_UNKNOWN`                 |
| ENV8  | No `secret: true` entry carries a `value`.                                    | `E_ENV_SECRET_VALUE`                   |
| ENV9  | Every host entry names a component that declares this environment.            | `W_ENV_HOST_UNDECLARED`                |
| ENV10 | Every `for:` target declares this environment.                                | `W_ENV_CONFIG_ORPHAN`                  |
| ENV11 | No `component:` or `for:` reference carries an artifact suffix.               | `E_SRN_ARTIFACT` / `E_ENV_TARGET_KIND` |

ENV1–ENV8 and ENV11 are checkable from the entity alone; ENV9–ENV10 need the
resolved catalog. Common SRN rules apply to both artifacts unchanged — an
unknown role, or a suffix on a kind with no roles, is `E_SRN_ARTIFACT` before
ENV11 is ever reached.

---

# `actor`

A source or sink of intent whose internals the catalog **deliberately does not
describe**. Actors are the outer edge of the described universe. Solution-level
only (`solutions/acme/actor/customer/`); a lower `actor/` bucket is
`E_SRN_PLACEMENT` by grammar. Actors are excluded from a protocol's NCA
computation precisely because they are solution-level.

## The boundary test — actor or component?

Apply in order; the first `yes` wins:

| # | Question                                                                          | If yes                                          |
|---|------------------------------------------------------------------------------------|--------------------------------------------------|
| 1 | Does it originate requests or receive outcomes?                                   | Continue. If **no**, it is not an actor at all.  |
| 2 | Do we own and describe its internals in *this* solution?                          | It is a **component**.                           |
| 3 | Must anything name it in a `uses`, `exposes`, `depends-on`, or `implements` edge? | It is an **`external` component**.                |
| 4 | Otherwise                                                                          | **Actor**.                                       |

Question 3 is the mechanical part and settles the case that competes most often.
**An actor is not a legal target of those four edges** — so the moment a
component must declare `depends-on` or `uses` toward a third party, that third
party has to be an `external` component or the edge is unwriteable. Protocol
participant lists, by contrast, accept components, products **and** actors, so a
counterpart that only ever appears in a conversation needs no edge and is an
`external-system` actor. Describe each real system **once, one way**: modelling
it as both a component and an actor produces two nodes for one thing, and the
portal cannot tell that `psp` and `psp-acquirer` are the same company.

## Fields

| Field        | Type                                                    | Required | Rule                                    |
|--------------|---------------------------------------------------------|----------|------------------------------------------|
| `actor-type` | `human \| system \| external-system \| service-account` | yes      | Closed enum.                             |
| `goals`      | list of one-line strings, ≥ 1, each ≤ 200 chars         | yes      | What this actor wants, in its own terms. |

Decide `actor-type` by these tests in order:

```text
1. Is the intent a person's?                                     yes -> human
2. Is it an identity something else assumes, not a runtime?      yes -> service-account
3. Is the runtime outside our ownership boundary?                yes -> external-system
4. Otherwise (our machine, not modelled as a component)                 system
```

The enum answers the one question a reviewer needs before any prose: **what
trust and control do we have over this counterpart?** `human` needs UX and
consent; `system` we can change; `external-system` we can only negotiate with;
`service-account` we can revoke. `service-account` is not a flavour of `system`
— it is the only actor type with no goals of its own (it borrows them from a
principal), and keeping it separate is what makes
`grep -rl 'actor-type: service-account' solutions/` an exact credential
inventory. Rejected values: `role`/`group` (an actor already *is* a role),
`organization` (organizations do not send messages; their systems do),
`device`/`iot-sensor` (a runtime — `system` or `external-system`, with
distribution in an environment's topology), `internal`/`partner`/`public`
(audience facets — use `tags`).

**Goals** are the actor's objectives in the actor's language, one sentence each,
verb-first. They are the review anchor: a goal no protocol or requirement serves
is a hole, and a protocol serving no stated goal is unmotivated. Traceability is
a review practice, not a build check.

```yaml
# good — the actor's outcome
goals:
  - Pay for a basket without re-entering card details.

# poor — our implementation, in our language
goals:
  - Call POST /payments with a tokenized card.
```

For a `service-account`, state the delegated capability **and** the principal:
"Apply approved schema migrations to an environment on behalf of team-platform."

## Relations, artifacts, warnings

`uses` is legal and useful toward a **component** (the surface the actor
touches) and toward an **environment** (where a service account holds
credentials); `supersedes` toward another actor. `exposes`, `depends-on` and
`implements` are unavailable — their legal source kinds are component/product.

**Do not author `uses` toward a protocol from an actor** — participation is
authored once, on the protocol side (`protocols.md`), and duplicating it here
creates two lists that drift: `W_ACTOR_PARTICIPATION_EDGE`.

**The actor kind defines no sibling artifacts.** Its name is its identity, its
type is one enum value, and everything else is prose only a human reads; the
structured facts *about* actors live where they are used — participation in
protocol artifacts, credentials in an environment's config surface, obligations
in requirements.

An actor named in no protocol's `participants` and no workflow step is
`W_ACTOR_ORPHAN` — legal (a newly described actor precedes its protocols), but
usually a leftover from a swap.

Evolution: the contract surface is **the identity and the `actor-type`**.
Repurposing the name, or flipping `actor-type` because the counterpart changed
nature (an in-house `system` that was outsourced is a *different* counterpart),
is a swap. Removing a goal is a reduction — strike it through in prose or move
it to a "no longer served" note, never delete it silently.

---

# `adr`

One decision, with the context that forced it, the consequences it buys, and the
alternatives it rejected. Written once and **never rewritten**: decisions are
superseded, never edited into their opposite, never deleted. The ADR bucket is
the only append-only, chronological record in the framework — and the only place
that records *why* the solution is this and not something else.

Owner-scoped: `adr/` may sit under a solution, a product, or a component. Choose
the container the decision **binds**, not the one that implemented it first; a
decision constraining two sibling components belongs in their nearest common
ancestor's bucket. That is a SHOULD, not a build check — an ADR has no
participant list from which an NCA could be computed.

Directory names SHOULD be a zero-padded four-digit ordinal plus a slug
(`0001-event-sourcing`). Ordinals are **per bucket**, never reused even after a
rejection or supersession; a duplicate inside one bucket is `W_ADR_ORDINAL`.

## Fields

| Field             | Type                                             | Required    | Rule                                                        |
|-------------------|--------------------------------------------------|-------------|--------------------------------------------------------------|
| `decision-status` | `proposed \| accepted \| rejected \| superseded` | yes         | The decision's standing. Closed enum.                        |
| `date`            | ISO-8601 calendar date `YYYY-MM-DD`              | yes         | When it reached its current standing (`E_ADR_DATE`). Quote it. |
| `deciders`        | list of strings                                  | conditional | Non-empty once the decision was actually taken (`E_ADR_DECIDERS`). |

`date` carries no time and no timezone: `2026-03-11T09:00:00Z` is `E_ADR_DATE`.
The spec says `deciders` is required for `accepted` and `rejected`; the portal
schema also requires it for `superseded`, so write it there too. `deciders` are
who **made the call** — `owner` is who maintains the record today, and two years
later they are frequently different people.

## Two status fields, and why

| Field             | Answers                                               | Values                                           |
|-------------------|-------------------------------------------------------|--------------------------------------------------|
| `status` (common) | *Is this document written and reviewed?*              | `draft`, `review`, `approved`, `deprecated`      |
| `decision-status` | *Where does this decision stand in the architecture?* | `proposed`, `accepted`, `rejected`, `superseded` |

They are orthogonal, and two states prove it: an **approved record of a rejected
decision** (`status: approved` + `decision-status: rejected`) is one of the most
valuable records a catalog holds — it stops the same proposal returning every six
months — and a **superseded decision that is still a good document**
(`approved` + `superseded`) is the normal end state of any ADR that was
replaced.

Folding them would actively break the framework: if supersession were expressed
as `status: deprecated`, every reference to a superseded ADR — and referencing
old decisions is the *normal, correct* use of an archive — would raise
`W_REF_DEPRECATED`. Deprecation means "stop pointing here"; superseded means
"this is history, and history is the point". `status: deprecated` on an ADR is
reserved for a record retracted **as a document** (filed against the wrong
scope, duplicating another ADR).

The portal badges `decision-status` on the page header and every ADR list, sorts
those lists by `date`, and filters them by `decision-status` — never by `status`.

## Body, supersession, evolution

The four level-2 headings are REQUIRED with exact text and casing
(`E_ADR_SECTIONS`, see `structure.md`); order is not enforced and extra sections
may follow. What each owes the reader:

- **Context** — the forces: constraints, deadlines, existing commitments. What
  was true when the decision was needed, never justification.
- **Decision** — one paragraph, active voice, stated as fact ("We use X"). This
  paragraph **is** the ADR's contract surface.
- **Consequences** — what follows, good and bad. The bad ones are mandatory: an
  ADR with only positive consequences has not been reviewed.
- **Alternatives considered** — each rejected option and the specific reason it
  lost. "Not considered" is an acceptable, honest entry when true.

Supersession is the general swap specialised: write the successor with its own
ordinal, `version: 1`, `decision-status: proposed`, and a `supersedes` edge to
the predecessor; when it is accepted, set its `decision-status` and `date`, and
set the predecessor to `superseded` with the same date, **bumping the
predecessor's `version`**. Never delete, never edit the predecessor's
`## Decision` — its text is a true statement about what was decided then.
`superseded-by` is derived. Chains are ordinary. Both halves of a broken chain
are `W_ADR_SUPERSESSION`.

**Moving `decision-status` MUST bump `version`**, and `date` moves with it. This
is the one visible divergence from the common rule: `evolution.md` exempts a
change to `status` alone, because `status` is workflow state — `decision-status`
is a fact about the architecture and is versioned like any other fact.

---

# `requirement`

One statement of something that must be true, paired with the criteria by which
anyone can tell whether it is. **One requirement, one statement** — a document
listing twelve things is twelve requirements. It is not an issue tracker (no
assignee, no estimate, no sprint) and not a specification of behaviour (that is
protocol and datamodel).

Owner-scoped like ADRs, in the bucket of the container that **owns the
obligation** — usually, but not always, the one that implements it. A
solution-wide obligation implemented by three components belongs at solution
level with three `implements` edges pointing up at it. Names are short kebab-case
slugs with **no ordinal prefix**: requirements are not chronological, and an
ordinal would only invite renumbering.

## Fields

| Field              | Type                              | Required | Rule                                       |
|--------------------|-----------------------------------|----------|---------------------------------------------|
| `requirement-type` | `functional \| non-functional`    | yes      | Closed enum.                                |
| `priority`         | `must \| should \| could \| wont` | yes      | MoSCoW, **no apostrophe** — `won't` is `E_FM_SCHEMA`. |

The type split is binary because it is the only distinction that changes how the
requirement is **verified** and where it is **satisfied**: a functional one is
satisfied by a component's behaviour and demonstrable through a protocol
interaction; a non-functional one is satisfied by an operational property and
demonstrable only against a specific environment — which is why a non-functional
requirement usually carries `uses: /environment/…`, and why it then appears on
that environment's page as an objective it must meet. Everything finer —
performance, security, availability, accessibility, compliance — is a *category*
and belongs in `tags`.

`wont` means **explicitly out of scope for the current planning window** — a
recorded non-goal, not a deleted requirement. It is what makes the kind
additive-only in practice: a requirement that falls out of scope is **demoted,
never deleted**, so the same request next quarter meets a recorded answer instead
of a blank catalog. Priority is expected to change; changing it bumps `version`
and is not a narrowing, because priority describes the owner's intent, not the
obligation.

## Acceptance criteria

**A prose section under a required heading, not frontmatter data.** All
violations are `E_REQ_CRITERIA`:

| Rule                                                                                   | Violation                                          |
|----------------------------------------------------------------------------------------|-----------------------------------------------------|
| `## Acceptance criteria` appears **exactly once**, level 2, this exact casing.         | `## Acceptance Criteria`, `### Acceptance criteria` |
| Its content **begins with a markdown unordered list** (`-`), before any other heading. | A paragraph where the list should be                |
| The list has **at least one** top-level item.                                          | An empty section                                    |
| Task-list syntax is **not** used.                                                      | `- [ ] A capture repeated with the same key…`       |
| Each item's **first line** is one criterion, ≤ 200 characters.                         | A 600-character paragraph as one bullet             |

Nested content under an item is free and preserved as that criterion's detail —
Given/When/Then, a table, a code block. A bold anchor (`- **AC-1** …`) becomes
the criterion's stable link target instead of its position.

```markdown
## Acceptance criteria

- **AC-1** A capture repeated with the same idempotency key charges the card once.
  - **Given** a capture for order `o-1` with key `k-1` that reached the gateway
  - **When** the same request is replayed within the retention window
  - **Then** no second authorization reaches the gateway
- **AC-2** A replay returns the original capture result, byte-identical.
```

**Checkboxes are forbidden deliberately: completion is not catalog data.** The
catalog describes obligations, not progress; whether an obligation is claimed is
expressed by the `implements` edges pointing at it, which the portal derives and
which cannot drift the way a hand-ticked box does. The portal renders the
criteria *as* a checklist — the checkbox is a rendering, never a source.

Why prose and not frontmatter or a sibling artifact: review is git-native and a
markdown list produces a clean, commentable diff where a nested YAML block
scalar produces a re-indentation diff nobody can read; every other frontmatter
field is a scalar or a list of short tokens; and a pinned heading plus a pinned
list shape is already a parse target, so nothing machine-readable is lost.

## Satisfaction and the v1 limits

Satisfaction is authored **on the component side only**:

```yaml
# solutions/acme/product/shop/component/checkout/index.md
relations:
  implements:
    - requirement/idem-cap          # this component's own bucket
    - /requirement/gdpr-erasure     # a solution-level obligation
```

The requirement never authors `implemented-by` — it is derived (`E_FM_SCHEMA` if
written). Two catalog-level checks fall out of the graph:

- `W_REQ_UNIMPLEMENTED` — a `priority: must` with no incoming `implements`. A
  warning, not an error: a `must` written before anything implements it is the
  normal order of work. It is the number the solution dashboard leads with.
- `W_REQ_WONT_IMPLEMENTED` — a `priority: wont` that something claims to
  implement. Either the priority is stale or the edge is wrong.

From a requirement, `uses` is legal toward a datamodel, protocol, environment or
component, and `supersedes` toward another requirement. **v1 has no
requirement→requirement decomposition edge**: `uses` does not accept a
requirement target and `depends-on` is component/product only, so a parent/child
tree cannot be expressed. Write one requirement per statement, group with `tags`,
link in prose.

Evolution: the contract surface is **the statement, the criteria, and
`requirement-type`**; `priority`, `tags`, `status` and relations are metadata
(they still bump `version`). Removing or weakening a criterion, or reversing the
statement, is a swap. **Adding** a criterion is additive but can invalidate
existing `implements` claims — the implementers were not asked — so an added
criterion on an `approved` requirement SHOULD reset `status: review` and be
raised with everyone listed under `implemented-by`. If it changes what the
requirement *means* rather than sharpening it, it is a new requirement.

---

## Error classes introduced by these four kinds

| Code                         | Meaning                                                                                    |
|------------------------------|---------------------------------------------------------------------------------------------|
| `E_ENV_TOPOLOGY_SCHEMA`      | `topology.yaml` fails its schema (shape, types, `min > max`, unknown non-`x-` key).        |
| `E_ENV_CONFIG_SCHEMA`        | `config.yaml` fails its schema (casing, duplicate `(key, for)`, secret without `source`).  |
| `E_ENV_TARGET_KIND`          | An SRN in either environment artifact resolves to something other than component/product.  |
| `E_ENV_REGION_UNKNOWN`       | A host entry names a region not declared in the file's `regions` list.                     |
| `E_ENV_SECRET_VALUE`         | A config entry marked `secret: true` carries a literal `value`.                            |
| `W_ENV_HOST_UNDECLARED`      | Host entry for a component that does not declare this environment.                         |
| `W_ENV_CONFIG_ORPHAN`        | Config entry scoped `for:` a component that does not run in this environment.              |
| `E_COMP_LIBRARY_ENVIRONMENT` | A `library` component declares an environment via `uses`.                                  |
| `W_COMP_NO_ENVIRONMENT`      | A runtime-bearing component declares no environment.                                       |
| `W_ACTOR_PARTICIPATION_EDGE` | Actor authors a `uses` edge to a protocol.                                                 |
| `W_ACTOR_ORPHAN`             | Actor appears in no protocol participant list and no workflow step.                        |
| `E_ADR_DATE`                 | `date` missing, or not a bare `YYYY-MM-DD` calendar date.                                  |
| `E_ADR_DECIDERS`             | A taken decision with an absent or empty `deciders` list.                                  |
| `E_ADR_SECTIONS`             | A canonical body section missing, at the wrong level, or spelled differently.              |
| `W_ADR_SUPERSESSION`         | `superseded` with no superseding ADR, or a `supersedes` target not marked `superseded`.    |
| `W_ADR_ORDINAL`              | Two ADRs in one bucket share an ordinal prefix.                                            |
| `E_REQ_CRITERIA`             | The `## Acceptance criteria` section is missing, duplicated, mis-levelled, not opened by a list, empty, or uses checkboxes. |
| `W_REQ_UNIMPLEMENTED`        | A `priority: must` requirement that no component `implements`.                             |
| `W_REQ_WONT_IMPLEMENTED`     | A `priority: wont` requirement that some component claims to implement.                    |

Placement, frontmatter shape and reference errors reuse the common classes:
`E_SRN_PLACEMENT`, `E_SRN_DANGLING`, `E_SRN_CROSS_SOLUTION` (`srn.md`),
`E_FM_SCHEMA`, `E_FM_UNKNOWN_FIELD`, `E_FM_EDGE_TARGET` (`frontmatter.md`).
