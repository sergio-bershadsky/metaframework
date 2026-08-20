---
kind: spec
name: component
version: 5
status: review
title: Kind — component
summary: The component kind — the nestable container in a component/ bucket under a product or another component, its component-type and lifecycle enums, per-type disciplines, criticality, environments, and reuse by reference.
---

# Kind — component

A **component** lives in a `component/` bucket owned by a product or by another
component: the parts a product is built from, nesting arbitrarily deep. A
sub-component is just a component whose owner is a component — there is no
separate kind, and no separate bucket name.

Shared container rules **C1–C7** are defined in [solution.md](solution.md) and
bind components unchanged. Ownership sits at the product line
([product.md](product.md)).

## Role in the hierarchy

```text
solutions/acme/product/shop/                    # product  srn://acme/product/shop
└── component/                                  # kind bucket
    └── checkout/                               # component
        ├── index.md                            #   srn://acme/product/shop/component/checkout
        ├── component/                          # the same bucket name, one level down
        │   └── payment/                        # sub-component
        │       └── index.md                    #   …/component/checkout/component/payment
        ├── datamodel/
        │   └── cart/                           # component-owned datamodel
        └── requirement/
            └── idem-cap/
```

- Every component has a product ancestor, and the `component/` bucket repeats at
  every level of nesting. Two components deep is two `component/` segments —
  `srn://acme/product/shop/component/checkout/component/payment` — which is
  verbose and deliberately so: the kind is readable at every level, and
  `ls` of any directory shows buckets rather than a mix.
- Nesting is a **composition** statement: `payment` is part of `checkout`. It is
  not a dependency statement — dependencies are edges, and they may point
  anywhere in the solution.
- A component MAY own `datamodel/`, `protocol/`, `adr/`, `requirement/`,
  `metric/`, and further `component/` buckets; never `actor/`, `environment/`,
  `capability/`, `journey/`, or `product/`.

### Placement is grammar, not a loader check

A `component` pair is legal **only after a `product` or `component` pair**. The
parser checks this while reading the path, so every case below fails as
`E_SRN_PLACEMENT` ([srn.md](../srn.md)) before the entity's frontmatter is
opened:

```text
solutions/acme/product/shop/component/checkout/                    # legal
solutions/acme/product/shop/component/checkout/component/payment/  # legal
solutions/acme/component/checkout/                # E_SRN_PLACEMENT — no product
solutions/acme/datamodel/money/component/parser/  # E_SRN_PLACEMENT — a datamodel
                                                  # owns nothing
```

The old rule "a container below product level is a component" was an inference
from depth; there is no inference left. `E_FM_KIND_LOCATION` keeps only the
narrow job of catching a `kind:` that disagrees with the bucket holding it:

```yaml
# solutions/acme/product/shop/component/checkout/index.md
kind: product        # E_FM_KIND_LOCATION — the bucket says component
```

## Frontmatter additions

On top of [frontmatter.md](../frontmatter.md); nothing there is redefined. Three
fields.

| Field            | Type                                                                                                                   | Required | Rule                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `component-type` | enum: `service \| library \| ui \| job \| datastore \| gateway \| external \| content \| application \| specification` | yes      | The component's character; drives derived diagrams, rules T1–T3, and the per-type disciplines below.                                      |
| `lifecycle`      | enum: `planned \| in-development \| released \| sunset \| retired`                                                     | yes      | Delivery state of the component itself. Never the review state of this document — that is `status` ([frontmatter.md](../frontmatter.md)). |
| `criticality`    | integer `1..4`                                                                                                         | no       | Blast radius and review priority, never an SLA ([below](#criticality--review-priority-not-an-sla)). Absent means "not assessed", never 4. |

### The `component-type` set

| Value           | Means                                                                                                                                                                       | Example                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `service`       | Independently deployed process with an inbound surface it exposes.                                                                                                          | checkout API                     |
| `library`       | Build-time artifact with no runtime of its own; it runs inside its consumers.                                                                                               | shared money/tax package         |
| `ui`            | Human-facing client — web, mobile, desktop, CLI.                                                                                                                            | storefront web app               |
| `job`           | Scheduled or event-triggered worker with no inbound surface.                                                                                                                | nightly settlement reconciler    |
| `datastore`     | Holder of persistent state, addressed as infrastructure.                                                                                                                    | orders Postgres, events topic    |
| `gateway`       | Edge component that fronts, routes, or adapts others rather than owning behaviour.                                                                                          | API gateway, BFF, egress proxy   |
| `external`      | A system this solution does not own, described locally so edges can point at it.                                                                                            | payment processor, carrier API   |
| `content`       | A versioned content artifact — instructions, briefings, skills — consumed by being read by a person or a model, shipped into or served from a host runtime it does not own. | a Claude Code plugin's skill set |
| `application`   | A fully-packaged program a user installs and runs as one unit — the shipped distribution, not the surfaces or services inside it.                                           | an npm CLI, a desktop app        |
| `specification` | A set of normative documents whose contract surface is the text itself, consumed by reference and never executed.                                                           | a framework's spec corpus        |

Why a **closed** set of ten: the type is not documentation, it is an input.
The portal shapes graph nodes by it, and rules T1–T3 below depend on it — so an
open vocabulary would immediately produce nodes no rule can check. The axes the
set covers are exactly the ones the portal must distinguish: has a runtime
(`service`, `ui`, `job`, `datastore`, `gateway`) vs. has none (`library`,
`content`, `specification`) vs. runs where its user installs it
(`application`); owns behaviour (`service`, `ui`, `job`) vs. fronts it
(`gateway`) vs. holds state (`datastore`); executed (`library`) vs. read
(`content`, `specification`); ours (all others) vs. not ours (`external`).
Nothing finer changes how the catalog validates or draws.

The set was seven; `content`, `application`, and `specification` were appended
on 2026-08-20 (decision-record amendment 2026-08-20-g). Each names a strain the
catalogs had already recorded in prose against a nearest-fit value — a
distributable content bundle carrying `library`, normative document sets
carrying `library`, an installable CLI with no honest value at all. No existing
value changed meaning; the eleven other Compass component types were examined
and rejected there, each for the same reason — no entity in any shipped catalog
would carry them today.

If no value fits, pick the nearest and record the nuance in an `x-` field —
never invent an eleventh value (`E_FM_SCHEMA`, C6). Extending the set is an
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

### `lifecycle` — the delivery state, and why it is not `status`

`status` (common, every kind) describes **this document**: is the description
drafted, reviewed, approved, or retired as a description. `lifecycle` describes
**the component in the world**: has the thing been built, and is it running.

> `status` is the review state of the DESCRIPTION.
> `lifecycle` is the delivery state of the THING DESCRIBED.

The two axes cross, every cell is legal, and the crossing is the reason both
fields exist. An **approved description of an unbuilt component** is the
design-first normal case this catalog is for:

```yaml
status: approved          # written, reviewed, binding
lifecycle: planned        # not one line of it built yet
```

```yaml
status: draft             # nobody finished writing it down
lifecycle: released       # it has been in production for two years
```

Five stages, closed. Any other value is `E_FM_SCHEMA` (CV9); a team-local nuance
goes in an `x-` field, never in a sixth value.

| `lifecycle`      | Means                                                 | The honest test                                      |
| ---------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| `planned`        | Described and agreed; not being built yet.            | No code exists.                                      |
| `in-development` | Being built; nothing has shipped.                     | Code exists; no consumer can call it for real.       |
| `released`       | Shipped at least once and available to its consumers. | Someone outside the building team depends on it now. |
| `sunset`         | Still running, but being replaced; no new consumers.  | A successor exists and migration is underway.        |
| `retired`        | No longer running anywhere; the description is kept.  | Nothing calls it and nothing deploys it.             |

#### Why the field name is product's and the value set is not

A product also carries `lifecycle` ([product.md](product.md)), with a different
enum: `concept | incubating | active | maintenance | sunset | retired`. The
**name** is shared deliberately — one word for "what stage is the thing in?"
across the two kinds that name a thing built and shipped apart from the document
describing it, so a reader never has to learn a second vocabulary for the same
question. The **values** are not shared, because the two kinds are staged
against different things:

| Axis            | Product                                               | Component                                                |
| --------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| What is staged  | a funded position in a portfolio                      | an artifact that gets built and shipped                  |
| Who moves it    | whoever decides investment                            | whoever ships the code                                   |
| The early half  | `concept` → `incubating` — is this worth funding?     | `planned` → `in-development` → `released` — is it built? |
| The middle      | `active` vs `maintenance` — how much investment flows | *(absent by design — see below)*                         |
| The shared tail | `sunset` → `retired`                                  | `sunset` → `retired`, identical meaning                  |

The one deliberate omission is the `active` / `maintenance` split. It is an
**investment** distinction — how much money keeps flowing — and investment is
decided at the product line ([product.md](product.md)). Copying it down to the
component would create a second, finer-grained investment ledger with no
independent source of truth, and it would drift against the product's within a
quarter. A component in a product on `maintenance` is still simply `released`.

Conversely `released` is not product's `active` renamed. `released` is a fact
about an artifact — it shipped, someone depends on it — and it stays true when
investment stops. `active` is a fact about a budget. Neither answers the other's
question, which is exactly why neither set is reused for the other kind.

Adding a value to either set is an additive spec change to that kind's document
(bump its `version`); the sets are never merged, and a value is never removed.

#### Reading it for the awkward types

- A **`library`** has no runtime of its own (T1), so "running" is the wrong test.
  For a library, `released` means *a version is published and consumers can
  depend on it*; `retired` means *no consumer builds against it any more*.
- An **`external`** component describes a system this solution does not own. Its
  `lifecycle` is that system as *we* see it — normally `released`, and
  `planned` while an integration is only agreed. It is never a claim about the
  vendor's internal roadmap.
- A **`datastore`** follows the same reading as a service: `released` once it
  holds real data anyone reads.
- An **`application`** is staged against its install channel: `released` means a
  version is installable outside this repository — an absolute local path is
  not a channel.
- A **`content`** or **`specification`** component is read, not run, so the
  library reading applies: `released` means a version consumers can read and
  rely on; `retired` means nothing reads or references it any more.

#### Deliberately coarse, and deliberately global

`lifecycle` is one value for the whole component, with no per-environment
dimension. Release state *per environment* already has a home: the component's
`uses` edges to environment entities, and the environment's own `topology.yaml`
([environment.md](environment.md)). A component live in staging and not yet in
production is:

```yaml
component-type: service
lifecycle: in-development         # not shipped to its consumers yet
relations:
  uses:
    - /environment/staging        # …but it does run here
```

and never a value like `released-in-staging`. Folding environments into the enum
would multiply it by the number of environments and make every component's stage
unanswerable without reading the whole environment set.

#### Existing components must add it

`lifecycle` is REQUIRED, so every component entity already in a catalog needs
the field — 67 of them at the time this was written:

```bash
$ grep -rl "^kind: component$" solutions --include=index.md | wc -l
      67
```

Until each has one its frontmatter fails validation with `E_FM_SCHEMA` naming
`lifecycle` — loudly, at load, rather than silently defaulting to a stage nobody
chose. Adding it is an ordinary additive change on each component (add the
field, bump that entity's `version`); there is no back-fill default, because
guessing between `planned` and `released` on someone's behalf is exactly the
error the field exists to prevent. A required field cannot be introduced any
other way: the gentler-looking optional-then-required path is the tightening
additive-only forbids, so it is one loud migration rather than a quiet one
(decision-record amendment 2026-08-20-b).

### `criticality` — review priority, not an SLA

`criticality` is an OPTIONAL integer, `1` (highest) to `4`, with **no default**:
absent means *"not assessed"*, never tier 4. It states **blast radius and
review priority** — how badly the solution degrades if this component fails or
regresses — and nothing else. It is adapted from Compass's tier model, which
answers a question reviewers do ask ("which components could seriously hurt if
they failed?"), but the SLA semantics and the default-to-4 are deliberately not
imported: both shipped catalogs that declare environments state in writing that
no SLO exists, and a default or an SLA reading would stamp an operational
promise nobody made onto every entity. review-solution MAY rank findings by
`criticality` and MAY flag a criticality-1 or -2 component that declares no
requirement and no metric; it MUST NOT flag a missing SLO — declaring one is a
decision this field does not make. A value outside `1..4`, a non-integer, or a
string is `E_FM_SCHEMA`.

```yaml
component-type: service
criticality: 1          # if this fails, the solution stops working
# (no criticality)      # not assessed — never read as tier 4
criticality: "2"        # E_FM_SCHEMA — integer, not a string
criticality: 5          # E_FM_SCHEMA — the scale is closed at 4
```

## Type disciplines

Each `component-type` carries a discipline: what an entity of that type MUST
say, and what review-solution flags when it does not. The disciplines are
normative for authors and for review; the ones backed by a loader rule name its
code, the rest are review checks — a discipline stated here without a code is
enforced by review-solution, not by the loader.

### `service`

Independently deployed process with an inbound surface. MUST expose at least
one protocol, or state in prose why none. SHOULD declare at least one
environment (`W_COMP_NO_ENVIRONMENT`, T2). `depends-on` MUST name every runtime
dependency. review-solution flags: a service nothing calls; a service with no
inbound surface (probably a `job`); a route handler inside another component's
process claiming `service` — record the strain or split honestly.

### `library`

Build-time artifact; runs inside its consumers. MUST NOT declare an environment
(`E_COMP_LIBRARY_ENVIRONMENT`, T1). Exposes no protocol. MUST be depended on by
at least one component. `lifecycle: released` means a version is consumable,
not running. review-solution flags: a library with zero consumers; a library
whose body is normative text or installable content — `specification` or
`content` is meant.

### `ui`

Human-facing surface — web, mobile, desktop, TUI. MUST name the actor or
journey that reaches it, and `depends-on` the components it reads or calls.
SHOULD declare an environment (T2). review-solution flags: a ui no actor or
journey reaches; a ui that owns domain state a service should hold.

### `job`

Scheduled or event-triggered worker. MUST NOT expose a protocol — no inbound
surface is the definition. MUST name its trigger (schedule or event) and its
effect (what it writes or calls), in prose or edges. SHOULD declare an
environment (T2). review-solution flags: a job with an inbound surface (it is a
service); a job whose trigger is unstated.

### `datastore`

Holder of persistent state, addressed as infrastructure. Its datamodels carry
`usage: storage`. MUST hold no business logic — logic in a datastore is a
review flag. Names its engine (`x-runtime` or prose). SHOULD declare an
environment (T2). review-solution flags: a datastore no component depends on;
schemas it holds that no datamodel entity models.

### `gateway`

Edge component that fronts, routes, or adapts. MUST name what it fronts —
`depends-on` to every fronted component. Owns no business behaviour; behaviour
in a gateway is a review flag. Exposes or adapts the protocols at its edge,
named explicitly. SHOULD declare an environment (T2). review-solution flags: a
gateway fronting nothing; domain logic at the edge.

### `external`

A system this solution does not own, described locally so edges can point at
it. MUST NOT contain child components (`E_COMP_EXTERNAL_CHILD`, T3). MUST
document the boundary — the protocol or contract at the seam. Carries no
delivery obligation: no environment expected, no tests expected, `lifecycle`
describes the relationship, not a release. review-solution never flags it for
missing environments or coverage.

### `content`

Versioned content consumed by being read, by a person or a model. MUST name its
host runtime and how the content reaches it — installed, compiled in, or
served. Lists its documents as artifacts on disk, the way a datamodel lists
`schema.json`. MUST state its fidelity story: what keeps the text true of the
system it describes, or the requirement recording that nothing does. Declares
no environment of its own. review-solution flags: content with no named host;
content with no fidelity statement.

### `application`

A fully-packaged installable unit. MUST name its package identity, the source
of truth for its version, and its install/run channel — registry, marketplace,
binary. Contains or `depends-on` the components packaged inside it.
`lifecycle: released` means a version is installable outside this repository —
an absolute local path is not a channel. review-solution flags: an application
with no install path; a version with no single source of truth.

### `specification`

Normative documents; the text is the contract surface. MUST enumerate what it
makes checkable — error codes, schemas, invariants — and what it leaves
unenforced, admitted in writing. Consumed by reference: expects incoming
`depends-on`/`implements` edges, exposes no protocol, declares no environment.
Evolution is additive-only — never narrow a published contract; a narrowing
lands only as a swap ([evolution.md](../evolution.md)). review-solution flags:
a normative claim with neither an implementing check nor a recorded admission;
a spec nothing implements.

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

| #   | Rule                                                                                                | Class                        |
| --- | --------------------------------------------------------------------------------------------------- | ---------------------------- |
| T1  | A `library` MUST NOT declare an environment — it has no runtime of its own.                         | `E_COMP_LIBRARY_ENVIRONMENT` |
| T2  | A `service`, `ui`, `job`, `datastore`, or `gateway` SHOULD declare at least one environment.        | `W_COMP_NO_ENVIRONMENT`      |
| T3  | An `external` component MUST NOT contain child component entities — we do not describe its insides. | `E_COMP_EXTERNAL_CHILD`      |

```yaml
# solutions/acme/product/shop/component/money-kit/index.md
component-type: library
relations:
  uses:
    - /environment/production      # E_COMP_LIBRARY_ENVIRONMENT
```

An `external` component MAY declare environments — that is how a sandbox
endpoint is distinguished from a live one:

```yaml
# solutions/acme/product/shop/component/checkout/component/payment/
#   component/psp/index.md
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

| Side          | Authored                                      | Derived                                                         |
| ------------- | --------------------------------------------- | --------------------------------------------------------------- |
| reusing       | `relations.depends-on: [<srn of the reused>]` | —                                                               |
| owning/reused | nothing                                       | `depended-on-by` (inverse, [frontmatter.md](../frontmatter.md)) |

```yaml
# solutions/acme/product/shop/component/checkout/index.md — the reusing side
relations:
  depends-on:
    - /product/billing/component/ledger   # component owned by billing
```

`depends-on` (not `uses`) is the reuse edge: it is the structural statement *"I
require this component to exist and function"*, and its legal targets are
exactly components and products. `uses` stays for consumed **surfaces** — the
protocol or datamodel actually spoken. When both are true, author both; they say
different things:

```yaml
relations:
  depends-on:
    - /product/billing/component/ledger   # I need this component
  uses:
    - /protocol/ledger-postings           # ...and I speak this contract of it
```

Both are written solution-absolute. A cross-product target is exactly the case
where a `..` chain stops being readable: from `checkout` the same edge is
`../../../billing/component/ledger` — three pops to leave the component bucket,
the product, and the product bucket — and one miscount lands somewhere
grammatical but wrong ([srn.md](../srn.md)).

A bare `uses: [<component>]` is legal but under-specified — it SHOULD be
refined into a `uses` edge on the protocol or datamodel once that surface is
described.

### What each side shows

```text
srn://acme/product/shop/component/checkout      — the reusing side
  +-----------------------------------------+
  | kind: component                         |
  | component-type: service                 |
  | owner: team-checkout                    |
  | relations:                              |
  |   depends-on:                           |
  |     - /product/billing/component/ledger |
  +-----------------------------------------+
                       |
                       |  reuse edge, authored once
                       v
srn://acme/product/billing/component/ledger     — the owned side
  +-----------------------------------------+
  | kind: component                         |
  | component-type: service                 |
  | owner: team-billing                     |
  |                                         |
  | (nothing about the reuse is             |
  |  authored here)                         |
  +-----------------------------------------+

portal, checkout page:  "Depends on ledger — product billing"
portal, ledger page:    "Reused by checkout — product shop", derived from
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
solutions/acme/product/shop/component/ledger            # E_COMP_SYMLINK
  -> ../../billing/component/ledger                     # → product/billing/…
```

Dependency cycles among components are legal but flagged `W_COMP_DEP_CYCLE`, so
they are a deliberate choice rather than an accident.

## What may nest inside

| Child                                                                | Allowed | Note                                                            |
| -------------------------------------------------------------------- | ------- | --------------------------------------------------------------- |
| a `component/` bucket                                                | yes     | Arbitrary depth; unless `component-type: external` (T3).        |
| `datamodel/`, `protocol/`, `adr/`, `requirement/`, `metric/` buckets | yes     | Protocol only if this component is the NCA of its participants. |
| `actor/`, `environment/`, `capability/`, `journey/` buckets          | no      | Solution-level only — `E_SRN_PLACEMENT`.                        |
| a `product/` bucket                                                  | no      | A product pair may only be the first — `E_SRN_PLACEMENT`.       |
| an entity directory not inside a bucket                              | no      | The path would have an odd segment count — `E_SRN_SYNTAX`.      |

## Validation rules

Numbered `CV*` to avoid collision with the container rules C1–C7
([solution.md](solution.md)), which also bind here.

| #    | Rule                                                                      | Error class                  |
| ---- | ------------------------------------------------------------------------- | ---------------------------- |
| CV1  | The `component/` bucket sits inside a product or another component.       | `E_SRN_PLACEMENT`            |
| CV2  | `component-type` present and in the closed enum.                          | `E_FM_SCHEMA`                |
| CV3  | T1 — `library` declares no environment.                                   | `E_COMP_LIBRARY_ENVIRONMENT` |
| CV4  | T3 — `external` has no child component entities.                          | `E_COMP_EXTERNAL_CHILD`      |
| CV5  | Component directory is a real directory, not a symlink.                   | `E_COMP_SYMLINK`             |
| CV6  | T2 — runtime-bearing component declares ≥ 1 environment.                  | `W_COMP_NO_ENVIRONMENT`      |
| CV7  | `depends-on` graph among components is acyclic.                           | `W_COMP_DEP_CYCLE`           |
| CV8  | Frontmatter `kind: component` matches the `component/` bucket holding it. | `E_FM_KIND_LOCATION`         |
| CV9  | `lifecycle` present and in the closed enum.                               | `E_FM_SCHEMA`                |
| CV10 | `criticality`, when present, is an integer in `1..4`.                     | `E_FM_SCHEMA`                |

CV1 is a grammar rule ([srn.md](../srn.md)): the directory path fails to parse,
so a misplaced component never reaches CV2–CV10.

## Worked example

`solutions/acme/product/shop/component/checkout/index.md`:

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
lifecycle: released                    # the thing is shipped; `status` above is
                                       # about this document, not about the thing
relations:
  uses:
    - /environment/production            # runs here
    - /environment/staging               # and here
    - /datamodel/money@1                 # consumed contract
    - /protocol/ledger-postings          # solution-level: NCA of shop + billing
  exposes:
    - /product/shop/protocol/order-events  # product-level, NCA of participants
  depends-on:
    - ../inventory                       # sibling component in the same bucket
    - /product/billing/component/ledger  # reuse: owned by the billing product
  implements:
    - requirement/idem-cap               # this component's own requirement
  realizes:
    - /capability/order-fulfilment       # solution-level: an ability it contributes to
tags:
  - checkout
  - payments
---

Owns the cart-to-order transition. Reserves stock through
[inventory](srn://acme/product/shop/component/inventory), takes payment through
its [payment](srn://acme/product/shop/component/checkout/component/payment)
sub-component, and emits
[order-events](srn://acme/product/shop/protocol/order-events) once the order is
paid.

## Reuse

Ledger postings come from
[ledger](srn://acme/product/billing/component/ledger), owned by `team-billing`.
Checkout depends on it by reference; the component stays in the billing
product's subtree and is never copied here.

## Sub-components

- [payment](srn://acme/product/shop/component/checkout/component/payment) — PSP
  orchestration and the external processor it talks to.
```

Three reference forms appear in that `relations` block, and each is the shortest
one that is also unambiguous:

| Ref                                 | Resolves to                                                       | Why this form                                      |
| ----------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| `requirement/idem-cap`              | `srn://acme/product/shop/component/checkout/requirement/idem-cap` | Own bucket: appended to this entity's path.        |
| `../inventory`                      | `srn://acme/product/shop/component/inventory`                     | Sibling in the same `component/` bucket: one `..`. |
| `/product/billing/component/ledger` | `srn://acme/product/billing/component/ledger`                     | Leaves the subtree; absolute beats counting `..`.  |

## What the portal derives

- **Node shape and colour** from `component-type` in every graph; `external`
  nodes are drawn at the boundary, `library` nodes without a runtime lane.
- **Two independent badges** — `lifecycle` (the thing) and `status` (the
  document), rendered side by side and never collapsed into one. A
  `lifecycle: planned` component is drawn as a real node, not a ghost: it is
  described, agreed, and part of the graph before it is built.
- **Capability panel** — outgoing `realizes` edges; the inverse `realized-by`
  fan-in is shown on the capability's own page
  ([frontmatter.md](../frontmatter.md)).
- **Metrics panel** — the derived `measured-by` set: every metric whose
  `measures` edge points at this component, wherever in the tree that metric is
  owned.
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

| Code                         | Meaning                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ |
| `E_COMP_LIBRARY_ENVIRONMENT` | A `library` component declares an environment via `uses`.                |
| `E_COMP_EXTERNAL_CHILD`      | An `external` component contains child component entities.               |
| `E_COMP_SYMLINK`             | A component directory is a symlink — reuse by linking, not by reference. |
| `W_COMP_NO_ENVIRONMENT`      | Runtime-bearing component declares no environment.                       |
| `W_COMP_DEP_CYCLE`           | Cycle in the `depends-on` graph among components.                        |
