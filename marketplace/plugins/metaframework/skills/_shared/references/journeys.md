# Journeys — the `journey.yaml` ordered path

> Distilled from `framework/spec/kinds/journey.md` (version 5). **When
> `framework/spec/` is present in the repository, it is authoritative and wins
> over this file.** This bundled copy exists because an installed plugin cannot
> see the repo spec — the same reason `protocols.md` exists.
>
> Placement (solution-level only) is in `structure.md`; the frontmatter `actor`
> field is in `frontmatter.md`. This file carries what only `kinds/journey.md`
> says: the `journey.yaml` mini-spec, its artifact address, the no-branching
> rule, the step cap, the product-crossing check, and the `E_JRN_*` codes.

A **journey** is one actor's path across the solution, in order: the things that
actor touches, from first contact to outcome, as a flat ordered list. It is the
one kind that reads *across* containment — every other entity describes what sits
inside some container, and a journey deliberately does not.

That is the whole reason it exists. Containment is the organising principle of
the catalog and it has one blind spot: nobody owns the path an actor takes,
because the path is precisely what leaves each container. Three things follow:

1. **The cross-product surface becomes enumerable** — `ls solutions/acme/journey/`
   is the list of paths the solution promises.
2. **Undocumented integrations become findable.** A step landing in a different
   product from the step before it is a hand-off; if no protocol says how, the
   journey has found an integration nobody wrote down
   (`W_JRN_UNDOCUMENTED_INTEGRATION`). This is the single most valuable thing the
   ontology gains from the kind.
3. **An actor's `goals` get a demonstrable route**, expressed in entities that
   exist.

## What a journey is NOT

| Not a…            | Because                                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **protocol**      | A protocol is *one* exchange between named participants, with message-level fidelity (`protocols.md`). A journey spans many and describes none; it *names* one per step and moves on. |
| **workflow file** | `workflows/*.yaml` lives inside a protocol and speaks that protocol's aliases. A journey speaks in SRNs, crosses protocol boundaries, and has no aliases.                             |
| **requirement**   | A journey states no obligation. Nothing `implements` it, it has no acceptance criteria, it is never a `must`. A step note containing "must" is a requirement in the wrong file.       |
| **capability**    | A capability is what the business can do, standing still. A journey is one route by which some capability reaches one actor.                                                          |
| **metric**        | Completion rate, drop-off, elapsed time are a metric. A journey carries no measurement, no timing, no volume.                                                                         |
| **process model** | No branching, gateways, swimlanes, parallelism or compensation. Those turn a path into BPMN.                                                                                          |
| **runtime trace** | Steps are described positions, not observed events. What actually happened is telemetry, and telemetry has no SRN.                                                                    |

**And a journey is not an Arazzo workflow.** That is the *workflow file* row
asked again about a format rather than about a kind, and it gets the same
answer. The Arazzo Specification is the industry standard for exactly the
artifact that row fences off — one executor chaining API calls, grounded in an
OpenAPI or AsyncAPI description — and for that artifact it is the right format.
It is not a format for an actor's path across touchpoints, and adopting it here
would cost the kind the check it exists for. `actor` and `touches` have no
Arazzo carrier beyond an `x-` extension, and those two fields *are* the
mechanism of `W_JRN_UNDOCUMENTED_INTEGRATION` (below): the flagship check would
then run entirely on data the standard's own tooling is obliged to ignore. In
the other direction Arazzo requires what a journey does not have — a
`sourceDescriptions` list with at least one entry, a `stepId` on every step, and
on each step an `operationId`, `operationPath`, or `workflowId` naming the call
it makes. `steps[5]` of the worked example below is a customer clicking a
tracking link in an email, `protocol: none`; writing it as an Arazzo step means
fabricating a source description, an operation to call, and an identifier for
it, for a hop whose entire content is that no system carries it.
`onSuccess`/`onFailure` step transitions would re-import the branching the
no-branching rule below forbids, at the moment the format was adopted to buy
interoperability.

There is no industry machine format for an actor's path to adopt instead. That
absence is the reason the kind specifies a mini-spec at all, and it is a finding
rather than an oversight — the nearest candidate, mermaid's `journey` diagram
type, was evaluated separately and rejected for the same class of reason: its
syntax requires a satisfaction score on every task, a number the catalog does
not have and that *Deliberately not supported* below rules out by name. The
portal draws a `flowchart TD` instead. Both questions are closed. A journey is
written in the mini-spec below; Arazzo, wherever this catalog adopts it, is a
protocol's artifact and never a journey's.

## Entity directory shape

```text
solutions/acme/journey/first-purchase/
├── index.md        # REQUIRED  frontmatter + prose
└── journey.yaml    # REQUIRED  the ordered path
```

- The artifact filename is **bare and fixed**: `journey.yaml`. A
  `first-purchase.yaml`, `steps.yaml` or `journey.yml` is not recognised —
  `W_JRN_ARTIFACT_UNKNOWN`.
- **`journey.yaml` is REQUIRED** (`E_JRN_ARTIFACT_MISSING`), and this is the one
  place the kind diverges from `protocol`, where every artifact is optional. A
  protocol with only `index.md` still asserts something machine-readable — its
  participants and its style are frontmatter. A journey's frontmatter says
  nothing about the path, so a journey without its artifact asserts nothing at
  all. A path under design carries a short `journey.yaml` and `status: draft`.
- **Exactly one path per entity.** No `journeys/` subdirectory, no second file,
  no subdirectories at all. Two paths are two entities — the same rule the
  no-branching section states from the other side.
- Extra `*.md` prose siblings are fine and carry no machine semantics; anything
  else unrecognised warns.
- **The artifact carries no version of its own.** The entity's frontmatter
  `version` governs the whole directory; a top-level `version:` key here is
  `E_JRN_SCHEMA`.
- The **`x-` escape hatch** reaches into the artifact, at the top level and
  inside a step:

  ```yaml
  - actor: /actor/customer
    touches: /product/shop/component/checkout
    x-channel: mobile-web      # tolerated, ignored by the portal
    channel: mobile-web        # E_JRN_SCHEMA
  ```

  The one framework-owned key the file may carry, the `$schema` dialect header,
  is admitted **by name** at the top level and is therefore not an unknown key
  (below).

## Artifact address

`journey.yaml` is SRN-addressable by a dot suffix on the entity (`srn.md`
reference): `srn://acme/journey/first-purchase.journey`. `@N` on such an
address is the **entity's** version — the artifact has no clock of its own, so
`….journey@1` means the file inside snapshot v1. Any other suffix on a journey
is `E_SRN_ARTIFACT`; a `.journey` address whose file is absent is
`E_SRN_DANGLING` at the SRN layer (and the entity is already broken,
`E_JRN_ARTIFACT_MISSING`).

The address is a citation — legal in prose links and for external consumers —
never an entity reference, and no step field accepts one: `actor`, `touches`,
and `protocol` mean entities. A suffix that is illegal vocabulary for the kind
it names fails as `E_SRN_ARTIFACT`; one that is legal for a wrong kind
(`touches: …/protocol/order-placement.transport`) survives the role table and
is rejected under the surface's own class — `E_JRN_ACTOR_KIND`,
`E_JRN_TOUCHES_KIND`, `E_JRN_PROTOCOL_KIND` — with a message naming the
suffix (rule JRN16 in the spec).

## The mini-spec

The precedent is the workflow mini-spec in `protocols.md`, and the conventions
are deliberately the same: a flat list of steps, no ids, positional keys, the
`x-` hatch, and no key that exists only to be rendered.

### Top level

| Field   | Type               | Required | Rule                                                                    |
| ------- | ------------------ | -------- | ----------------------------------------------------------------------- |
| `name`  | kebab-case string  | yes      | MUST equal the entity's `name`, i.e. its directory name (`E_JRN_NAME`). |
| `steps` | list of step nodes | yes      | Between 2 and 12 entries inclusive (`E_JRN_STEP_COUNT`).                |

That is the whole top level of the path itself; the `$schema` dialect header
sits above it (below). Two divergences from the workflow mini-spec, both
deliberate:

- **`name` is checked against the entity, not the filename stem.** The filename
  is fixed, so it carries no identity. `name` does the job `x-srn` does for a
  schema: a file copied into the wrong entity directory says so, instead of
  silently becoming that entity's path.
- **No `title` and no `summary`.** A protocol has many workflows and each needs
  its own diagram heading. A journey entity has exactly one path, and `index.md`
  already carries both; a second copy would only drift.

### The dialect header

`journey.yaml` declares, in its own bytes, which grammar it is written in, under
a top-level `$schema` holding the canonical `$id` of the `journey-document`
meta-schema. The cross-kind contract behind that sentence — every role's key, the
warning class, the strip rule — is in `structure.md`; what follows is the journey
half:

```yaml
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/journey-document
name: place-an-order
steps:
  - actor: /actor/customer
    touches: /product/identity/component/authentication
```

No `@version` on the URL: it names the **grammar the file is written in**, never
a revision of the file — the artifact has no clock of its own, and a top-level
`version:` is still `E_JRN_SCHEMA`.

**`$schema` is framework-owned and admitted by name at the top level, so it is
not an unknown key**: the `x-` rule never meets it and `E_JRN_SCHEMA` does not
fire on it there. The loader records the dialect and deletes the key before the
mini-spec parser is handed the document; the bytes are untouched, so
`/artifacts` still serves the file as authored. Admission is at the top level
**only** — a step is not an artifact root, so `$schema` inside a step is
`E_JRN_SCHEMA` exactly like `channel:`.

A file with no header, or one naming a dialect that is not recognised for the
`journey` role, is read as the **legacy dialect** — the format described here —
and warned, never broken: `W_ARTIFACT_DIALECT`, a cross-kind class, raised on
the journey entity and pathed at `journey.yaml`. Adding the header is a content
change to the artifact: it bumps the entity's `version`, and it is never a swap,
because the ordered step list is untouched.

### Step nodes

A mapping with these keys and no others (`E_JRN_SCHEMA`, or `E_JRN_BRANCH` where
the unknown key is branch-shaped):

| Field      | Type                                 | Required | Rule                                                                                        |
| ---------- | ------------------------------------ | -------- | ------------------------------------------------------------------------------------------- |
| `actor`    | SRN reference                        | yes      | MUST resolve to an `actor` (`E_JRN_ACTOR_KIND`). Who takes this step.                       |
| `touches`  | SRN reference                        | yes      | MUST resolve to a `component` or a `product` (`E_JRN_TOUCHES_KIND`). What they touch.       |
| `protocol` | SRN reference, or the literal `none` | no       | MUST resolve to a `protocol` (`E_JRN_PROTOCOL_KIND`). How the step reaches what it touches. |
| `note`     | string, one line, ≤ 200 chars        | no       | Rendered as a note anchored to the step. Display only.                                      |

```yaml
- actor: /actor/customer
  touches: /product/shop/component/checkout
  protocol: /product/shop/protocol/order-placement
  note: Submits the cart; this is the last step before money moves.
```

References are ordinary SRNs (`srn.md`) — absolute or relative, resolved from the
entity's own directory, never crossing into another solution. Because a journey
sits at solution level and points almost entirely *outward*, the
solution-absolute form (`/product/shop/component/checkout`) is the readable one
everywhere; a `..` chain from a journey directory is legal and always worse.
Version pins (`@N`) parse but SHOULD be omitted: a journey describes the path as
it is now, and a pinned component would freeze the description of a thing that is
still moving.

**Why `actor` is on every step**, when the entity already names one protagonist:

- A **hand-off must be impossible to overlook**. The steps another actor takes —
  a support agent, a courier, a release bot — are the ones a reader most needs to
  see, and a field that defaults is a field that hides its exceptions.
- Each row stays **self-contained for the renderer and for the diff**, exactly as
  a workflow message carries its own `from` and `to` rather than inheriting them.
- The repetition is cheap: solution-absolute actor refs are short and there is no
  alias table to keep in sync.

The frontmatter protagonist MUST be the `actor` of at least one step
(`W_JRN_ACTOR_ABSENT`) — otherwise the entity claims to be one actor's path while
describing someone else's. Every other actor in the list is a counterpart the
path hands off to or waits on.

### Order, and the key of a step

The list order **is** the order. No `order` key, no step ids, no timestamps, no
durations.

The portal's stable key is the **positional path**, `steps[3]`, 0-based — the same
convention protocol workflows use, minus the nesting a journey does not have.
Diagram elements, deep links and source anchors are all keyed that way, which is
what lets the portal point at the *fifth step* without the author inventing an
identifier. Rendered ordinals are `i + 1`; the key stays 0-based so it matches
the file.

Positional keys are stable **within a version, not across versions**: inserting a
step in the middle shifts every later key. That is the accepted cost of id-free
authoring, and the entity's `version` bump is the signal that anchors moved.

### No branching in v1 — a journey that branches is two journeys

A journey is **exactly one linear sequence**. No alternative paths, no optional
steps, no loops, no parallelism — none of the three fragment forms a protocol
workflow has. A branch-shaped step key (`alt`, `opt`, `loop`, `when`,
`otherwise`, `branches`, `parallel`) is `E_JRN_BRANCH` rather than a generic
schema error, because the code is the lesson.

Two reasons, and the second is an acceptance criterion of the kind rather than a
preference:

- **The branches have different outcomes, and the outcome is what makes a journey
  worth naming.** "The order is placed" and "the card is declined and the basket
  is kept" are two paths a reader compares side by side, not one path with a
  fork. Folding them into one entity buries the comparison inside a YAML fragment
  and gives the pair a single name that is true of neither.
- **A legible derived diagram must be guaranteeable at any authoring input.**
  With a fragment grammar it is not: nesting compounds and the worst case grows
  with depth, which is why the protocol workflow format has to cap its nesting at
  3 even for the far more detailed sequence diagram. A flat list has exactly one
  rendering — a ladder of N rows — and its worst case is a straight line.

What to do instead: write the second journey, name the fork in the step `note` of
the step where the paths diverge, and link the two from each other's prose.

### The step cap: 2 to 12

| Bound   | Value | Why                                                                                                                                                                                                    |
| ------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| minimum | 2     | A single step is a touch, not a path: nothing is ordered, nothing crosses, and the entity claims nothing the touched component's own page does not.                                                    |
| maximum | 12    | The derived diagram is one ladder, one row per step, with a band per product crossed. Twelve rows is where the ladder stops fitting one screen, and where a reader stops holding the sequence in mind. |

**Both bounds are errors, not warnings.** Diagram tractability is an explicit
acceptance criterion of this kind, and a cap that only warns is a cap every
catalog eventually ignores. The cap also keeps journeys **comparable**: two
twelve-step paths can be read side by side; a twelve-step path next to a
forty-step path cannot.

A path that genuinely needs a thirteenth step almost always contains more than
one outcome. Cut it at the outcome boundary — the step where the actor has got
what they came for — and let the second journey start there, touching the entity
the first one ended on. If the cap still binds after the cut, the steps are too
fine-grained: a journey step is "the customer pays", not "the customer enters a
card number".

### Deliberately not supported

No branching or fragments. No step ids. No timings, durations, SLAs or volumes —
those are metrics. No channel or device field. No emotion, pain-point or
satisfaction scoring — the catalog describes the system, not the CX study. No
step-level `status`. No sub-journey invocation. No payload references: a step
names *what* is touched and *how*, and what flows over the wire is the protocol's
business, where payload binding already exists.

Each of these is what turns a path into a process model or a research
deliverable. Where one is genuinely needed: a `note`, a `tag`, or an `x-` key the
portal ignores.

## Crossing a product boundary — the check the kind exists for

Every legal `touches` target has exactly one **owning product**: the
`product/{name}` pair at the head of its pair chain. That holds because a
`component` bucket may not sit at solution level, so every component's chain
begins with a product. The comparison is over whole `{kind}/{name}` **pairs**,
never raw segments — the same pair walk that fixes a protocol's NCA.

| `touches`                                            | Owning product    |
|------------------------------------------------------|-------------------|
| `/product/shop`                                      | `product/shop`    |
| `/product/shop/component/checkout`                   | `product/shop`    |
| `/product/shop/component/checkout/component/payment` | `product/shop`    |
| `/product/billing/component/ledger`                  | `product/billing` |

**Steps `i-1` and `i` cross a product boundary when their owning products
differ.** Step 0 has no predecessor and is never a crossing.

A crossing whose step names no `protocol` is `W_JRN_UNDOCUMENTED_INTEGRATION`:
the path leaves one product and arrives in another, and the catalog contains no
statement of how. A warning, not an error, because the missing protocol may be
genuinely unwritten — which is exactly the finding, and the fix is a new protocol
entity, not an edit to the journey.

`protocol: none` is the **documented negative**: the actor carries the crossing
themselves and there is no system conversation to describe — the customer
re-types a tracking number into a courier's site, or opens a link from an email.
It silences the warning and, unlike an omission, it is a *claim*: a reviewer can
grep for `protocol: none` and audit every hop the solution asserts nobody
automated. An omitted `protocol` means "not written down yet"; `none` means
"there is nothing to write down". That is why the field has three states.

One consistency check on the positive case, `W_JRN_PROTOCOL_UNRELATED`: the
protocol a step names SHOULD list, among its `participants`, either the entity
this step `touches` or the entity the previous step touched — a participant
matches if it *is*, *contains*, or *is contained by* that entity. A protocol
touching neither end of the hop is not documenting the hop, and the usual cause
is a copy-paste from the step above.

## Worked example

`solutions/acme/journey/first-purchase/journey.yaml` — eight steps, three product
crossings, and every one of them carried by the customer.

```yaml
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/journey-document
name: first-purchase
steps:
  - actor: /actor/customer
    touches: /product/shop
    note: Browses. The product itself is what is touched — no component below shop
      claims the storefront, and the basket does not exist yet.

  - actor: /actor/customer
    touches: /product/identity/component/registration
    protocol: none
    # shop -> identity, carried by the customer: they follow a link and type.
    note: Creates the account and its first credential. Nothing passed from the
      storefront to get them here.

  - actor: /actor/customer
    touches: /product/identity/component/authentication
    protocol: /product/identity/protocol/authorization-check
    note: Signs in. The session issued here is the one every product downstream
      is willing to trust.

  - actor: /actor/customer
    touches: /product/shop/component/checkout
    protocol: none
    # identity -> shop, carried by the customer: the opaque token rides in the
    # browser. What checkout then does with it is not described anywhere — see
    # index.md, which is the only place that fact can currently be written.
    note: Returns to the basket, now as somebody with an account.

  - actor: /actor/customer
    touches: /product/shop/component/checkout/component/payment
    protocol: /product/shop/protocol/order-placement
    note: Pays. The last step the customer can retry alone, and the one that
      publishes the fact everything after this reacts to.

  - actor: /actor/customer
    touches: /product/fulfilment/component/tracking
    protocol: none
    # shop -> fulfilment, carried by the customer: the tracking link in the
    # confirmation mail. Shop does not know fulfilment exists.
    note: Opens tracking for the first time, usually before there is anything to
      see.

  - actor: /actor/courier
    touches: /product/fulfilment/component/carrier-gateway
    protocol: /product/fulfilment/protocol/tracking-events
    note: Hands the parcel over and scans it. The only step in this path that a
      person acme does not employ performs, and the only one that moves a parcel.

  - actor: /actor/customer
    touches: /product/fulfilment/component/tracking
    protocol: /product/fulfilment/protocol/tracking-events
    note: Sees "delivered". The path ends here whether or not anyone was told.
```

Read the three `protocol: none` rows first. They are the documented negative, and
here they are a substantive claim about acme rather than a shrug: the customer
follows a link and types (`steps[1]`), carries an opaque session token back in
their browser (`steps[3]`), and clicks a tracking link in a mail (`steps[5]`).
Nothing systemic passes between the products at any of those three points. Had
any of them simply omitted `protocol`, the catalog would be saying "we have not
written this down yet", which is a different and much weaker statement.

The entity's `index.md` then does the part no artifact can: it says what the
`none` at `steps[3]` does **not** cover — that checkout receives a token, that
what it does with it is described nowhere, and that checkout declares no edge
toward the authorization protocol. A journey that finds a gap it cannot close
says so; it does not silence itself.

`steps[6]` belongs to the courier, not to the protagonist. That hand-off is why
`actor` is written on every step rather than defaulted: it is the row a reader
most needs to notice, and inheritance would hide it. The protagonist still takes
seven of the eight, satisfying `W_JRN_ACTOR_ABSENT`.

`steps[0]` touches `/product/shop` — the **product**, because no component below
it claims the storefront and the basket does not exist yet. A `touches` may name
a product or a component, and nothing else.

Counter-examples, all in `journey.yaml`:

```yaml
name: first-purchases           # E_JRN_NAME — the entity directory is first-purchase
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
```

## Relations — a journey is a leaf in both directions

| Edge                                  | From a journey                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `uses`                                | Legal toward a datamodel, protocol, environment or component — but see the anti-duplication rule below. |
| `supersedes`                          | Legal, toward another journey — the successor of a path that could not be extended.                     |
| `exposes`, `depends-on`, `implements` | Not available: their legal source kinds are component/product. `E_FM_EDGE_SOURCE`.                      |
| `realizes`                            | Not available from a journey. A journey does not realize a capability, it demonstrates one.             |

**Do not mirror the artifact into `relations`.** Every component, product and
protocol a journey touches is already named in `journey.yaml`, and the portal
derives the touch graph from there. Repeating them as `uses` edges is double
bookkeeping that drifts — the same reason a datamodel does not repeat its `$ref`s
under `relations`. Reserve `uses` for something the path depends on that no step
touches, and the standing example is the environment the journey is described in:

```yaml
relations:
  uses:
    - /environment/production            # good — no step touches an environment
    - /product/shop/component/checkout   # redundant — step 1 already touches it
```

**Nothing points at a journey in v1.** No edge type accepts a journey target
except `supersedes` from another journey, and `measures` does not list `journey`
among its targets. The inbound view is derived instead: a component page lists
the journeys that touch it, an actor page lists the journeys it stars in, and
both come from `journey.yaml`, never from an authored back-edge.

**v1 limitations, stated rather than worked around:**

- No journey→capability edge. The portal still shows "the journeys that pass
  through" a capability, because that join is transitive — a step `touches` a
  component, the component `realizes` the capability — but a journey
  demonstrating a capability none of its touched entities realizes can only say
  so in prose and by sharing a `tag`.
- No journey→journey edge for "continues", "variant of" or "alternative to".
  `supersedes` is the **swap** edge and using it for sibling paths would
  deprecate a live journey. Group variants with `tags` and link them in prose.
- No metric→journey edge, and `journey` owns no `metric/` bucket, so a drop-off
  number for a path attaches to the capability or component the path runs
  through.

## Evolution

The contract surface is **the ordered step list**: each step's `actor` and
`touches`, and their order. `note`, `protocol`, `tags`, `status`, prose and
relations are metadata — they still bump `version`, but they are not bound by the
non-reduction rule.

| Change                                                     | Contract surface? | Consequence                                                                                                                                             |
| ---------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adding a step, anywhere in the list                        | additive          | Legal at `version: N+1`. Later positional keys shift; the bump announces it.                                                                            |
| Adding or changing a `note`; adding a `protocol` to a step | no                | Metadata: bump `version`, no swap. Naming a protocol that was already carrying the hop is the normal way a `W_JRN_UNDOCUMENTED_INTEGRATION` is cleared. |
| Repointing `touches` or `actor` on an existing step        | yes               | The path now claims something else happened. **Swap.**                                                                                                  |
| Removing a step                                            | yes               | A narrowing, forbidden in place. **Swap.**                                                                                                              |
| Reordering steps                                           | yes               | Order **is** the entity here — unlike a protocol workflow, where step order is metadata. A reordered path is a different path. **Swap.**                |
| Changing the frontmatter `actor`                           | yes               | The same route walked by someone else is a different journey. **Swap.**                                                                                 |

The swap is the ordinary one (`evolution.md`): a new journey entity that
`supersedes` the old, then the old set to `status: deprecated`. Never deleted — a
path the solution used to promise is exactly the thing someone asks about next
quarter.

## What the portal derives

- **Journey page** — the protagonist, the prose, and the step ladder: ordinal,
  actor, touched entity, protocol chip, note. Rows whose actor is not the
  protagonist render as hand-offs.
- **Journey diagram** — the ladder drawn with a band per product, so a crossing is
  a visible change of band. A documented crossing carries its protocol on the
  hop; an actor-carried one (`protocol: none`) is dashed; an undocumented one is
  flagged. This is the diagram the flat format exists to guarantee.
- **Integration-gap panel** on the solution dashboard — every
  `W_JRN_UNDOCUMENTED_INTEGRATION` in the solution, in one list.
- **"Appears in journeys"** on component and product pages, from `touches`, with
  the step ordinal so a reader lands on the right row.
- **"Journeys"** on the actor page — the ones it stars in and the ones it merely
  appears in as a hand-off, kept apart.
- **Crossing count per journey** — how many product boundaries a path crosses and
  how many are documented. A coupling signal that needs no new authoring.
- **Protocol cross-reference** — a protocol page lists the journey steps naming
  it: the human-scale answer to "who actually walks this conversation".

## Journey error classes

| Code                             | Meaning                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| `E_JRN_ARTIFACT_MISSING`         | The journey entity directory has no `journey.yaml`.                                           |
| `E_JRN_SCHEMA`                   | `journey.yaml` fails its schema — shape, types, unknown non-`x-` key, a top-level `version:`. |
| `E_JRN_NAME`                     | `journey.yaml` `name` ≠ the entity's directory name.                                          |
| `E_JRN_STEP_COUNT`               | Fewer than 2 or more than 12 steps.                                                           |
| `E_JRN_BRANCH`                   | A step carries a branch-shaped key. A journey that branches is two journeys.                  |
| `E_JRN_ACTOR_KIND`               | The frontmatter `actor`, or a step's `actor`, resolves to a kind other than `actor`.          |
| `E_JRN_TOUCHES_KIND`             | A `touches` reference resolves to a kind other than `component` or `product`.                 |
| `E_JRN_PROTOCOL_KIND`            | A `protocol` reference is neither the literal `none` nor an SRN resolving to a `protocol`.    |
| `W_JRN_UNDOCUMENTED_INTEGRATION` | Consecutive steps cross a product boundary and the later names no protocol.                   |
| `W_JRN_PROTOCOL_UNRELATED`       | A step's protocol lists neither end of the hop among its participants.                        |
| `W_JRN_ACTOR_ABSENT`             | The frontmatter protagonist takes none of the steps.                                          |
| `W_JRN_ARTIFACT_UNKNOWN`         | Unrecognised file in the journey entity directory.                                            |

Codes from `srn.md`, `structure.md`, `frontmatter.md` and `evolution.md` apply
unchanged — in particular `E_FM_SCHEMA` covers every type violation of the
frontmatter `actor` field, and `E_SRN_DANGLING` every unresolvable reference in
`journey.yaml`.

**Where they are raised.** `E_JRN_SCHEMA`, `E_JRN_NAME`, `E_JRN_STEP_COUNT`,
`E_JRN_BRANCH`, `W_JRN_ACTOR_ABSENT` and `W_JRN_UNDOCUMENTED_INTEGRATION` come
from the `journey.yaml` parser — everything decidable from the file itself, plus
the frontmatter protagonist the caller hands it. Whether a reference resolves,
and to what kind, is a question about the built graph and belongs to the loader;
`E_JRN_ACTOR_KIND` on the protagonist is the clearest of those.

**Both halves reach `metaframework check`.** The catalog folds the parser's
findings in beside the loader's, the way it folds in the datamodel schema
registry, so a `journey.yaml` with an unknown key fails the check and not merely
the page that renders it. A validator that reports only to a page nobody is on is
not a gate. Opening the entity's page — `metaframework` with no subcommand serves
the portal on port 6363 — is still the fastest way to *read* a path you have just
written, exactly as after touching a `states.json` (`validate-catalog` skill).
