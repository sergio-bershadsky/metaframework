---
kind: spec
name: environment
version: 1
status: review
title: Kind — Environment
summary: Contract for environment entities — solution-level placement, the environment-type enum, the topology.yaml and config.yaml artifacts, membership derivation, validation, and derived views.
---

# Kind: environment

An **environment** is a deployment target: a named place where components of
this solution run, with a declared class of guarantees, a placement topology,
and a configuration surface. It is a description of a target, not of a release
— pipelines, versions, and build numbers are not catalog content.

This document adds to the common contract in
[frontmatter.md](../frontmatter.md); it does not restate or relax it.

## Purpose

The environment kind exists to give three otherwise-homeless facts an
address:

1. **Where a component actually runs** — regions, zones, replica ranges — so
   the component graph can be read with deployment reality next to it.
2. **What configuration the target provides** — key names and their origin,
   never secret values — so the config surface is reviewable in git.
3. **What guarantees the target carries** — is real customer data here, is
   there an SLO, is connectivity assumed — so that a reviewer can tell whether
   a `draft` component has any business being declared there.

## Placement

Environments are **solution-level only**. The bucket is `environment/`, a
direct child of the solution directory:

```text
solutions/acme/environment/production/index.md         # legal
solutions/acme/shop/environment/production/index.md    # ILLEGAL — E_STRUCT_KIND_PLACEMENT
```

The rule and its error class are owned by [structure.md](../structure.md). The
rationale: an environment is shared. `production` is one place, and components
from every product land in it; if each product owned its own `production`
entity, the same target would have several SRNs and the config surface would
fragment into per-product copies that immediately disagree. One target, one
entity, one SRN.

Environment **names** are free kebab-case and SHOULD name the place, not its
class: `production`, `staging`, `eu-production`, `store-edge`, `local`. The
class is `environment-type`.

## Frontmatter additions

On top of the common fields ([frontmatter.md](../frontmatter.md)), an entity
with `kind: environment` declares:

| Field              | Type                                            | Required | Rule                                                      |
| ------------------ | ----------------------------------------------- | -------- | --------------------------------------------------------- |
| `environment-type` | `dev \| staging \| production \| edge \| local` | yes      | Closed enum, see below. Any other value is `E_FM_SCHEMA`. |

`environment-type` is normative for `kind: environment` only; using it on any
other kind is `E_FM_UNKNOWN_FIELD`.

```yaml
environment-type: production
```

```yaml
environment-type: prod        # E_FM_SCHEMA — not a member of the enum
environment-type: [staging]   # E_FM_SCHEMA — list, not a scalar
```

### The `environment-type` enum

| Value        | Guarantees the target carries                                                                                             | Typical entity names          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `local`      | A single developer's machine. No shared state, no SLO, no data of record, ephemeral. Anyone may break it at any moment.   | `local`                       |
| `dev`        | Shared and integrated, disposable, synthetic data only. Components may be `draft` here.                                   | `dev`, `integration`          |
| `staging`    | Production-shaped: same topology and same protocol versions, non-production data. The last gate before real users.        | `staging`, `uat`, `perf`      |
| `production` | Real data, real users, real SLOs. Deprecation windows and migration order are binding here.                               | `production`, `eu-production` |
| `edge`       | Production-grade obligations, but geographically or physically distributed and only intermittently connected to the core. | `store-edge`, `vehicle-fleet` |

Why these five, and why the set is closed:

- The enum is not a naming scheme; it is the answer to *"what may a component
  assume about this target?"* Four of the values are rungs on one ladder of
  data reality and blast radius — nobody's machine, everybody's sandbox,
  production's rehearsal, production itself — and the ladder is what gives the
  portal a promotion order without any extra field.
- `edge` is deliberately not on that ladder. It is a **shape**, not a stage:
  an edge target carries production obligations but breaks the assumption every
  other value grants for free — that components can reach the core
  synchronously and see one consistent state. That assumption is a contract
  statement, it changes what a component may be designed to do, and the portal
  must know it *before* it opens `topology.yaml`. Folding `edge` into
  `production` and expressing distribution only in the topology artifact was
  considered and rejected for exactly that reason.
- Rejected values and where they go instead:
  - `qa`, `uat`, `sandbox`, `preview`, `demo` — these are *instances*, not
    classes. Create separate environment entities named after them with
    `environment-type: staging`.
  - `dr`, `failover` — an instance of `production` (it carries real data and
    real obligations); name the entity `dr-eu-west` and type it `production`.
  - `ci` — the pipeline is not a deployment target of this solution's
    components; model the runner as an actor
    (`actor-type: system`, [actor.md](actor.md)).
- An open string would make the promotion badge, the `draft`-in-production
  check, and any type-based filtering undecidable. Adding a sixth value later
  is an ordinary additive spec change ([evolution.md](../evolution.md)).

## Membership: who runs here

**Membership is authored on the component side, never here.** A component
declares the environments it is deployed to; the environment entity does not
maintain a roster.

```yaml
# solutions/acme/shop/checkout/index.md
relations:
  uses:
    - /environment/production      # this component is deployed to production
```

`uses` → `environment` is a legal edge in the common contract
([frontmatter.md](../frontmatter.md)); [component.md](component.md) owns any
further component-side deployment declarations, and where it defines them they
are the authoritative component-side statement. This document defines **no
second membership channel**: `topology.yaml` annotates members with placement
detail, it does not create them.

The reason is the framework's inverse-edge rule: authoring both "checkout runs
in production" and "production hosts checkout" is double bookkeeping that
drifts within a sprint. The portal derives the roster (`used-by` on the
environment) from the forward edges, exactly as it derives every other inverse.

A `topology.yaml` host entry for a component that does not declare this
environment is `W_ENV_HOST_UNDECLARED` — a warning, not an error, on the same
grounds as `W_STRUCT_PROTOCOL_NCA`: during a rollout the topology may
legitimately lead the component's own declaration by a commit or two.

## Sibling artifacts

Two OPTIONAL siblings, both bare kebab-case filenames per
[structure.md](../structure.md):

```text
solutions/acme/environment/production/
├── index.md         # REQUIRED — the entity document
├── topology.yaml    # OPTIONAL — placement and scale of hosted components
└── config.yaml      # OPTIONAL — the configuration surface this target provides
```

Both artifacts are part of the entity's version snapshot: they carry **no
version field of their own**, and any change to either bumps the entity's
frontmatter `version` in the same commit ([evolution.md](../evolution.md)).

In both artifacts, unknown keys — at the top level and inside entries — are
rejected unless prefixed `x-`, mirroring the frontmatter rule.

### `topology.yaml`

```yaml
# solutions/acme/environment/production/topology.yaml
regions:
  - name: eu-west-1
    zones: [a, b, c]
    notes: primary; write-side of the order store lives here
  - name: us-east-1
    zones: [a, b]

hosts:
  - component: /shop/checkout
    regions: [eu-west-1, us-east-1]
    replicas: { min: 3, max: 24 }
    scaling: horizontal on p95 request latency above 200ms
    notes: stateless; sticky sessions disabled
  - component: /shop/checkout/payment
    regions: [eu-west-1]
    replicas: { min: 2, max: 6 }
    scaling: manual
  - component: /shop/inventory
    regions: [eu-west-1]
```

Top-level keys:

| Key       | Type                | Required | Meaning                                                                |
| --------- | ------------------- | -------- | ---------------------------------------------------------------------- |
| `regions` | list of region maps | no       | The regions this environment occupies. Absent = single unnamed region. |
| `hosts`   | list of host maps   | yes      | Placement detail, one entry per hosted component or subtree.           |

Region map:

| Key     | Type                  | Required | Rule                                                             |
| ------- | --------------------- | -------- | ---------------------------------------------------------------- |
| `name`  | kebab-case string     | yes      | Unique within the file; free-form (`eu-west-1`, `store-berlin`). |
| `zones` | list of short strings | no       | Failure domains inside the region (`[a, b, c]`).                 |
| `notes` | string                | no       | Prose; may be multi-line.                                        |

Host map:

| Key         | Type                             | Required | Rule                                                                                                                      |
| ----------- | -------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `component` | SRN reference                    | yes      | MUST resolve to a `component` or `product` entity (`E_ENV_TARGET_KIND`).                                                  |
| `regions`   | list of region names             | no       | Each name MUST be declared in `regions` (`E_ENV_REGION_UNKNOWN`). Absent = placement not recorded (**not** "everywhere"). |
| `replicas`  | map `{ min: int ≥ 0, max: int }` | no       | `min` ≤ `max`. A fixed count is `{ min: n, max: n }`.                                                                     |
| `scaling`   | one-line string ≤ 200 chars      | no       | Human sentence: the trigger, not the YAML of an autoscaler.                                                               |
| `notes`     | string                           | no       | Prose; may be multi-line.                                                                                                 |

**References.** `component` is an ordinary SRN reference ([srn.md](../srn.md)).
Relative references resolve against the artifact's own URI,
`srn://acme/environment/production/topology.yaml`, so solution-absolute form is
strongly preferred here — it is shorter and it survives the environment being
renamed:

```yaml
component: /shop/checkout                     # recommended: solution-absolute
component: srn://acme/shop/checkout           # equivalent, fully absolute
component: ../../shop/checkout                # legal, resolves the same, but noisy
```

**Product shorthand.** A `product` target means "every component beneath it,
with these settings". The most specific entry wins, so a subtree entry plus an
explicit entry for one descendant is an override, not a conflict:

```yaml
hosts:
  - component: /shop                          # every component under the shop product
    regions: [eu-west-1]
    replicas: { min: 2, max: 8 }
  - component: /shop/checkout                 # override for one of them
    regions: [eu-west-1, us-east-1]
    replicas: { min: 3, max: 24 }
```

Counter-examples:

```yaml
hosts:
  - component: /actor/customer                # E_ENV_TARGET_KIND — not a component
    regions: [eu-west-1]
  - component: /shop/inventory
    regions: [ap-south-1]                     # E_ENV_REGION_UNKNOWN — not declared
    replicas: { min: 5, max: 2 }              # E_ENV_TOPOLOGY_SCHEMA — min > max
    tier: gold                                # E_ENV_TOPOLOGY_SCHEMA — unknown key
                                              # (write x-tier: gold to keep it)
```

The format is deliberately minimal — regions, zones, counts, one sentence of
scaling intent. It is a description for a reviewer and an input to the derived
placement view, not an infrastructure manifest. Anything a deployment tool
needs and this cannot express belongs in that tool's repository, referenced
from prose.

### `config.yaml` — the configuration surface

The convention is one sentence long: **an environment declares which
configuration keys it provides, and where their values come from; it never
carries a secret value.**

```yaml
# solutions/acme/environment/production/config.yaml
config:
  - key: LOG_LEVEL
    value: warn
    description: Root log level for every hosted component.
  - key: DATABASE_URL
    for: /shop/checkout
    secret: true
    source: vault:kv/acme/production/checkout#database-url
    description: Primary Postgres DSN for the checkout component.
  - key: FEATURE_INSTANT_REFUNDS
    for: /shop/checkout/payment
    value: "false"
    description: Kill switch for instant refunds.
```

Top-level key `config` — a list of entries, REQUIRED if the file exists:

| Key           | Type                  | Required           | Rule                                                                                      |
| ------------- | --------------------- | ------------------ | ----------------------------------------------------------------------------------------- |
| `key`         | `^[A-Z][A-Z0-9_]*$`   | yes                | Environment-variable casing; unique per `(key, for)` pair.                                |
| `for`         | SRN reference         | no                 | Component or product the key applies to (`E_ENV_TARGET_KIND`). Absent = environment-wide. |
| `secret`      | boolean               | no (default false) | Marks the value as sensitive.                                                             |
| `value`       | string                | no                 | The literal value. FORBIDDEN when `secret: true` (`E_ENV_SECRET_VALUE`).                  |
| `source`      | string                | when `secret`      | A locator for the value — never the value. Free-form but stable.                          |
| `description` | one-line string ≤ 200 | no                 | What the key controls.                                                                    |

Key casing is `SCREAMING_SNAKE_CASE`, not kebab-case, on purpose: config keys
belong to the runtime's namespace, not to the catalog's. Env-var casing is what
an operator will copy-paste, and it makes `grep -r DATABASE_URL solutions/`
unambiguous against SRN segments, which are kebab-case by grammar.

```yaml
- key: database-url                           # E_ENV_CONFIG_SCHEMA — wrong casing
- key: DATABASE_PASSWORD
  secret: true
  value: hunter2                              # E_ENV_SECRET_VALUE — never, at any status
- key: API_TOKEN
  secret: true                                # E_ENV_CONFIG_SCHEMA — secret without source
```

**Relationship to the component side.** A component declares which environments
it runs in — a `uses` edge to the environment, and nothing more
([component.md](component.md)). **v1 has no component-side declaration of
required configuration keys**, so the most valuable check — a component needs a
key no environment provides — is not expressible, and this document does not
invent a component-side field to make it so. Adding one would be an additive
change to [component.md](component.md), not to this file.

What *is* checkable is the other direction: a `for:` entry naming a component
that does not run in this environment is dead configuration, flagged
`W_ENV_CONFIG_ORPHAN`.

```yaml
config:
  - key: WAREHOUSE_API_URL
    for: /shop/inventory      # W_ENV_CONFIG_ORPHAN if inventory has no
                              # `uses: /environment/production` edge
```

Removing a key is therefore a **review-time** responsibility: no build check
will catch a component left reading a value that vanished. Land the component
change first and the `config.yaml` change second.

## Worked example

`solutions/acme/environment/production/index.md`:

```yaml
---
name: production
kind: environment
version: 4
title: Production
summary: Primary customer-facing target for the acme solution, EU-West with a US-East read region.
status: approved
owner: team-platform
environment-type: production
relations:
  uses:
    - /datamodel/money@1
tags:
  - eu
  - regulated
---

# Production

The only target that holds customer data of record. Everything deployed here
is `status: approved` at the version that is running; a component still in
`draft` has no business declaring `uses: /environment/production`.

## Guarantees

- Availability objective 99.9% monthly for the checkout path.
- Data residency: order and payment data stay in `eu-west-1`; `us-east-1`
  serves read-only catalogue traffic.
- Change window: schema migrations run through the
  [release-bot](srn://acme/actor/release-bot) identity only.

## Placement and configuration

Placement is in the sibling `topology.yaml`; the configuration surface is in
`config.yaml`. Which components run here is *not* listed in either — it is
derived from the components' own `uses` edges, and the portal renders that
roster on this page.
```

The two siblings for this entity are the `topology.yaml` and `config.yaml`
shown above.

## Evolution

The environment's contract surface is **its identity, its `environment-type`,
and the configuration keys it provides**. Per
[evolution.md](../evolution.md):

- Legal at `version: N+1` — add a region, add a host entry, widen a replica
  range, add a config key, clarify prose or scaling notes.
- ILLEGAL in place — repurposing the name (`staging` becoming the real
  production target) or changing `environment-type` to a class with different
  guarantees. Both are swaps: create the successor environment, add
  `supersedes`, repoint the components' `uses` edges one at a time, then set
  the old environment to `status: deprecated`.
- Removing a config key or a host entry is a **reduction** of the declared
  surface and is legal only once nothing depends on it.
  `W_ENV_HOST_UNDECLARED` and `W_ENV_CONFIG_ORPHAN` catch the environment-side
  half of that; the component-side half — a component still reading a key that
  vanished — is not machine-checkable in v1 (see above). Land the component
  change first, the environment change second.

## Validation rules

| #     | Rule                                                                                | Class                     |
| ----- | ----------------------------------------------------------------------------------- | ------------------------- |
| ENV1  | `environment/` bucket is a direct child of a solution directory.                    | `E_STRUCT_KIND_PLACEMENT` |
| ENV2  | `environment-type` present and a member of the closed enum.                         | `E_FM_SCHEMA`             |
| ENV3  | `environment-type` appears only on `kind: environment` entities.                    | `E_FM_UNKNOWN_FIELD`      |
| ENV4  | `topology.yaml` parses and matches the schema above (incl. `min ≤ max`, `x-` rule). | `E_ENV_TOPOLOGY_SCHEMA`   |
| ENV5  | `config.yaml` parses and matches the schema above (casing, uniqueness, `source`).   | `E_ENV_CONFIG_SCHEMA`     |
| ENV6  | Every SRN in either artifact resolves to a `component` or `product`.                | `E_ENV_TARGET_KIND`       |
| ENV7  | Every `regions` name in a host entry is declared in the file's `regions` list.      | `E_ENV_REGION_UNKNOWN`    |
| ENV8  | No entry with `secret: true` carries a `value`.                                     | `E_ENV_SECRET_VALUE`      |
| ENV9  | Every host entry names a component that declares this environment.                  | `W_ENV_HOST_UNDECLARED`   |
| ENV10 | Every `for:` target of a config entry declares this environment.                    | `W_ENV_CONFIG_ORPHAN`     |

ENV1–ENV8 are checkable from the entity alone; ENV9–ENV10 need the resolved
catalog. Common SRN rules (syntax, dangling targets, cross-solution sealing)
apply to both artifacts unchanged.

## What the portal derives

- **Environment page** — type badge, guarantees prose, the region/zone table
  from `topology.yaml`, and the masked config surface (secret entries render as
  key + source, never a value).
- **Hosted-components roster** — derived from components' `uses` edges, joined
  with `topology.yaml` entries for regions, replicas, and scaling notes;
  components with no topology entry appear with placement "not recorded".
- **Environment-scoped component graph** — the standard derived component graph
  filtered to the roster, grouped by region.
- **"Deployed in" badges** on every component page — the inverse of the same
  edges, never authored.
- **Promotion ladder** on the solution dashboard — environments ordered
  `local → dev → staging → production`, with `edge` rendered as a parallel
  track rather than a rung.
- **Config surface table** per component — every key that any environment
  provides for it, side by side across environments, secrets masked.

## Environment error classes

| Code                    | Meaning                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `E_ENV_TOPOLOGY_SCHEMA` | `topology.yaml` fails its schema (shape, types, `min > max`, unknown non-`x-` key).                                 |
| `E_ENV_CONFIG_SCHEMA`   | `config.yaml` fails its schema (key casing, duplicate `(key, for)`, secret without `source`, unknown non-`x-` key). |
| `E_ENV_TARGET_KIND`     | An SRN in `topology.yaml` or `config.yaml` resolves to something other than a component or product.                 |
| `E_ENV_REGION_UNKNOWN`  | A host entry names a region not declared in the file's `regions` list.                                              |
| `E_ENV_SECRET_VALUE`    | A config entry marked `secret: true` carries a literal `value`.                                                     |
| `W_ENV_HOST_UNDECLARED` | Host entry for a component that does not declare this environment.                                                  |
| `W_ENV_CONFIG_ORPHAN`   | Config entry scoped `for:` a component that does not run in this environment.                                       |

Placement and frontmatter errors reuse `E_STRUCT_KIND_PLACEMENT`
([structure.md](../structure.md)), `E_FM_SCHEMA` and `E_FM_UNKNOWN_FIELD`
([frontmatter.md](../frontmatter.md)).
