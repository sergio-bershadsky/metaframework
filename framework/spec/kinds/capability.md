---
kind: spec
name: capability
version: 1
status: draft
title: Kind — Capability
summary: Contract for capability entities — solution-level placement, the deliberately empty frontmatter, realization via the realizes edge, and the boundary against product, component and requirement.
---

# Kind: capability

A **capability** is something the business can *do*, stated in the business's
own words and independent of how it is built. "Fulfil an order" is a
capability; the fulfilment service that currently performs it is a component,
and the product that ships that component is a product. Rebuild all of them
tomorrow on a different stack and the capability is unchanged — that
invariance is the whole definition.

This document adds to the common contract in
[frontmatter.md](../frontmatter.md); it does not restate or relax it.

## Purpose

Every other kind in the catalog describes a *thing we built* or a *fact about
what we built*. A capability is the only kind that describes what the business
would still need to do if we had built nothing. It exists so that three
questions have an addressable answer instead of a paragraph in a deck:

1. **What does this solution let the business do?** `ls solutions/acme/capability/`
   is the answer, and it is a list a non-engineer can read.
2. **What provides it?** The `realizes` edge, pointing up from products and
   components — one capability, any number of realizers, including zero.
3. **What is at risk if a product is retired?** The capabilities it realizes
   that nothing else does. That question has no answer without this kind,
   because a product's dependents are other products, never the business
   outcome it carries.

A capability that nothing realizes is **aspiration, not architecture**. The
catalog says so out loud (`W_CAP_UNREALIZED`, below) rather than letting a
plausible-sounding list of business verbs pass for a described system.

### What a capability is NOT

Four kinds compete for the same sentence, and picking the wrong one is the
most common authoring mistake this kind invites. Apply in order; the first
`yes` wins:

| # | Question                                                                            | If yes                                                                                                  |
| - | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1 | Is it funded, delivered and owned as a unit — does it have a team and a roadmap?    | **product** ([product.md](product.md)). `shop` is a product; *sell goods online* is what it realizes.   |
| 2 | Does it have an inside that we describe — code, a runtime, an interface?            | **component** ([component.md](component.md)). A capability has no inside; it is realized, not built.    |
| 3 | Is it a statement that must be **true**, decidable by written criteria?             | **requirement** ([requirement.md](requirement.md)). *Orders dispatch within 24 h* passes or fails.      |
| 4 | Does the **order** of steps across the solution matter to it?                       | **journey** ([journey.md](journey.md)). A capability is a verb, a journey is a path.                    |
| 5 | Otherwise — the business can do it, and it survives a rewrite                       | **capability**.                                                                                         |

Two further boundaries, both worth stating because the words overlap in
ordinary speech:

- **An actor's `goal` is not a capability.** A goal is what a counterpart wants
  *from* us, written in the counterpart's language and owned by the actor entity
  ([actor.md](actor.md)). A capability is what *we* can do, written in ours.
  "See an order's status without contacting support" is a goal; "Report order
  status" is the capability that serves it. Keeping them separate is what makes
  the review question — *which capability serves this goal?* — answerable.
- **A capability is not a subdomain, a value stream, or a Wardley component.**
  Those are analysis frames applied *to* capabilities; if a team uses one, it
  belongs in `tags`, which carry no semantics ([frontmatter.md](../frontmatter.md)).

The mechanical test, when the table leaves it ambiguous: **write the sentence,
then imagine replacing every system behind it — different vendor, different
language, different team.** If the sentence needs rewriting, it was a
description of the implementation and belongs to a component or a product. If
it stands unchanged, it is a capability.

```text
Fulfil an order                     # survives the rewrite  → capability
Take payment                        # survives              → capability
Run the fulfilment service          # dies with the service → component
Dispatch within 24 hours at p95     # decidable, pass/fail  → requirement
Ship the 2026 logistics platform    # funded and owned      → product
```

## Placement

Capabilities are **solution-level only**. The bucket is `capability/`, a direct
child of the solution directory:

```text
solutions/acme/capability/order-fulfilment/index.md         # legal
                                        # srn://acme/capability/order-fulfilment
solutions/acme/product/shop/capability/order-fulfilment/    # ILLEGAL — E_SRN_PLACEMENT
```

The rule is **grammar**, not a loader check: a `capability` pair may only be
the first pair after the authority, so the second path above fails while it is
parsed and never reaches frontmatter validation ([srn.md](../srn.md)). It needed
no new rule — P4 is written over the set of solution-level kinds, and
`capability` joined `actor` and `environment` in that set (decision-record
amendment 2026-08-20-a). The rationale is kind-specific:

- **A capability is a fact about the business, not about a product.** Two
  products may realize one capability, and the second one arriving must not
  require moving the first one's SRN. Placing capabilities under a product
  would make the shared case unwriteable and would break every reference the
  day the portfolio is reorganized.
- **Capabilities outlive their realizers.** That is the point of the kind: the
  product is replaced, "Fulfil an order" is not. An address owned by the thing
  most likely to be retired is the wrong address.
- **Metrics reference capabilities from any depth.** A metric is owner-scoped
  and may sit on a component five levels down while measuring a
  solution-level capability ([metric.md](metric.md)). Solution-level placement
  makes those references immune to component reshuffling and swaps.

### A capability owns nothing

Only `product` and `component` are containers (rule P1, [srn.md](../srn.md)).
A capability is a leaf, so no bucket may appear inside it:

```text
solutions/acme/capability/order-fulfilment/metric/on-time-rate/   # ILLEGAL
                                          # E_SRN_PLACEMENT — a capability
                                          # cannot own a metric
```

A metric *about* a capability lives in the bucket of whoever is accountable for
the number — usually the solution — and points at the capability with
`measures`. This is the same shape as a requirement bound at solution level and
implemented three levels down: **ownership and reference are different
questions**, and only ownership is expressed by placement.

### Naming

Capability names are kebab-case noun phrases naming the doing —
`order-fulfilment`, `identity-verification`, `refund-issuance` — with **no
ordinal prefix** (like requirements, and for the same reason: they are re-read
out of order, and an ordinal would invite renumbering, which the SRN forbids —
[evolution.md](../evolution.md)).

The nominalized slug carries one real danger: `order-fulfilment` reads like the
name of a fulfilment service, which is precisely the confusion this kind exists
to prevent. `title` is the countermeasure and is **normative in intent**: it
states the capability as the verb phrase the business actually says, and
`summary` opens with a verb.

```yaml
name: order-fulfilment
title: Fulfil an order                       # the business's sentence
summary: Get paid-for goods to the customer who ordered them, or say truthfully why not.
```

```yaml
name: order-fulfilment
title: Order Fulfilment Service              # a component wearing a business title
summary: The subsystem responsible for fulfilment orchestration.
```

Neither example is a build error — no parser can tell a verb phrase from a
product name. It is a **review defect**, stated here so review has something to
point at.

## Frontmatter additions

**The capability kind adds no fields in v1.** An entity with `kind: capability`
declares the common fields ([frontmatter.md](../frontmatter.md)) and nothing
else; any kind-specific field is `E_FM_UNKNOWN_FIELD`, because the portal's
frontmatter schema is a discriminated union on `kind` and this kind's layer is
deliberately empty.

```yaml
---
name: order-fulfilment
kind: capability
version: 1
title: Fulfil an order
summary: Get paid-for goods to the customer who ordered them, or say truthfully why not.
status: approved
owner: team-commerce
tags:
  - commerce
---
```

```yaml
capability-type: core        # E_FM_UNKNOWN_FIELD — no such field (see below)
maturity: 3                  # E_FM_UNKNOWN_FIELD
lifecycle: active            # E_FM_UNKNOWN_FIELD — a product field on a capability
```

### Why nothing, when every other kind has a type enum

Every kind before this one carries at least a discriminating enum —
`actor-type`, `component-type`, `requirement-type`, `environment-type`. The
absence here is a decision, not an omission. The test each candidate had to
pass is the one the existing enums pass: **does some portal behaviour or some
validation rule change with the value?** None did.

| Candidate                                        | Why not                                                                                                                                             | Where it goes instead                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `capability-type: core \| supporting \| generic` | A strategy classification that shifts with the market, not with the description. Nothing validates against it and nothing renders differently.      | `tags` — an open facet with no semantics.                          |
| `maturity` / `level`                             | A score of how *well* we do it. That is a measurement, and measurements have a kind.                                                                | a `metric` with `measures` pointing here ([metric.md](metric.md)). |
| `primary-actors`                                 | Who benefits is already stated: the actor's `goals` and the realizing product's `primary-actors` ([product.md](product.md)) both say it, once each. | derived, or the realizer's frontmatter.                            |
| `outcome`                                        | A second summary field under another name.                                                                                                          | `summary` and the body.                                            |
| `owner`                                          | Already common, and already optional.                                                                                                               | [frontmatter.md](../frontmatter.md).                               |
| `realized-by`                                    | An authored inverse of `realizes`; two lists that drift.                                                                                            | derived by the portal.                                             |

A kind that arrives with six speculative fields teaches authors to fill them
with noise, and a field nobody reads is impossible to remove afterwards —
[evolution.md](../evolution.md) forbids reduction, so every speculative field is
permanent. Adding a field later is a cheap additive spec change (bump this
document's `version`); removing one is not available at any price. The
asymmetry decides it.

The substance of a capability is therefore **its name, its sentence, and its
edges**. That is not a thin kind — the edges are the part the portal computes
with.

## Realization — the `realizes` edge

Realization is authored **on the realizer's side only**, never here:

```yaml
# solutions/acme/product/shop/index.md
relations:
  realizes:
    - /capability/order-fulfilment
```

```yaml
# solutions/acme/product/fulfilment/component/dispatch/index.md
relations:
  realizes:
    - /capability/order-fulfilment          # the same capability, second realizer
```

| Edge       | Legal source kinds | Legal target kind | Meaning                                       |
| ---------- | ------------------ | ----------------- | --------------------------------------------- |
| `realizes` | product, component | capability        | The source provides some or all of the doing. |

The edge is defined in [frontmatter.md](../frontmatter.md) with the rest of the
closed edge set; this document only states how it binds to capabilities.
Three consequences:

- **The inverse is derived.** `realized-by` is computed by the portal, exactly
  like `implemented-by` and every other inverse. Authoring it is `E_FM_SCHEMA`.
- **Partial realization is normal and is not marked.** A component realizing
  one slice of a capability writes the same edge as a product realizing all of
  it. Splitting the edge into "fully"/"partially" would ask every author to
  judge a percentage nobody could check; if the split matters, say which slice
  in prose, and put the number in a metric.
- **`solution` is not a legal source.** A solution realizing a capability is
  vacuous — the solution is everything — and would make the unrealized check
  trivially satisfiable for the whole catalog.

### The unrealized check

A capability with **no** incoming `realizes` edge is `W_CAP_UNREALIZED`.

It is a warning, not an error, for the same reason `W_REQ_UNIMPLEMENTED` is
([requirement.md](requirement.md)): describing the business before building for
it is the intended order of work, and a design-first catalog would otherwise be
red on day one. What makes it useful is reading it **against `status`**:

| `status`     | An unrealized capability means                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `draft`      | Design in flight. Expected; the warning is the to-do list.                                                                    |
| `review`     | About to be agreed with nothing behind it yet. Normal, worth seeing.                                                          |
| `approved`   | **An agreed description of something the business cannot actually do.** This is the number the solution dashboard leads with. |
| `deprecated` | Fine — the description is retired.                                                                                            |

Retiring the last realizer does **not** deprecate the capability. `status`
describes the document, never the world ([frontmatter.md](../frontmatter.md)):
a business that has stopped being able to do something still needs that fact
written down, and `W_CAP_UNREALIZED` on an `approved` capability is exactly the
signal that says so. Deprecating it would delete the signal and the sentence at
once.

### What a capability may reference

| Edge                                              | From a capability                                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `supersedes`                                      | Legal, toward another capability — the successor of a doing that was split or renamed ([evolution.md](../evolution.md)).       |
| `uses`                                            | Legal by the common contract, but rarely right; toward a **component** it is `W_CAP_REALIZATION_EDGE` (below).                 |
| `realizes`, `exposes`, `depends-on`, `implements` | Not available: their legal source kinds are component/product only ([frontmatter.md](../frontmatter.md)) — `E_FM_EDGE_SOURCE`. |

**Do not author `uses` toward a component from a capability.** It is the
inverse of `realizes` written by hand, and the portal already derives that list
— two lists, one of which is wrong the moment a component is added. This is the
same position [actor.md](actor.md) takes about protocol participation, and it
is flagged the same way:

```yaml
relations:
  uses:
    - /product/fulfilment/component/dispatch   # W_CAP_REALIZATION_EDGE — write
                                               # `realizes` on the component
```

A `uses` edge toward a datamodel, protocol or environment is legal and
unflagged, but it is a smell worth naming: a capability that has to quote a
wire format is being written at the altitude of a component. Say it in prose,
or the sentence is not a capability.

**v1 limitation, stated rather than worked around:** there is no
capability→capability edge for decomposition. `uses` does not accept a
capability target and `depends-on` is component/product only, so a
capability tree — "Fulfil an order" containing "Pick", "Pack", "Ship" — cannot
be expressed in v1. Write one capability per doing at the altitude the business
uses, group related ones with `tags`, and link them in prose. This is the same
gap [requirement.md](requirement.md) records for requirements, and it should be
closed for both kinds at once or for neither: a `refines` edge added to the
closed set in [frontmatter.md](../frontmatter.md) would serve both, and adding
two differently-named parent edges for the same idea would not.

## Measurement

A capability does not declare how it is measured. A `metric` entity points at
it with `measures`, from the bucket of whoever is accountable for the number
([metric.md](metric.md)):

```yaml
# solutions/acme/metric/on-time-delivery-rate/index.md
relations:
  measures:
    - /capability/order-fulfilment
```

`measured-by` is derived onto the capability page. There is deliberately **no**
`W_CAP_UNMEASURED`: nearly every capability would fire it on the day the kind
is adopted, and a warning that is always on is a warning nobody reads. Whether
a capability is measured is a question for the coverage view, which shows it as
a column, not as an alarm.

## Sibling artifacts

**The capability kind defines no sibling artifacts.** A capability is
`index.md`.

It has no machine-readable substance of its own: its name is its identity, and
everything structured about it is an edge — who realizes it, what measures it,
which journeys pass through it — held by the entity on the other end. This is
the same argument [actor.md](actor.md) makes, and the contrast with
[journey.md](journey.md) is the useful one: a journey has an *ordered* interior
that no edge can express, so it earns `journey.yaml`; a capability's interior
is a sentence.

Files placed next to a capability's `index.md` anyway are supporting material;
the portal links them but does not interpret them.

## Body template

**No heading is enforced.** The lead paragraph is the capability, and the rest
is conventional:

```markdown
# <Title — the verb phrase>

<What the business can do, in one or two paragraphs, in the business's words.>

## Boundaries        <!-- conventional: what this capability stops short of -->
## Not this          <!-- conventional: the neighbouring capability it is confused with -->
```

The asymmetry with [adr.md](adr.md) (four enforced headings) and
[requirement.md](requirement.md) (one) is intentional and follows the same
rule both of those state: a heading is pinned only when the portal renders that
section **as structure**. An ADR has four separate things to say; a requirement
has criteria rendered as a checklist. A capability has one sentence and a graph
— and the graph is derived, so there is nothing left to pin.

The `## Boundaries` section is where the review value sits. It is the paragraph
that stops the capability list from becoming a set of overlapping synonyms two
quarters from now.

## Evolution

The capability's contract surface is **its identity** — what the name denotes.
Per [evolution.md](../evolution.md):

- Legal at `version: N+1` — clarify the sentence, sharpen `## Boundaries`, add
  or repoint relations, add tags, correct the summary, retitle *without*
  changing what the name denotes.
- **ILLEGAL in place** — narrowing the doing (`order-fulfilment` quietly
  starting to mean domestic orders only), broadening it to absorb a neighbour,
  or splitting it in two. Each is a reduction of what an existing `realizes`
  edge claimed, and the realizers have not been asked. All are swaps:

  ```yaml
  # solutions/acme/capability/domestic-order-fulfilment/index.md — the successor
  version: 1
  status: draft
  relations:
    supersedes:
      - ../order-fulfilment      # sibling capability in the same bucket: the base
                                 # of a relative ref is this entity's own directory
  ```

  Migrate each realizer's `realizes` edge one at a time — the portal lists them
  under `realized-by`, which is exactly the migration checklist — then set the
  old capability to `status: deprecated`. It is never deleted.

- A **split** produces two successors, both naming the same predecessor in
  `supersedes`. That is legal and is the honest record of what happened; the
  predecessor's page renders both as its forward pointers.
- Losing every realizer is **not** an evolution event. Nothing about the
  description changed; `W_CAP_UNREALIZED` appears and stays until someone acts.

## Worked example

`solutions/acme/capability/order-fulfilment/index.md`:

```markdown
---
name: order-fulfilment
kind: capability
version: 3
title: Fulfil an order
summary: Get paid-for goods to the customer who ordered them, or say truthfully why not.
status: approved
owner: team-commerce
tags:
  - commerce
  - customer-facing
---

# Fulfil an order

Once a customer has paid, acme can get the goods to them: reserve the stock,
pick and pack it, hand it to a carrier, and keep the customer informed until it
arrives or is written off. When it cannot be done — the stock was oversold, the
address is undeliverable, the carrier lost it — acme can say so, name the
reason, and return the money.

The capability is stated to include the failure path on purpose. A fulfilment
description that only covers the happy case is the one that leaves the customer
without goods and without a refund, which is the case the business is actually
judged on.

## Boundaries

- Ends at delivery or at a written-off parcel. **Returns** are a separate
  capability ([refund-issuance](srn://acme/capability/refund-issuance)) because
  the money moves in the other direction and a different team answers for it.
- Says nothing about *which* carrier, warehouse, or service performs it. Those
  are components, and the portal lists them under "Realized by".

## Not this

- *Take payment* is upstream and separate: an order can be paid for and never
  fulfilled, which is exactly the case this capability's failure path covers.
- *Track a parcel* is a customer-facing view over this capability, not another
  capability. It appears here as the "keep the customer informed" clause.
```

The realizers, each authoring one edge:

```yaml
# solutions/acme/product/fulfilment/index.md
relations:
  realizes:
    - /capability/order-fulfilment
```

```yaml
# solutions/acme/product/shop/component/checkout/index.md
relations:
  realizes:
    - /capability/order-fulfilment   # the reservation slice, at the point of sale
  implements:
    - requirement/idem-cap           # obligations stay a separate edge
```

And the metric that puts a number on it, from the solution's own bucket:

```yaml
# solutions/acme/metric/on-time-delivery-rate/index.md
kind: metric
relations:
  measures:
    - /capability/order-fulfilment
```

A capability realized by two unrelated products,
`solutions/acme/capability/identity-verification/index.md`:

```markdown
---
name: identity-verification
kind: capability
version: 1
title: Verify who someone is
summary: Establish, to a stated level of assurance, that a person is who they claim to be.
status: review
owner: team-identity
tags:
  - identity
  - compliance
---

# Verify who someone is

acme can raise its confidence in a claimed identity to a level appropriate for
what is being asked — a password for a basket, a document check for a payout.
The levels are a business decision and are named in
[assurance-levels](srn://acme/requirement/assurance-levels); this capability is
the ability to reach them at all.

## Boundaries

- Verification, not authorization. What a verified person is then *allowed* to
  do is a separate concern owned by each product.
- Not a vendor. The document-checking bureau is described as an `external`
  component and may be swapped without touching this page — which is the point
  of describing the doing rather than the doer.
```

This second example is the one that fixes the placement rule. `shop` and
`partner-portal` both realize it, and neither owns it:

```yaml
# solutions/acme/product/shop/index.md
relations:
  realizes: [/capability/identity-verification]
```

```yaml
# solutions/acme/product/partner-portal/index.md
relations:
  realizes: [/capability/identity-verification]
```

Had capabilities been product-scoped, the second product would have had to
either duplicate the description — two entities for one doing, drifting from
the first commit — or reference into another product's bucket, making one
product's reorganization break the other's page. Solution-level placement is
what makes "two products, one capability" writeable at all.

## Validation rules

Numbered `CAP*` to avoid collision with the placement rules P1–P4 in
[srn.md](../srn.md), which also bind here.

| #    | Rule                                                                          | Class                    |
| ---- | ----------------------------------------------------------------------------- | ------------------------ |
| CAP1 | The `capability/` bucket is a direct child of a solution directory.           | `E_SRN_PLACEMENT`        |
| CAP2 | A capability contains no kind bucket — it owns nothing (P1).                  | `E_SRN_PLACEMENT`        |
| CAP3 | No kind-specific frontmatter field is present.                                | `E_FM_UNKNOWN_FIELD`     |
| CAP4 | No authored inverse edge (`realized-by`, `measured-by`).                      | `E_FM_SCHEMA`            |
| CAP5 | No `realizes`/`exposes`/`depends-on`/`implements` authored from a capability. | `E_FM_EDGE_SOURCE`       |
| CAP6 | Every `realizes` edge pointing here comes from a product or component.        | `E_FM_EDGE_SOURCE`       |
| CAP7 | No `uses` edge from a capability to a component.                              | `W_CAP_REALIZATION_EDGE` |
| CAP8 | The capability has at least one incoming `realizes` edge.                     | `W_CAP_UNREALIZED`       |

CAP1–CAP2 fail while the path is parsed, so a misplaced capability never
reaches the rest. CAP3–CAP5 are checkable from the entity alone; CAP6–CAP8 need
the resolved catalog. Common rules (name/directory match, SRN syntax, edge
target kinds, cross-solution sealing) apply unchanged and are not restated here.

## What the portal derives

- **Capability page** — the sentence, the derived `realized-by` list grouped by
  product, the derived `measured-by` list with each metric's target and
  direction ([metric.md](metric.md)), and the journeys that pass through it.
- **Capability map** on the solution dashboard — every capability as a card,
  badged by `status`, with its realizer count. It is the one view in the portal
  a non-engineer can read end to end, and it is the reason the kind is
  solution-level.
- **Unrealized panel** — every `W_CAP_UNREALIZED`, `approved` ones first. The
  approved-and-unrealized list is the catalog's sharpest single number: agreed
  descriptions of things the business cannot do.
- **Capability × product coverage** — the transpose of the same graph, which
  answers the retirement question: retiring this product orphans these
  capabilities, and these are the ones nothing else realizes.
- **"Realizes" section on product and component pages** — the same edges read
  forward, so a component page states which business doing it carries.
- **Supersession chain** — `superseded-by` derived from successors'
  `supersedes` edges; deprecated capabilities render greyed with a pointer
  forward, and a split renders as two forward pointers.

## Capability error classes

| Code                     | Meaning                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `W_CAP_UNREALIZED`       | No product or component `realizes` this capability — it is aspiration, not architecture.                     |
| `W_CAP_REALIZATION_EDGE` | A capability authors a `uses` edge to a component; realization is stated by the component's `realizes` edge. |

Placement, frontmatter shape, and reference errors reuse the existing classes:
`E_SRN_PLACEMENT` ([srn.md](../srn.md)), `E_FM_SCHEMA`, `E_FM_UNKNOWN_FIELD`,
`E_FM_EDGE_SOURCE` and `E_FM_EDGE_TARGET` ([frontmatter.md](../frontmatter.md)).
