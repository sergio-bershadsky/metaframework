---
kind: spec
name: journey
version: 2
status: review
title: Kind — Journey
summary: Contract for journey entities — solution-level placement, the actor frontmatter field, the journey.yaml step mini-spec, the no-branching rule and the step cap, the undocumented-integration check, validation, and derived views.
---

# Kind: journey

A **journey** is one actor's path across the solution, in order: the things
that actor touches, from first contact to outcome, written down as a flat
ordered list. It is the one kind that reads *across* containment — every other
entity describes what sits inside some container, and a journey deliberately
does not.

This document adds to the common contract in
[frontmatter.md](../frontmatter.md); it does not restate or relax it.

## Purpose

Containment is the organising principle of the whole catalog: products own
components, components own their protocols and data, and the SRN grammar makes
that ownership addressable ([srn.md](../srn.md)). It is a good principle and it
has one blind spot — nobody owns the path an actor actually takes, because the
path is precisely the thing that leaves each container. A journey is the entity
that owns it.

Three consequences follow, and they are the whole reason the kind exists:

1. **The cross-product surface becomes enumerable.** `ls solutions/acme/journey/`
   is the list of paths the solution promises; each one names, in order, the
   products it crosses.
2. **Undocumented integrations become findable.** A step that lands in a
   different product from the step before it is a hand-off. If the catalog
   contains no protocol saying how that hand-off happens, the journey has found
   an integration nobody wrote down — `W_JRN_UNDOCUMENTED_INTEGRATION` below.
   This check is the single most valuable thing the ontology gains from the
   kind.
3. **An actor's `goals` get a demonstrable route.** [actor.md](actor.md) makes
   every actor state what it wants in its own language; a journey is the
   catalog's answer, expressed in entities that exist.

### What a journey is NOT

The boundary is the most useful paragraph in this document, because a journey
is coarse and sits next to four kinds that are not.

| A journey is not…      | Because                                                                                                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a **protocol**         | A protocol is *one* exchange between named participants, placed at their nearest common ancestor, with message-level fidelity ([protocol.md](protocol.md)). A journey spans many protocols and describes none of them; it *names* one per step and moves on. |
| a **workflow file**    | `workflows/*.yaml` lives inside a protocol and speaks in that protocol's participant aliases. A journey speaks in SRNs, crosses protocol boundaries, and has no aliases at all.                                                |
| a **requirement**      | A journey states no obligation. Nothing `implements` a journey, it has no acceptance criteria, and it is never a `must`. A step note that contains the word "must" is a requirement in the wrong file ([requirement.md](requirement.md)). |
| a **capability**       | A capability is what the business can do, standing still. A journey is one route by which some capability reaches one actor. The same capability shows up in several journeys, and a journey usually crosses several capabilities. |
| a **metric**           | Numbers about a path — completion rate, drop-off, elapsed time — are a metric ([metric.md](metric.md)). A journey carries no measurement, no timing, and no volume.                                                            |
| a **process model**    | No branching, no gateways, no swimlanes, no parallelism, no compensation. Those turn a path into BPMN, and BPMN is a modelling exercise the catalog does not want ([below](#no-branching-in-v1-and-why)).                       |
| a **runtime trace**    | Steps are described positions, not observed events. A journey is what the solution says happens; what actually happened is telemetry, and telemetry has no SRN.                                                                |

## Placement

Journeys are **solution-level only**. The bucket is `journey/`, a direct child
of the solution directory:

```text
solutions/acme/journey/place-an-order/index.md               # legal —
                                                             #   srn://acme/journey/place-an-order
solutions/acme/product/shop/journey/place-an-order/index.md  # ILLEGAL — E_SRN_PLACEMENT
```

The rule is **grammar**, not a loader check: `journey` is a member of the
solution-level kind set, so a `journey` pair may only be the first pair after
the authority, and the second path above fails while it is parsed — before any
file is read ([srn.md](../srn.md), rule P4). Identical treatment to `actor` and
`environment`, for a kind-specific reason:

- A journey crosses product boundaries **by design**. A product owning one
  would be claiming a path whose ends it cannot see; the first time the path
  reached a second product, the owner would be arbitrary.
- Journey SRNs are quoted from prose and from the portal's derived views at
  every depth. Solution-level placement makes them immune to the component
  reshuffling that the path itself is about.

A journey **owns nothing**: `journey` is a leaf kind, not a container, so a
bucket inside a journey entity is `E_SRN_PLACEMENT` — including
`srn://acme/journey/place-an-order/metric/completion-rate`. A metric about a
journey has nowhere to hang in v1; see [Relations](#relations).

Journey names are kebab-case verb phrases naming the **outcome**, in the
actor's language: `place-an-order`, `return-a-parcel`,
`recover-a-locked-account`. Not the internal process (`order-fulfilment-flow`),
and — like requirements and unlike ADRs — with **no ordinal prefix**: journeys
are not chronological and renumbering would move an SRN, which
[evolution.md](../evolution.md) forbids.

## Frontmatter additions

On top of the common fields ([frontmatter.md](../frontmatter.md)), an entity
with `kind: journey` declares exactly one:

| Field   | Type          | Required | Rule                                                                                    |
| ------- | ------------- | -------- | --------------------------------------------------------------------------------------- |
| `actor` | SRN reference | yes      | The protagonist. MUST resolve to an entity of kind `actor` (`E_JRN_ACTOR_KIND`).        |

`actor` is normative for `kind: journey` only; using it on any other kind is
`E_FM_UNKNOWN_FIELD` — the frontmatter schema is a discriminated union on
`kind`, so kind fields do not leak ([frontmatter.md](../frontmatter.md)).

```yaml
actor: /actor/customer
```

```yaml
actor: /product/shop/component/checkout   # E_JRN_ACTOR_KIND — a component is not an actor
actor: [/actor/customer, /actor/courier]  # E_FM_SCHEMA — one protagonist, not a list
journey-type: onboarding                  # E_FM_UNKNOWN_FIELD — invented field
steps:                                    # E_FM_UNKNOWN_FIELD — steps live in journey.yaml
  - actor: /actor/customer
```

**Why exactly one field.** The steps are the substance and they live in
`journey.yaml`; everything else an author reaches for is either derivable from
the steps (the products crossed, the protocols involved, the length) or is a
different kind (a completion rate is a metric, an obligation is a requirement).
A kind that arrives with six speculative fields teaches authors to fill in
noise.

**Why the protagonist is in frontmatter and not only in the artifact.** It is
the entity's defining relationship — a journey without a named actor is a list
of touches — and the catalog list, the actor page, and every search facet need
it without parsing a second file. It is also the thing a swap changes: the same
path walked by a different actor is a different journey, and that is legible in
the frontmatter diff.

## Relations

A journey is a leaf in the relation graph, in both directions.

| Edge                          | From a journey                                                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `uses`                        | Legal, toward a **datamodel**, **protocol**, **environment**, or **component** — but see the anti-duplication rule below.                  |
| `supersedes`                  | Legal, toward another journey — the successor of a path that could not be extended ([evolution.md](../evolution.md)).                      |
| `exposes`, `depends-on`, `implements` | Not available: their legal source kinds are component/product ([frontmatter.md](../frontmatter.md)). Authoring one is `E_FM_EDGE_SOURCE`. |
| `realizes`                    | Not available from a journey: its legal source kinds are product/component. A journey does not realize a capability, it demonstrates one.  |

**Do not mirror the artifact into `relations`.** Every component, product and
protocol a journey touches is already named in `journey.yaml`, and the portal
derives the touch graph from there. Repeating them as `uses` edges is double
bookkeeping that drifts — the same reason a datamodel does not repeat its
`$ref`s under `relations` ([frontmatter.md](../frontmatter.md)). Reserve `uses`
for something the path depends on that no step touches, and the standing
example is the environment the journey is described in:

```yaml
relations:
  uses:
    - /environment/production      # good — no step touches an environment
    - /product/shop/component/checkout   # redundant — step 1 already touches it
```

**Nothing points at a journey in v1.** No edge type accepts a journey target
except `supersedes` from another journey, and `measures` does not list
`journey` among its targets. The inbound view is derived instead: a component
page lists the journeys that touch it, an actor page lists the journeys it
stars in, and both come from `journey.yaml`, never from an authored back-edge.

**v1 limitations, stated rather than worked around:**

- There is no journey→capability edge. The portal still shows "the journeys
  that pass through" a capability ([capability.md](capability.md)), because that
  join is transitive — a step `touches` a component, and the component
  `realizes` the capability — but a journey that demonstrates a capability none
  of its touched entities realizes can only say so in prose and by sharing a
  `tag`. Adding a `demonstrates` edge later is an additive change to the closed
  edge set in [frontmatter.md](../frontmatter.md).
- There is no journey→journey edge for "continues", "variant of", or
  "alternative to". `supersedes` is the **swap** edge and using it for sibling
  paths would deprecate a live journey. Group variants with `tags` and link
  them in prose.
- There is no metric→journey edge, and `journey` owns no `metric/` bucket, so a
  drop-off number for a path attaches to the capability or component the path
  runs through. Extending `measures` to accept a journey is an additive change
  and a plausible v2.

## Entity directory shape

A journey entity is a directory holding exactly two files:

```text
solutions/acme/journey/place-an-order/
├── index.md        # REQUIRED  entity document (frontmatter + prose)
└── journey.yaml    # REQUIRED  the ordered path
```

Rules:

- The artifact filename is **bare and fixed**: `journey.yaml`. A file named
  `place-an-order.yaml`, `steps.yaml`, or `journey.yml` is not recognised and
  raises `W_JRN_ARTIFACT_UNKNOWN`.
- **`journey.yaml` is REQUIRED** (`E_JRN_ARTIFACT_MISSING`) — the one place
  this document diverges from [protocol.md](protocol.md), where every artifact
  is optional. A protocol with only `index.md` still asserts something
  machine-readable: its participants and its style are frontmatter. A journey's
  frontmatter says nothing about the path, so a journey without its artifact
  asserts nothing at all and is indistinguishable from a paragraph of prose. A
  path under design carries a short `journey.yaml` and `status: draft`.
- **Exactly one path per entity.** There is no `journeys/` subdirectory and no
  second file: two paths are two entities, which is the same rule the
  [no-branching](#no-branching-in-v1-and-why) section states from the other
  side. No subdirectories of any kind; per [structure.md](../structure.md) no
  `index.md` below the entity root.
- Additional `*.md` prose siblings are allowed and carry no machine semantics.
  Any other unrecognised file raises `W_JRN_ARTIFACT_UNKNOWN`.
- **The artifact carries no version of its own.** The entity's frontmatter
  `version` governs the whole directory; an entity version is a snapshot of all
  its files at one commit ([evolution.md](../evolution.md)). A `version:` key at
  the top level of `journey.yaml` is a shape violation (`E_JRN_SCHEMA`).
- **The `x-` escape hatch reaches into the artifact.** At the top level and
  inside a step, an unknown key is rejected unless it is prefixed `x-` — the
  same rule [frontmatter.md](../frontmatter.md) states for frontmatter and
  [protocol.md](protocol.md) states for its YAML artifacts.

  ```yaml
  - actor: /actor/customer
    touches: /product/shop/component/checkout
    x-channel: mobile-web      # tolerated, ignored by the portal
    channel: mobile-web        # E_JRN_SCHEMA
  ```

## The journey.yaml mini-spec

The precedent is the workflow mini-spec in [protocol.md](protocol.md), and the
conventions are deliberately the same: a flat list of steps, no ids, positional
keys, the `x-` hatch, and no key that exists only to be rendered. What differs
is stated as a divergence with its reason, so the two formats stay recognisably
one family.

### Top-level fields

| Field   | Type               | Required | Rule                                                                 |
| ------- | ------------------ | -------- | -------------------------------------------------------------------- |
| `name`  | kebab-case string  | yes      | MUST equal the entity's `name`, i.e. its directory name (`E_JRN_NAME`). |
| `steps` | list of step nodes | yes      | Between 2 and 12 entries inclusive (`E_JRN_STEP_COUNT`).             |

That is the whole top level. Two divergences from the workflow mini-spec:

- **`name` is checked against the entity, not against the filename stem.** The
  filename is fixed, so it can carry no identity; `name` exists for exactly one
  job, the one `x-srn` does for a schema ([datamodel.md](datamodel.md)) — a file
  copied into the wrong entity directory says so instead of silently becoming
  that entity's path.
- **No `title` and no `summary`.** A protocol has many workflows and each needs
  its own diagram heading. A journey entity has exactly one path, and
  `index.md` already carries `title` and `summary`; a second copy in the
  artifact would only drift.

### Step nodes

A step node is a mapping with these keys and no others (`E_JRN_SCHEMA`, or
`E_JRN_BRANCH` where the unknown key is branch-shaped):

| Field      | Type                                   | Required | Rule                                                                                        |
| ---------- | -------------------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `actor`    | SRN reference                          | yes      | MUST resolve to an `actor` (`E_JRN_ACTOR_KIND`). Who takes this step.                       |
| `touches`  | SRN reference                          | yes      | MUST resolve to a `component` or a `product` (`E_JRN_TOUCHES_KIND`). What they touch.       |
| `protocol` | SRN reference, or the literal `none`   | no       | MUST resolve to a `protocol` (`E_JRN_PROTOCOL_KIND`). How the step reaches what it touches. |
| `note`     | string, one line, ≤ 200 chars          | no       | Rendered as a note anchored to the step. Display only.                                      |

References are ordinary SRNs per [srn.md](../srn.md) — absolute or relative,
resolved from the entity's own directory, and never crossing into another
solution. Because a journey sits at solution level and points almost entirely
*outward*, the solution-absolute form (`/product/shop/component/checkout`) is
the readable one everywhere; a `..` chain from a journey directory is legal and
always worse. Version pins (`@N`) parse but SHOULD be omitted: a journey
describes the path as it is now, and a pinned component in a step would freeze
the description of a thing that is still moving.

```yaml
- actor: /actor/customer
  touches: /product/shop/component/checkout
  protocol: /product/shop/protocol/order-placement
  note: Submits the cart; this is the last step before money moves.
```

**Why `actor` is on every step**, when the entity already names one
protagonist. Three reasons, and they outweigh the repetition:

- A **hand-off must be impossible to overlook**. The steps another actor takes
  — a support agent, a courier, a release bot — are the ones a reader most
  needs to see, and a field that defaults is a field that hides its exceptions.
- Each row stays **self-contained for the renderer and for the diff**. A step
  moved, added, or reviewed in isolation carries its own subject, exactly as a
  workflow message carries its own `from` and `to` rather than inheriting them.
- The repetition is cheap: solution-absolute actor refs are short, and there is
  no alias table to keep in sync.

The protagonist MUST appear as the `actor` of at least one step
(`W_JRN_ACTOR_ABSENT`) — otherwise the entity claims to be one actor's path
while describing someone else's. Every other actor in the list is a
counterpart the path hands off to or waits on.

### Order, and the key of a step

The list order **is** the order. There is no `order` key, no step ids, no
timestamps, no durations.

The portal's stable key for a step is its **positional path**, `steps[3]`,
0-based — the same convention protocol workflows use for
`steps[4].alt[0].steps[2]`, minus the nesting a journey does not have. Diagram
elements, deep links, and source-line anchors are all keyed that way, which is
what lets the portal point at the *fifth step* of a journey without the author
inventing an identifier. Rendered ordinals are `i + 1`; the key stays 0-based
so that it matches the file.

Positional keys are stable **within a version, not across versions**: inserting
a step in the middle shifts the key of every later step. That is the accepted
cost of id-free authoring, and the entity's `version` bump is the signal that
anchors moved — a version is a snapshot of all the entity's files at one commit
([evolution.md](../evolution.md)).

### No branching in v1, and why

A journey is **exactly one linear sequence**. No alternative paths, no optional
steps, no loops, no parallelism — none of the three fragment forms a protocol
workflow has. A step key shaped like a branch (`alt`, `opt`, `loop`, `when`,
`otherwise`, `branches`, `parallel`) is `E_JRN_BRANCH` rather than a generic
schema error, because the code is the lesson: **a journey that branches is two
journeys.**

Two reasons, and the second is an acceptance criterion of this kind rather than
a preference:

- **The branches have different outcomes, and the outcome is what makes a
  journey worth naming.** "The order is placed" and "the card is declined and
  the basket is kept" are two paths a reader compares side by side, not one
  path with a fork. Folding them into one entity buries the comparison inside a
  YAML fragment and gives the pair a single name that is true of neither.
- **A legible derived diagram must be guaranteeable at any authoring input.**
  With a fragment grammar it is not: nesting compounds, compartments multiply,
  and the worst case grows with depth — which is why [protocol.md](protocol.md)
  has to cap its own nesting at 3 even for the far more detailed sequence
  diagram. A flat list has exactly one rendering, a ladder of N rows, and its
  worst case is a straight line. Diagram tractability is not something the
  portal has to defend here; the format makes it true.

What to do instead: write the second journey, and name the fork in the step
`note` of the step where the paths diverge, with a markdown link from the prose
of each to the other. Adding a fragment form later would be an additive spec
change, and it should have to argue against both reasons above.

### The step cap: 2 to 12

| Bound        | Value | Why                                                                                                                                                                                   |
| ------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| minimum      | 2     | A single step is a touch, not a path: nothing is ordered, nothing crosses, and the entity claims nothing the touched component's own page does not already say.                       |
| maximum      | 12    | The derived diagram is one ladder, one row per step, with a lane per product crossed. Twelve rows is where the ladder stops fitting one screen beside its lanes, and where a reader stops holding the sequence in mind. |

**Both bounds are errors, not warnings**, and that is deliberate: diagram
tractability is an explicit acceptance criterion of this kind, and a cap that
only warns is a cap every catalog eventually ignores. The cap also does a
second job — it keeps journeys **comparable**. Two twelve-step paths can be read
side by side; a twelve-step path next to a forty-step path cannot.

A path that genuinely needs a thirteenth step almost always contains more than
one outcome. Cut it at the outcome boundary — the step where the actor has got
what they came for — and let the second journey start there, touching the same
entity the first one ended on. If the cap still binds after the cut, the steps
are too fine-grained: a journey step is "the customer pays", not "the customer
enters a card number".

### Deliberately not supported

No branching or fragments (above). No step ids. No timings, durations, SLAs, or
volumes — those are metrics ([metric.md](metric.md)). No channel or device
field. No emotion, pain-point, or satisfaction scoring — that is a CX research
artifact, and the catalog describes the system, not the study. No step-level
`status`. No sub-journey invocation. No payload references: a step names *what*
is touched and *how*, and what flows over the wire is the protocol's business,
where payload binding already exists ([protocol.md](protocol.md)).

Each of these is what turns a path into a process model or a research
deliverable. Where one is genuinely needed in v1: a `note`, a `tag`, or an `x-`
key that the portal ignores.

### Crossing a product boundary

This is the check the kind exists for, so its definition is mechanical.

Every legal `touches` target has exactly one **owning product**: the
`product/{name}` pair at the head of its pair chain. That holds because a
`component` bucket may not sit at solution level, so every component's chain
begins with a product ([srn.md](../srn.md), [structure.md](../structure.md)).
The comparison is over whole `{kind}/{name}` **pairs**, never over raw
segments — the same pair walk that fixes a protocol's nearest common ancestor.

| `touches`                                                    | Owning product   |
| ------------------------------------------------------------ | ---------------- |
| `/product/shop`                                              | `product/shop`   |
| `/product/shop/component/checkout`                           | `product/shop`   |
| `/product/shop/component/checkout/component/payment`         | `product/shop`   |
| `/product/billing/component/ledger`                          | `product/billing`|

**Steps `i-1` and `i` cross a product boundary when their owning products
differ.** Step 0 has no predecessor and is never a crossing.

A crossing whose step names no `protocol` is
`W_JRN_UNDOCUMENTED_INTEGRATION`: the path leaves one product and arrives in
another, and the catalog contains no statement of how. It is a warning, not an
error, because the missing protocol may be genuinely unwritten — which is
exactly the finding, and the fix is a new protocol entity, not an edit to the
journey.

`protocol: none` is the **documented negative**: the actor carries the crossing
themselves and there is no system conversation to describe — the customer
re-types a tracking number into a courier's site, or opens a link from an
email. It silences the warning and, unlike an omission, it is a claim: a
reviewer can grep for `protocol: none` and audit every hop the solution is
asserting nobody automated. An omitted `protocol` means "not written down
yet"; `none` means "there is nothing to write down". The distinction is the
reason the field has three states rather than two.

One consistency check on the positive case, `W_JRN_PROTOCOL_UNRELATED`: the
protocol a step names SHOULD list, among its `participants`
([protocol.md](protocol.md)), either the entity this step `touches` or the
entity the previous step touched — where a participant matches if it *is* that
entity, *contains* it, or *is contained by* it. A protocol that touches neither
end of the hop is not documenting the hop, and the usual cause is a copy-paste
from the step above.

```yaml
- actor: /actor/customer
  touches: /product/shop/component/checkout/component/payment
  protocol: /product/shop/protocol/order-placement
- actor: /actor/customer
  touches: /product/billing/component/ledger
  protocol: /protocol/settlement          # shop -> billing, documented: the
                                          # settlement bus lists payment and ledger
- actor: /actor/customer
  touches: /product/fulfilment/component/tracking
                                          # billing -> fulfilment, W_JRN_UNDOCUMENTED_INTEGRATION
```

## Worked example

`solutions/acme/journey/place-an-order/index.md`:

```markdown
---
name: place-an-order
kind: journey
version: 1
title: Place an order
summary: The customer's path from signing in to seeing a parcel marked delivered.
status: review
owner: team-commerce
actor: /actor/customer
relations:
  uses:
    - /environment/production
tags:
  - commerce
  - cross-product
---

The path the shop is built around, end to end: sign in, pay, get an invoice,
watch the parcel arrive. It crosses four products, which is the point — every
one of those crossings is a place where the description of the solution could
be true in each product and false between them.

## Outcome

The customer holds the parcel and can see, without contacting support, what
they paid and when it arrived.

## Preconditions

The customer has an account. Guest checkout is a different path — see
[guest-checkout](srn://acme/product/shop/requirement/guest-checkout).

## Out of scope

Returns and refunds, which start where this journey ends and are their own
path.
```

`solutions/acme/journey/place-an-order/journey.yaml`:

```yaml
name: place-an-order
steps:
  - actor: /actor/customer
    touches: /product/identity/component/authentication
    protocol: /product/identity/protocol/authorization-check
    note: Signs in; the session everything downstream trusts is issued here.

  - actor: /actor/customer
    touches: /product/shop/component/checkout
    # identity -> shop, no protocol: W_JRN_UNDOCUMENTED_INTEGRATION.
    # The warning is real against today's acme catalog — checkout trusts an
    # identity session and no protocol entity says how it travels. The fix is
    # that protocol, not a change here.

  - actor: /actor/customer
    touches: /product/shop/component/checkout/component/payment
    protocol: /product/shop/protocol/order-placement
    note: Pays. The last step the customer can retry without help.

  - actor: /actor/customer
    touches: /product/billing/component/ledger
    protocol: /protocol/settlement
    # shop -> billing, documented: settlement lists payment and ledger.
    note: Opens the invoice; the settlement bus is what put it there.

  - actor: /actor/customer
    touches: /product/fulfilment/component/tracking
    protocol: none
    # billing -> fulfilment, deliberately actor-carried.
    note: Follows the tracking link from the confirmation mail — nothing flows
      between billing and fulfilment to make this work.

  - actor: /actor/courier
    touches: /product/fulfilment/component/carrier-gateway
    protocol: /product/fulfilment/protocol/tracking-events
    note: The one step the customer does not take, and the one that moves the
      parcel's state.

  - actor: /actor/customer
    touches: /product/fulfilment/component/tracking
    protocol: /product/fulfilment/protocol/tracking-events
    note: Sees "delivered". The journey ends whether or not anyone tells support.
```

Seven steps, three product crossings: one documented by `/protocol/settlement`,
one deliberately actor-carried, one undocumented — and that last row is why the
kind exists. The hand-off at `steps[5]` is why `actor` is written on every step
rather than defaulted: it is the step a reader most needs to notice, and it
would be invisible by inheritance.

Counter-examples, all in `journey.yaml`:

```yaml
name: placing-an-order          # E_JRN_NAME — the entity directory is place-an-order
steps:
  - actor: /actor/customer
    touches: /product/shop/protocol/order-placement   # E_JRN_TOUCHES_KIND — a protocol
                                                      # is how, not what
  - actor: /product/shop/component/checkout           # E_JRN_ACTOR_KIND — not an actor
    touches: /product/shop/component/inventory
  - actor: /actor/customer
    touches: /product/shop/component/checkout
    alt:                                              # E_JRN_BRANCH — a journey that
      - when: card declined                           # branches is two journeys
        steps: []
  - actor: /actor/customer
    touches: /product/shop/component/checkout
    channel: mobile-web                               # E_JRN_SCHEMA — unknown key;
                                                      # write x-channel, or a note
  - actor: /actor/customer
    touches: /product/billing/component/ledger
    protocol: /product/shop/datamodel/order-request   # E_JRN_PROTOCOL_KIND
  - actor: /actor/support-agent
    touches: /product/identity/product/crm            # E_SRN_PLACEMENT — a product cannot
                                                      # own a product; the ref never resolves
```

## Evolution

The journey's contract surface is **the ordered step list**: each step's
`actor` and `touches`, and their order. `note`, `protocol`, `tags`, `status`,
prose, and relations are metadata — they still bump `version`, but they are not
bound by the non-reduction rule ([evolution.md](../evolution.md)).

| Change                                                              | Contract surface? | Consequence                                                            |
| ------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------- |
| Adding a step, anywhere in the list                                 | additive          | Legal at `version: N+1`. Positional keys of later steps shift; that is what the version bump announces. |
| Adding or changing a `note`; adding a `protocol` to an existing step | no                | Metadata: bump `version`, no swap. Naming a protocol that was already carrying the hop is the normal way a `W_JRN_UNDOCUMENTED_INTEGRATION` is cleared. |
| Repointing `touches` or `actor` on an existing step                 | yes               | The path now claims something else happened. Swap.                     |
| Removing a step                                                     | yes               | A narrowing, forbidden in place. Swap.                                 |
| Reordering steps                                                    | yes               | Order **is** the entity here — unlike a protocol workflow, where step order is metadata among several artifacts. A reordered path is a different path. Swap. |
| Changing the frontmatter `actor`                                    | yes               | The same route walked by someone else is a different journey. Swap.    |

The swap is the ordinary one ([evolution.md](../evolution.md)): a new journey
entity that `supersedes` the old, then the old set to `status: deprecated`. It
is never deleted — a path the solution used to promise is exactly the thing
someone will ask about next quarter.

```yaml
# solutions/acme/journey/place-an-order-with-wallet/index.md
version: 1
status: draft
actor: /actor/customer
relations:
  supersedes:
    - ../place-an-order        # sibling journey in the same bucket
```

## Validation rules

| #      | Rule                                                                                          | Class                             |
| ------ | --------------------------------------------------------------------------------------------- | --------------------------------- |
| JRN1   | The `journey/` bucket is a direct child of a solution directory.                              | `E_SRN_PLACEMENT`                 |
| JRN2   | `actor` is present in frontmatter.                                                            | `E_FM_SCHEMA`                     |
| JRN3   | `actor` appears only on `kind: journey` entities.                                             | `E_FM_UNKNOWN_FIELD`              |
| JRN4   | `journey.yaml` exists in the entity directory.                                                | `E_JRN_ARTIFACT_MISSING`          |
| JRN5   | `journey.yaml` parses and matches the field tables above (unknown non-`x-` key, bad type).    | `E_JRN_SCHEMA`                    |
| JRN6   | `name` equals the entity's directory name.                                                    | `E_JRN_NAME`                      |
| JRN7   | `steps` has between 2 and 12 entries.                                                         | `E_JRN_STEP_COUNT`                |
| JRN8   | No step carries a branch-shaped key (`alt`, `opt`, `loop`, `when`, `otherwise`, `branches`, `parallel`). | `E_JRN_BRANCH`          |
| JRN9   | No unrecognised file in the entity directory.                                                 | `W_JRN_ARTIFACT_UNKNOWN`          |
| JRN10  | The frontmatter `actor`, and every step `actor`, resolves to an `actor`.                      | `E_SRN_DANGLING` / `E_JRN_ACTOR_KIND` |
| JRN11  | Every `touches` resolves to a `component` or `product`.                                       | `E_SRN_DANGLING` / `E_JRN_TOUCHES_KIND` |
| JRN12  | Every `protocol` is the literal `none` or resolves to a `protocol`.                           | `E_SRN_DANGLING` / `E_JRN_PROTOCOL_KIND` |
| JRN13  | The frontmatter `actor` is the `actor` of at least one step.                                  | `W_JRN_ACTOR_ABSENT`              |
| JRN14  | Consecutive steps whose owning products differ name a `protocol` (an SRN or `none`).          | `W_JRN_UNDOCUMENTED_INTEGRATION`  |
| JRN15  | A step's named protocol lists this step's or the previous step's `touches` among its participants. | `W_JRN_PROTOCOL_UNRELATED`    |

JRN1–JRN9 are checkable from the entity alone; JRN10–JRN15 need the resolved
catalog. Common SRN rules — syntax, dangling targets, cross-solution sealing —
apply to every reference in `journey.yaml` unchanged ([srn.md](../srn.md)).

## What the portal derives

```text
+-------------------------+       +-----------------------------------+
| index.md                | ----> | journey card, protagonist badge   |
| journey.yaml            | ----> | ordered step ladder, diagram      |
| journey.yaml (touches)  | ----> | "appears in journeys" inverses    |
| journey.yaml (crossings)| ----> | integration-gap panel             |
+-------------------------+       +-----------------------------------+
```

- **Journey page** — the protagonist, the prose, and the step ladder: one row
  per step, ordinal, actor, touched entity, protocol chip, note. Rows whose
  actor is not the protagonist render as hand-offs.
- **Journey diagram** — the ladder drawn with a band per product, so a crossing
  is a visible change of band. A documented crossing carries its protocol on the
  hop; an actor-carried one (`protocol: none`) is dashed; an undocumented one is
  flagged. This is the diagram the flat format exists to guarantee.
- **Integration-gap panel** on the solution dashboard — every
  `W_JRN_UNDOCUMENTED_INTEGRATION` in the solution, in one list. It is the
  cross-product surface nobody has written a protocol for, and it is the number
  this kind contributes to the dashboard alongside the requirement kind's
  unmet-`must` count ([requirement.md](requirement.md)).
- **"Appears in journeys"** on component and product pages — derived from
  `touches`, never authored, with the step ordinal so a reader lands on the
  right row.
- **"Journeys"** on the actor page — every journey this actor stars in, plus
  every journey it merely appears in as a hand-off, kept apart. Together with
  the actor's `goals` ([actor.md](actor.md)) that page becomes the answer to
  "what does this actor do here".
- **Crossing count per journey** — how many product boundaries a path crosses,
  and how many of them are documented. A coupling signal that needs no new
  authoring.
- **Protocol cross-reference** — a protocol page lists the journey steps that
  name it, which is the human-scale answer to "who actually walks this
  conversation".
- **Capability cross-reference** — the "journeys that pass through this
  capability" list on a capability page ([capability.md](capability.md)) is a
  two-hop join, `touches` then `realizes`, and is derived like every other
  inverse. It is why the view needs no journey→capability edge, and also why it
  reports only the capabilities the touched entities themselves claim.

## Journey error classes

New codes introduced by this document. Codes from [srn.md](../srn.md),
[structure.md](../structure.md), [frontmatter.md](../frontmatter.md), and
[evolution.md](../evolution.md) apply unchanged — in particular `E_FM_SCHEMA`
covers every type violation of the frontmatter field added here, and
`E_SRN_DANGLING` covers every unresolvable reference.

| Code                             | Meaning                                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `E_JRN_ARTIFACT_MISSING`         | The journey entity directory has no `journey.yaml`.                                                         |
| `E_JRN_SCHEMA`                   | `journey.yaml` fails its schema (shape, types, unknown non-`x-` key, a top-level `version:`).               |
| `E_JRN_NAME`                     | `journey.yaml` `name` ≠ the entity's directory name.                                                        |
| `E_JRN_STEP_COUNT`               | Fewer than 2 or more than 12 steps.                                                                         |
| `E_JRN_BRANCH`                   | A step carries a branch-shaped key. A journey that branches is two journeys.                                |
| `E_JRN_ACTOR_KIND`               | The frontmatter `actor`, or a step's `actor`, resolves to a kind other than `actor`.                        |
| `E_JRN_TOUCHES_KIND`             | A `touches` reference resolves to a kind other than `component` or `product`.                               |
| `E_JRN_PROTOCOL_KIND`            | A `protocol` reference is neither the literal `none` nor an SRN resolving to a `protocol`.                  |
| `W_JRN_UNDOCUMENTED_INTEGRATION` | Consecutive steps cross a product boundary and the later one names no protocol — an integration nobody wrote down. |
| `W_JRN_PROTOCOL_UNRELATED`       | A step's protocol lists neither end of the hop among its participants.                                      |
| `W_JRN_ACTOR_ABSENT`             | The frontmatter protagonist takes none of the steps.                                                        |
| `W_JRN_ARTIFACT_UNKNOWN`         | Unrecognised file in the journey entity directory.                                                          |

All are enforced by the catalog loader, which `metaframework check` runs.
