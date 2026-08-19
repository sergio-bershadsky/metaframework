---
kind: spec
name: actor
version: 1
status: review
title: Kind — Actor
summary: Contract for actor entities — solution-level placement, the actor-type enum, goals, protocol and workflow participation, validation, and derived views.
---

# Kind: actor

An **actor** is a source or sink of intent that the solution serves or talks to,
and whose internals the catalog deliberately does not describe. Actors are the
outer edge of the described universe: everything inside is components, protocols
and data models; everything that pushes on it from outside — or that the
solution pushes on — is an actor.

This document adds to the common contract in
[frontmatter.md](../frontmatter.md); it does not restate or relax it.

## Purpose

An actor exists so that a protocol, a workflow, or a requirement has a *named*
counterpart instead of an anonymous "the user" or "the bank". Three
consequences follow, and they are the whole reason the kind exists:

1. Protocol sequence diagrams get a stable lane per actor
   ([protocol.md](protocol.md)).
2. Requirements have an addressable beneficiary in prose.
3. The security and integration surface of a solution is enumerable —
   `ls solutions/acme/actor/` is the list of everyone who can move the system.

### The boundary test

Whether something is an actor or a component is decided by ownership of the
description and by whether anything needs to *point at* it — not by network
topology. Apply in order; the first `yes` wins:

| # | Question                                                          | If yes                                                                                                                        |
| - | ----------------------------------------------------------------- | ------------------------------------------------------------------------                                                      |
| 1 | Does it originate requests or receive outcomes?                   | Continue. If **no**, it is not an actor at all — probably a datamodel, or a sentence of prose.                                |
| 2 | Do we own and describe its internals in *this* solution?          | It is a **component** ([component.md](component.md)), not an actor.                                                           |
| 3 | Must anything name it in a `uses`, `exposes`, `depends-on`, or `implements` edge? | It is an **`external` component** — an actor is not a legal target of those four edges ([frontmatter.md](../frontmatter.md)). |
| 4 | Otherwise                                                         | **Actor**.                                                                                                                    |

Question 3 is the mechanical part, and it is what separates an `external-system`
actor from an `external` component ([component.md](component.md)) — the two
descriptions that most obviously compete:

- The legal targets of `uses`, `exposes`, `depends-on`, and `implements` are
  datamodels, protocols, environments, components, products, and requirements.
  **An actor is not among them.** So the moment a component must declare
  `depends-on` or `uses` toward a third party, that third party has to be an
  `external` component; describing it as an actor would leave the edge
  unwriteable. (The one edge that *does* accept an actor target is
  `supersedes`, whose target kind is always the source's own kind — an actor
  superseding an actor, per [evolution.md](../evolution.md).)
- Protocol participant lists, by contrast, accept components, products, **and**
  actors ([protocol.md](protocol.md)). A counterpart that only ever appears in
  a conversation — typically an inbound partner that calls us — needs no edge
  and is an `external-system` actor.
- Describe each real system **once**, one way. If it needs both a node in the
  component graph and a lane in a sequence diagram, make it an `external`
  component: participant lists accept components, so nothing is lost. Modelling
  the same system as both a component and an actor produces two nodes for one
  thing and is a review defect, not a build error — the portal cannot tell that
  `psp` and `psp-acquirer` are the same company.

Either way, the description is **local**. Solutions are sealed universes: a
system belonging to another solution in this repository is described here, and
an SRN into that solution stays illegal ([srn.md](../srn.md)):

```text
solutions/acme/actor/globex-payments/     # legal — the partner's API described
                                          # locally as an external-system actor
relations:
  uses: [srn://globex/gateway/protocol/authorize]   # ILLEGAL — E_SRN_CROSS_SOLUTION
```

## Placement

Actors are **solution-level only**. The bucket is `actor/`, a direct child of
the solution directory:

```text
solutions/acme/actor/customer/index.md          # legal   srn://acme/actor/customer
solutions/acme/shop/actor/customer/index.md     # ILLEGAL — E_STRUCT_KIND_PLACEMENT
```

The rule and its error class are owned by [structure.md](../structure.md); the
rationale is kind-specific:

- An actor is a fact about the solution's universe. A customer does not belong
  to the checkout component any more than to the storefront — pinning ownership
  to one container would be arbitrary and would break the moment a second
  component starts serving the same actor.
- Actor SRNs are quoted from protocol artifacts at every depth. Solution-level
  placement makes those SRNs immune to component reshuffling and swaps.
- [structure.md](../structure.md) already excludes actors from the protocol
  nearest-common-ancestor computation *because* they are solution-level;
  allowing them lower would make every protocol's NCA collapse toward the root.

Actors have no owner container other than the solution, so an actor is never
"inside" a product. Products and components reference actors; they never own
them.

## Frontmatter additions

On top of the common fields ([frontmatter.md](../frontmatter.md)), an entity
with `kind: actor` declares:

| Field        | Type                                                    | Required | Rule                                                       |
| ------------ | ------------------------------------------------------- | -------- | ---------------------------------------------------------- |
| `actor-type` | `human \| system \| external-system \| service-account` | yes      | Closed enum, see below. Any other value is `E_FM_SCHEMA`.  |
| `goals`      | list of one-line strings, ≥ 1 item, each ≤ 200 chars    | yes      | What this actor wants from the solution, in its own terms. |

Both fields are normative for `kind: actor` only. Using `actor-type` on any
other kind is `E_FM_UNKNOWN_FIELD` — the portal's frontmatter schema is a
discriminated union on `kind`, so kind-specific fields do not leak across
kinds.

```yaml
actor-type: human
goals:
  - Pay for a basket without re-entering card details.
  - See an order's status without contacting support.
```

```yaml
actor-type: person          # E_FM_SCHEMA — not a member of the enum
goals: Pay for a basket.    # E_FM_SCHEMA — string, not a list
goals: []                   # E_FM_SCHEMA — at least one goal is required
```

### The `actor-type` enum

| Value             | Means                                                                                                                                                                                                          | Example                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `human`           | A person acting in a named role, through any interface.                                                                                                                                                        | `customer`, `support-agent`, `warehouse-picker` |
| `system`          | An automated runtime **inside** our ownership boundary that the catalog deliberately does not model as a component.                                                                                            | `nightly-scheduler`, `release-pipeline`         |
| `external-system` | An automated runtime **outside** our ownership boundary — a third party, a partner, another solution — that nothing needs to name in a relation edge (otherwise: `external` component, see the boundary test). | `globex-payments`, `postal-tracking-api`        |
| `service-account` | A non-human **identity** that a runtime or a human assumes in order to act; a credential holder, not a runtime.                                                                                                | `release-bot`, `analytics-reader`               |

The value is decided by applying these tests in order — the first `yes` wins:

```text
1. Is the intent a person's?                                   yes -> human
2. Is it an identity that something else assumes, rather than
   a runtime of its own?                                       yes -> service-account
3. Is the runtime outside our ownership boundary?              yes -> external-system
4. Otherwise (our machine, not modelled as a component)               system
```

Why exactly these four, and why the set is closed:

- The enum answers one question the portal and the reviewer both need before
  reading any prose: *what kind of trust and control do we have over this
  counterpart?* `human` needs UX and consent; `system` we can change;
  `external-system` we can only negotiate with; `service-account` we can revoke.
  Those four postures exhaust the options — there is no fifth trust posture.
- `service-account` is not a redundant flavour of `system`. It is the only
  actor type that has no goals of its own: it borrows them from a principal.
  Keeping it separate is what makes the credential inventory
  (`grep -l 'actor-type: service-account' -r solutions/`) exact, which is the
  question security review actually asks.
- Rejected values and where they go instead:
  - `role`, `group` — an actor already *is* a role; use one actor per role
    (`customer` and `support-agent` may well be the same person on different
    days) and `tags` to group them.
  - `organization` — organizations do not send messages; the system they
    operate does. Model that system as `external-system`.
  - `device`, `iot-sensor` — a runtime; `system` or `external-system` decides
    it, and the device's distribution belongs in an environment's topology
    ([environment.md](environment.md)).
  - `internal`/`partner`/`public` — audience facets, not trust postures. Use
    `tags`.
- Adding a value later is an additive spec change under
  [evolution.md](../evolution.md); an open string would instead make the portal
  unable to badge, filter, or validate actors at all, which is the whole point
  of the field.

### Goals

Goals are the actor's objectives stated from the actor's point of view, one
sentence each, starting with a verb. They are the review anchor: a goal that no
protocol, workflow, or requirement serves is a hole in the description, and a
protocol that serves no stated goal is unmotivated.

```yaml
# good — the actor's outcome, in the actor's language
goals:
  - Pay for a basket without re-entering card details.

# poor — our implementation, in our language (belongs in a component's prose)
goals:
  - Call POST /payments with a tokenized card.
```

For `service-account` actors, state the delegated capability *and* the
principal:

```yaml
actor-type: service-account
goals:
  - Apply approved schema migrations to an environment on behalf of team-platform.
```

Goal traceability is a review practice, not a build check: goals are prose and
the portal does not attempt to match them to protocols.

## Relations

Actors use the common `relations` map with no additions. In practice:

| Edge                                  | From an actor                                                                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uses`                                | Legal and useful toward a **component** (the surface the actor touches) and toward an **environment** (where a service account holds credentials). |
| `supersedes`                          | Legal, toward another actor — a role that was split or renamed ([evolution.md](../evolution.md)).                                                  |
| `exposes`, `depends-on`, `implements` | Not available: their legal source kinds are component/product only ([frontmatter.md](../frontmatter.md)).                                          |

```yaml
relations:
  uses:
    - /shop/checkout            # the component this actor interacts with
```

**Do not author `uses` toward a protocol from an actor.** Protocol
participation is authored once, on the protocol side ([protocol.md](protocol.md)),
and duplicating it here creates two lists that drift. This is the same position
protocol.md takes from its side — actor participants are exempt from the
back-edge checks that apply to component participants — stated here as an
active discouragement rather than a mere exemption. The portal flags it as
`W_ACTOR_PARTICIPATION_EDGE`:

```yaml
relations:
  uses:
    - /shop/protocol/order-events   # W_ACTOR_PARTICIPATION_EDGE — say it in the
                                    # protocol's participant list instead
```

## Sibling artifacts

**The actor kind defines no sibling artifacts in v1.** An actor entity is
`index.md` and nothing else.

The reason is that an actor has no machine-readable substance of its own: its
name is its identity, its type is one enum value, and everything else about it
— goals, journeys, constraints — is prose that only a human reads. The
structured facts *about* actors live where they are used: participation in
protocol artifacts, credentials in an environment's config surface, obligations
in requirements. A per-actor artifact would only duplicate those.

Files placed next to an actor's `index.md` anyway are supporting material; the
portal does not interpret them.

## Actors in protocols and workflows

Participation is authored **on the protocol side only**. From the actor side
the contract is three rules:

1. An actor SRN is a legal `ref` in a protocol's `participants` list, which
   lives in that protocol's `index.md` frontmatter
   ([protocol.md](protocol.md) owns the format).
2. Actors are senders and receivers in workflow steps, exactly like components
   — and, exactly like components, they are named there by their **alias**, not
   by an SRN. The SRN appears once, in `participants`:

   ```yaml
   # solutions/acme/shop/protocol/order-events/index.md
   participants:
     - alias: customer
       ref: /actor/customer            # the SRN lives here, once
       role: initiator
     - alias: checkout
       ref: /shop/checkout
   ```

   ```yaml
   # solutions/acme/shop/protocol/order-events/workflows/place-order.yaml
   steps:
     - message: order-placed
       from: customer                  # alias, not an SRN (E_PROTO_WF_ALIAS)
       to: checkout
       payload: /shop/datamodel/order-placed@1
   ```

3. Actors **never** affect protocol placement. The nearest-common-ancestor rule
   in [structure.md](../structure.md) counts component and product participants
   only, so a
   protocol between `acme/shop/checkout` and `srn://acme/actor/customer` still
   belongs at `solutions/acme/shop/protocol/...`, not at the solution root.

An actor named in no protocol's `participants` list and no workflow step is
`W_ACTOR_ORPHAN` — legal (a newly described actor precedes its protocols), but
flagged, because an actor nobody talks to is usually a leftover from a swap.

## Worked example

`solutions/acme/actor/customer/index.md`:

```yaml
---
name: customer
kind: actor
version: 2
title: Customer
summary: End user who browses the shop, places orders, and tracks their fulfilment.
status: approved
owner: team-commerce
actor-type: human
goals:
  - Pay for a basket without re-entering card details.
  - See an order's status without contacting support.
  - Get money back for a returned item within one working day.
relations:
  uses:
    - /shop/checkout
tags:
  - commerce
  - external-facing
---

# Customer

A customer is any person holding a shop account, authenticated or in a guest
session. The role says nothing about tenure or spend — segmentation is a
concern of the analytics product, not of this description.

## Boundaries

- The customer is never a component: we describe the surfaces they touch
  (`/shop/checkout`), never their behaviour.
- A person may hold several roles at once. The same human acting on behalf of
  the merchant is the `merchant-operator` actor, and the two roles must not be
  merged just because one body performs both.

## Participation

The customer appears as a participant of
[order-events](srn://acme/shop/protocol/order-events) and as the initiating
sender of the `place-order` workflow. Participation is declared there, not here.
```

A service-account actor, `solutions/acme/actor/release-bot/index.md`:

```yaml
---
name: release-bot
kind: actor
version: 1
title: Release bot
summary: CI identity that applies migrations and promotes builds on behalf of team-platform.
status: approved
owner: team-platform
actor-type: service-account
goals:
  - Apply approved schema migrations to an environment on behalf of team-platform.
  - Promote a verified build from staging to production on behalf of team-platform.
relations:
  uses:
    - /environment/production
    - /environment/staging
tags:
  - ci
---

# Release bot

The identity, not the pipeline. The pipeline runtime is the `release-pipeline`
actor (`actor-type: system`); `release-bot` is the credential it assumes, and
the two are separate because the credential is revoked, rotated, and audited
independently of the runtime that holds it.
```

## Evolution

The actor's contract surface is **its identity and its `actor-type`** — what
the name denotes and what trust posture it carries. Per
[evolution.md](../evolution.md):

- Legal at `version: N+1` — clarify prose, add a goal, add or repoint
  relations, add tags, correct a summary.
- ILLEGAL in place — repurposing the name (`customer` starting to mean
  "merchant"), or flipping `actor-type` because the counterpart changed nature
  (an in-house `system` that was outsourced is a *different* counterpart).
  Both are swaps: create the successor actor, add `supersedes`, migrate the
  protocol participant lists, then set the old actor to `status: deprecated`.

```yaml
# solutions/acme/actor/merchant-operator/index.md  — the successor
relations:
  supersedes:
    - ../shop-admin           # sibling actor in the same bucket: the base of a
                              # relative ref is this entity's own directory
```

Removing a goal is a reduction of the described surface and follows the same
rule: an obsolete goal is struck through in prose or moved to a "no longer
served" note, never silently deleted.

## Validation rules

| #    | Rule                                                                    | Class                        |
| ---- | ----------------------------------------------------------------------- | ---------------------------- |
| ACT1 | `actor/` bucket is a direct child of a solution directory.              | `E_STRUCT_KIND_PLACEMENT`    |
| ACT2 | `actor-type` present and a member of the closed enum.                   | `E_FM_SCHEMA`                |
| ACT3 | `goals` present, a list, ≥ 1 item, each a single line ≤ 200 chars.      | `E_FM_SCHEMA`                |
| ACT4 | `actor-type` / `goals` appear only on `kind: actor` entities.           | `E_FM_UNKNOWN_FIELD`         |
| ACT5 | No `uses` edge from an actor to a protocol.                             | `W_ACTOR_PARTICIPATION_EDGE` |
| ACT6 | Actor is named in at least one protocol's `participants` list.          | `W_ACTOR_ORPHAN`             |

Rules ACT1–ACT4 are per-entity; ACT5–ACT6 need the resolved catalog. Common
rules (name/directory match, SRN syntax, edge target kinds, cross-solution
sealing) apply unchanged and are not restated here.

## What the portal derives

- **Actor page** — type badge, goals list, prose, and the derived
  `used-by` inverse (which components declare they serve this actor).
- **Participation index** — every protocol whose `participants` list names the
  actor, and every workflow step where its alias is `from` or `to`; computed by
  scanning protocol frontmatter and `workflows/*.yaml`, never authored here.
- **Sequence-diagram lanes** — the actor is a lane in every derived protocol
  sequence diagram it participates in, visually distinguished by `actor-type`.
- **Solution dashboard facets** — actor count by `actor-type`; the
  `external-system` list doubles as the integration inventory and the
  `service-account` list as the non-human credential inventory.
- **Supersession chain** — `superseded-by` derived from successors'
  `supersedes` edges; deprecated actors render greyed with a pointer forward.

## Actor error classes

| Code                         | Meaning                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| `W_ACTOR_PARTICIPATION_EDGE` | Actor authors a `uses` edge to a protocol; participation belongs to the protocol's artifacts. |
| `W_ACTOR_ORPHAN`             | Actor appears in no protocol participant list and no workflow step.                           |

Placement, frontmatter shape, and reference errors reuse the existing classes:
`E_STRUCT_KIND_PLACEMENT` ([structure.md](../structure.md)), `E_FM_SCHEMA` and
`E_FM_UNKNOWN_FIELD` ([frontmatter.md](../frontmatter.md)),
`E_SRN_CROSS_SOLUTION` ([srn.md](../srn.md)).
