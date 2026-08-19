---
kind: spec
name: component
version: 1
status: review
title: Kind — component
summary: The component kind — the nestable container below product level, its component-type enum, how it declares environments, and how reuse within a solution is expressed by reference.
---

# Kind — component

A **component** is any container below product level: the parts a product is
built from, nesting arbitrarily deep. A sub-component is just a component whose
parent is a component — there is no separate kind.

Shared container rules **C1–C7** are defined in [solution.md](solution.md) and
bind components unchanged. Ownership sits at the product line
([product.md](product.md)).

## Role in the hierarchy

```text
solutions/acme/shop/                     # product
└── checkout/                            # component      srn://acme/shop/checkout
    ├── index.md
    ├── payment/                         # sub-component  srn://acme/shop/checkout/payment
    │   └── index.md
    ├── datamodel/cart/                  # component-owned datamodel
    └── requirement/idem-cap/
```

- Every component has a product ancestor. `kind: component` directly under a
  solution is `E_FM_KIND_LOCATION` (that position is a product).
- Nesting is a **composition** statement: `payment` is part of `checkout`. It is
  not a dependency statement — dependencies are edges, and they may point
  anywhere in the solution.
- A component MAY own `datamodel/`, `protocol/`, `adr/`, and `requirement/`
  buckets; never `actor/` or `environment/` (`E_STRUCT_KIND_PLACEMENT`).

## Frontmatter additions

On top of [frontmatter.md](../frontmatter.md); nothing there is redefined. One
field.

| Field            | Type                                                                              | Required | Rule                                  |
| ---------------- | --------------------------------------------------------------------------------- | -------- | -------------------------------------- |
| `component-type` | enum: `service \| library \| ui \| job \| datastore \| gateway \| external`        | yes      | The component's character; drives derived diagrams and rules T1–T3. |

### The `component-type` set

| Value       | Means                                                                              | Example                          |
| ----------- | ---------------------------------------------------------------------------------- | -------------------------------- |
| `service`   | Independently deployed process with an inbound surface it exposes.                 | checkout API                     |
| `library`   | Build-time artifact with no runtime of its own; it runs inside its consumers.      | shared money/tax package         |
| `ui`        | Human-facing client — web, mobile, desktop, CLI.                                   | storefront web app               |
| `job`       | Scheduled or event-triggered worker with no inbound surface.                       | nightly settlement reconciler    |
| `datastore` | Holder of persistent state, addressed as infrastructure.                           | orders Postgres, events topic    |
| `gateway`   | Edge component that fronts, routes, or adapts others rather than owning behaviour. | API gateway, BFF, egress proxy   |
| `external`  | A system this solution does not own, described locally so edges can point at it.   | payment processor, carrier API   |

Why a **closed** set of seven: the type is not documentation, it is an input.
The portal shapes graph nodes by it, and rules T1–T3 below depend on it — so an
open vocabulary would immediately produce nodes no rule can check. The axes the
set covers are exactly the ones the portal must distinguish: has a runtime
(`service`, `ui`, `job`, `datastore`, `gateway`) vs. has none (`library`); owns
behaviour (`service`, `ui`, `job`) vs. fronts it (`gateway`) vs. holds state
(`datastore`); ours (all others) vs. not ours (`external`). Nothing finer
changes how the catalog validates or draws.

If no value fits, pick the nearest and record the nuance in an `x-` field —
never invent an eighth value (`E_FM_SCHEMA`, C6). Extending the set is an
additive spec change to this document.

```yaml
component-type: service
x-runtime: kotlin-jvm       # tolerated nuance

component-type: worker      # E_FM_SCHEMA — not in the enum ("job" is meant)
```

`external` is how a dependency on another solution's system is modelled: the
solution boundary forbids referencing it directly
([solution.md](solution.md)), so it is described here, at the fidelity this
solution needs.

## Declaring environments

A component declares where it runs with the **existing** `uses` edge pointing at
solution-level environment entities. `uses` already accepts `environment`
targets ([frontmatter.md](../frontmatter.md)), so a kind-specific
`environments:` field would duplicate a common field — forbidden. The kind
contract adds the *reading*, not a field:

> A `uses` edge from a component to an `environment` entity means **"this
> component runs in that environment"**.

The portal partitions a component's `uses` list by resolved target kind:
environments are rendered as deployment chips, protocols and datamodels as
consumed contracts.

```yaml
relations:
  uses:
    - /environment/production      # runs here
    - /environment/staging         # and here
    - /datamodel/money@1           # consumed contract — same edge, different kind
```

Rules:

| #  | Rule                                                                                              | Class                      |
| -- | -------------------------------------------------------------------------------------------------- | -------------------------- |
| T1 | A `library` MUST NOT declare an environment — it has no runtime of its own.                        | `E_COMP_LIBRARY_ENVIRONMENT` |
| T2 | A `service`, `ui`, `job`, `datastore`, or `gateway` SHOULD declare at least one environment.        | `W_COMP_NO_ENVIRONMENT`    |
| T3 | An `external` component MUST NOT contain child component entities — we do not describe its insides.| `E_COMP_EXTERNAL_CHILD`    |

```yaml
# solutions/acme/shop/money-kit/index.md
component-type: library
relations:
  uses:
    - /environment/production      # E_COMP_LIBRARY_ENVIRONMENT
```

An `external` component MAY declare environments — that is how a sandbox
endpoint is distinguished from a live one:

```yaml
# solutions/acme/shop/checkout/psp/index.md
component-type: external
relations:
  uses:
    - /environment/production      # legal: the live endpoint this env talks to
    - /environment/staging         # legal: the sandbox endpoint
```

## Reuse within a solution

A component is owned by exactly one product and sits at exactly one path (C5).
When another product or component needs it, that need is **authored once, on the
reusing side, as a `depends-on` edge**:

| Side          | Authored                                       | Derived                                     |
| ------------- | ---------------------------------------------- | -------------------------------------------- |
| reusing       | `relations.depends-on: [<srn of the reused>]`  | —                                            |
| owning/reused | nothing                                        | `depended-on-by` (inverse, [frontmatter.md](../frontmatter.md)) |

```yaml
# solutions/acme/shop/checkout/index.md — the reusing side
relations:
  depends-on:
    - /billing/ledger        # component owned by the billing product
```

`depends-on` (not `uses`) is the reuse edge: it is the structural statement *"I
require this component to exist and function"*, and its legal targets are
exactly components and products. `uses` stays for consumed **surfaces** — the
protocol or datamodel actually spoken. When both are true, author both; they say
different things:

```yaml
relations:
  depends-on:
    - /billing/ledger                    # I need this component
  uses:
    - /protocol/ledger-postings          # ...and I speak this contract of it
```

A bare `uses: [<component>]` is legal but under-specified — it SHOULD be
refined into a `uses` edge on the protocol or datamodel once that surface is
described.

### What each side shows

```text
  solutions/acme/shop/checkout/            solutions/acme/billing/ledger/
  +-------------------------+            +-------------------------+
  | kind: component         |            | kind: component         |
  | component-type: service |            | component-type: service |
  | owner: team-checkout    |  authored  | owner: team-billing     |
  | relations:              | ---------> |                         |
  |   depends-on:           |   reuse    | (nothing is authored    |
  |     - /billing/ledger   |    edge    |  here about the reuse)  |
  +-------------------------+            +-------------------------+
               |                                      |
               v                                      v
  portal: "Depends on ledger             portal: "Reused by checkout
  (product billing)"                     (product shop)" - derived
                                         depended-on-by
```

The reusing page marks the target as **off-tree** (a different product's
subtree) and names the owning product and `owner`. The owned page lists every
inbound reuser; when the derived `depended-on-by` set spans more than one
product, the portal badges the component **shared** and surfaces it on the
solution dashboard ([solution.md](solution.md)).

### Why not place the component under two parents

Physical multi-placement — a copy, a symlink, or a second directory — is
forbidden (`E_COMP_SYMLINK` for the detectable case), for four reasons:

1. **The SRN is the path.** Two paths would be two SRNs for one thing, breaking
   the 1:1 mapping [srn.md](../srn.md) is built on; every reference would have
   to choose, and `grep` would stop answering "who points at this?".
2. **History is per path.** The version→commit index walks one `index.md`'s git
   log ([evolution.md](../evolution.md)). A second copy forks history: two
   version counters, two `@N` resolutions, no merge.
3. **Ownership is single by design.** The product line *is* the ownership line
   ([product.md](product.md)). Two parents means two owners and no reviewer.
4. **Reference already carries everything placement would.** The reusing page
   shows the dependency, the owned page shows the reusers, the graph shows the
   edge — with one file to change when the relationship ends.

```text
solutions/acme/shop/ledger -> ../billing/ledger         # E_COMP_SYMLINK
```

Dependency cycles among components are legal but flagged `W_COMP_DEP_CYCLE`, so
they are a deliberate choice rather than an accident.

## What may nest inside

| Child                                                     | Allowed | Note                                                     |
| --------------------------------------------------------- | ------- | --------------------------------------------------------- |
| sub-component directories                                  | yes     | Arbitrary depth; unless `component-type: external` (T3).  |
| `datamodel/`, `protocol/`, `adr/`, `requirement/` buckets   | yes     | Protocol only if this component is the NCA of its participants. |
| `actor/`, `environment/` buckets                            | no      | Solution-level only — `E_STRUCT_KIND_PLACEMENT`.          |
| a product                                                   | no      | Products are direct children of solutions only.           |

## Validation rules

Numbered `CV*` to avoid collision with the container rules C1–C7
([solution.md](solution.md)), which also bind here.

| #   | Rule                                                                     | Error class                  |
| --- | ------------------------------------------------------------------------- | ---------------------------- |
| CV1 | Component has a product ancestor (never directly under a solution).       | `E_FM_KIND_LOCATION`         |
| CV2 | `component-type` present and in the closed enum.                          | `E_FM_SCHEMA`                |
| CV3 | T1 — `library` declares no environment.                                   | `E_COMP_LIBRARY_ENVIRONMENT` |
| CV4 | T3 — `external` has no child component entities.                          | `E_COMP_EXTERNAL_CHILD`      |
| CV5 | Component directory is a real directory, not a symlink.                   | `E_COMP_SYMLINK`             |
| CV6 | T2 — runtime-bearing component declares ≥ 1 environment.                  | `W_COMP_NO_ENVIRONMENT`      |
| CV7 | `depends-on` graph among components is acyclic.                           | `W_COMP_DEP_CYCLE`           |

## Worked example

`solutions/acme/shop/checkout/index.md`:

```yaml
---
name: checkout
kind: component
version: 7
title: Checkout
summary: Converts a cart into a paid order — pricing, reservation, and payment orchestration.
status: approved
owner: team-checkout
component-type: service
relations:
  uses:
    - /environment/production          # runs here
    - /environment/staging             # and here
    - /datamodel/money@1               # consumed contract
    - /protocol/ledger-postings        # solution-level: NCA of shop + billing
  exposes:
    - ../protocol/order-events         # product-level protocol, NCA of participants
  depends-on:
    - ../inventory                     # sibling component, same product
    - /billing/ledger                  # reuse: component owned by product billing
  implements:
    - requirement/idem-cap             # this component's own requirement
tags:
  - checkout
  - payments
---

# Checkout

Owns the cart-to-order transition. Reserves stock through
[inventory](srn://acme/shop/inventory), takes payment through its
[payment](srn://acme/shop/checkout/payment) sub-component, and emits
[order-events](srn://acme/shop/protocol/order-events) once the order is paid.

## Reuse

Ledger postings come from [ledger](srn://acme/billing/ledger), owned by
`team-billing`. Checkout depends on it by reference; the component stays in the
billing product's subtree and is never copied here.

## Sub-components

- [payment](srn://acme/shop/checkout/payment) — PSP orchestration and the
  external processor it talks to.
```

## What the portal derives

- **Node shape and colour** from `component-type` in every graph; `external`
  nodes are drawn at the boundary, `library` nodes without a runtime lane.
- **Deployment chips** — the environment subset of `uses`, and the reverse
  ("components running here") on each environment page.
- **Contract panels** — `exposes` (provided) and the protocol/datamodel subset
  of `uses` (consumed), split by resolved target kind.
- **Reuse panel** — outgoing `depends-on` with off-tree markers and owning
  product, plus derived `depended-on-by` and the **shared** badge.
- **Composition tree** — sub-components from the filesystem (C1), with a
  breadcrumb up to product and solution.
- **Protocol participation** — the component's own `exposes`/`uses` edges are
  the authoritative half (they carry the direction), joined with the alias and
  `role` the protocol's `participants` list gives this component
  ([protocol.md](protocol.md)). The alias half is never authored here; a
  mismatch between the two halves is `W_PROTO_PARTICIPANT_UNLINKED` /
  `W_PROTO_PARTICIPANT_MISSING`.

## Component error classes

| Code                         | Meaning                                                             |
| ---------------------------- | -------------------------------------------------------------------- |
| `E_COMP_LIBRARY_ENVIRONMENT` | A `library` component declares an environment via `uses`.            |
| `E_COMP_EXTERNAL_CHILD`      | An `external` component contains child component entities.           |
| `E_COMP_SYMLINK`             | A component directory is a symlink — reuse by linking, not by reference. |
| `W_COMP_NO_ENVIRONMENT`      | Runtime-bearing component declares no environment.                   |
| `W_COMP_DEP_CYCLE`           | Cycle in the `depends-on` graph among components.                    |
