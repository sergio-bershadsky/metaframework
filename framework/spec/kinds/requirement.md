---
kind: spec
name: requirement
version: 3
status: review
title: Kind — Requirement
summary: Contract for requirement entities — placement, requirement-type and MoSCoW priority, the acceptance-criteria section, satisfaction via the implements edge, and derived coverage.
---

# Kind: requirement

A **requirement** is one statement of something the solution must be true of,
paired with the criteria by which anyone can tell whether it is. One
requirement, one statement — a document listing twelve things is twelve
requirements.

This document adds to the common contract in
[frontmatter.md](../frontmatter.md); it does not restate or relax it.

## Purpose

Requirements are the only entities in the catalog that state an **obligation**
rather than a description. Everything else says what is; a requirement says
what must hold, and the `implements` edge from components turns that into a
traceability graph the portal can check: which obligations are claimed by
someone, and which are not.

The kind is deliberately thin. It is not an issue tracker (no assignee, no
estimate, no sprint), and it is not a specification of behaviour (that is the
protocol and datamodel kinds). It is the statement, its criteria, and its
priority.

## Placement

Requirements are **owner-scoped**: the bucket `requirement/` may sit under any
container — solution, product, or component ([structure.md](../structure.md)):

```text
solutions/acme/requirement/gdpr-erasure/                    # binds the solution
solutions/acme/product/shop/requirement/guest-checkout/     # binds the product
solutions/acme/product/shop/component/checkout/requirement/idem-cap/
                                                            # binds one component
```

Those three positions are exactly what the grammar allows: a `requirement` pair
may be the first pair after the solution, or follow a `product` or `component`
pair, and nothing else may own one. A `requirement/` bucket inside a `protocol/`
entity is `E_SRN_PLACEMENT` ([srn.md](../srn.md)).

Place a requirement in the bucket of the container that **owns the obligation**
— the one accountable for it holding. That is usually, but not always, the
container that implements it: a solution-wide obligation implemented by three
components belongs at solution level, with three `implements` edges pointing up
at it.

Owner scope is responsibility, not visibility: any component in the solution
may `implements` any requirement in it ([structure.md](../structure.md)).

Requirement names are short kebab-case slugs of the capability or constraint —
`idem-cap`, `guest-checkout`, `p99-checkout-latency`. Unlike ADRs, requirements
carry **no ordinal prefix**: they are not chronological, they are re-read out
of order, and an ordinal would only invite renumbering, which the SRN forbids
([evolution.md](../evolution.md)).

## Frontmatter additions

On top of the common fields ([frontmatter.md](../frontmatter.md)), an entity
with `kind: requirement` declares:

| Field              | Type                              | Required | Rule                                                                     |
| ------------------ | --------------------------------- | -------- | ------------------------------------------------------------------------ |
| `requirement-type` | `functional \| non-functional`    | yes      | Closed enum; any other value is `E_FM_SCHEMA`.                           |
| `priority`         | `must \| should \| could \| wont` | yes      | MoSCoW, spelled without an apostrophe; any other value is `E_FM_SCHEMA`. |

Both are normative for `kind: requirement` only; using `priority` on any other
kind is `E_FM_UNKNOWN_FIELD`.

```yaml
requirement-type: functional
priority: must
```

```yaml
requirement-type: performance    # E_FM_SCHEMA — a tag, not a type (see below)
priority: won't                  # E_FM_SCHEMA — apostrophe; the value is `wont`
priority: P1                     # E_FM_SCHEMA — not MoSCoW
```

### `requirement-type` — why only two values

| Value            | Means                                                                            | Example                                                          |
| ---------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `functional`     | Observable behaviour: given some input or event, the system does something.      | "A repeated capture with the same idempotency key charges once." |
| `non-functional` | A constraint on *how* the system behaves, independent of any single interaction. | "Checkout responds within 400 ms at p99 under peak load."        |

The split is binary because it is the only distinction that changes how the
requirement is **verified** and where it is **satisfied**. A functional
requirement is satisfied by a component's behaviour and is demonstrable through
a protocol interaction; a non-functional one is satisfied by an operational
property and is demonstrable only against a specific environment — which is why
a non-functional requirement usually carries a `uses` edge to the environment it
is measured in.

Everything finer — performance, security, availability, accessibility,
compliance, operability — is a *category* of non-functional requirement, and
categories belong in `tags`, an open facet with no semantics attached:

```yaml
requirement-type: non-functional
tags:
  - performance
  - checkout-path
```

A six- or ten-value enum would need extending every time a new quality
attribute matters, and no portal behaviour would depend on the extra values.
A two-value enum never needs extending and drives two real behaviours: the
coverage view groups by it, and the environment cross-reference applies only to
the non-functional half.

### `priority` — MoSCoW, and what `wont` means

| Value    | Means                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| `must`   | The solution is not viable without it. An unimplemented `must` is a defect in the description, and is flagged. |
| `should` | Important; the solution ships without it under protest and with a stated workaround.                           |
| `could`  | Desirable; taken if it is cheap.                                                                               |
| `wont`   | **Explicitly out of scope for the current planning window** — a recorded non-goal, not a deleted requirement.  |

- The value is spelled `wont`, with no apostrophe, because frontmatter enum
  values follow the same kebab-case grammar as everything else in the catalog.
  Writing `won't` or `wont-have` is `E_FM_SCHEMA`.
- `wont` is what makes the kind additive-only in practice. A requirement that
  falls out of scope is **demoted, never deleted**: the statement, its
  criteria, and the reason it was declined stay readable, so the same request
  arriving next quarter meets a recorded answer instead of a blank catalog.
- Priority is scoped to the owner's current planning window and is **expected to
  change**. Changing it is a content change and bumps `version`
  ([evolution.md](../evolution.md)); it is not a narrowing of the requirement,
  because priority describes the owner's intent, not the obligation itself.

## Acceptance criteria

**Acceptance criteria are a prose section under a required heading, not
frontmatter data.**

```markdown
## Acceptance criteria

- A capture repeated with the same idempotency key charges the card once.
- A capture repeated with the same key returns the original capture result.
- An idempotency key is honoured for at least 24 hours after first use.
- A capture with a reused key but a different amount is rejected.
```

Rules — all violations are `E_REQ_CRITERIA`:

| Rule                                                                                               | Example of a violation                                     |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| The heading `## Acceptance criteria` appears **exactly once**, at level 2, with this exact casing. | `## Acceptance Criteria`, `### Acceptance criteria`        |
| Its content **begins with a markdown unordered list** (`-`), before any other heading.             | A paragraph of prose where the list should be              |
| The list has **at least one** top-level item.                                                      | The heading followed by an empty section                   |
| Task-list syntax is **not** used.                                                                  | `- [ ] A capture repeated with the same key charges once.` |
| Each item's **first line** is one criterion, ≤ 200 characters.                                     | A 600-character paragraph as a single bullet               |

Nested content under an item is free and preserved as that criterion's detail —
Given/When/Then, a table, a code block:

```markdown
- A capture repeated with the same idempotency key charges the card once.
  - **Given** a capture for order `o-1` with key `k-1` that succeeded
  - **When** the same request is replayed within 24 hours
  - **Then** no second authorization reaches the gateway
```

Authors MAY prefix an item with a bold anchor, which the portal uses as the
criterion's stable link target instead of its position:

```markdown
- **AC-1** A capture repeated with the same idempotency key charges the card once.
```

### Why a prose section and not frontmatter

Three formats were available: a frontmatter list, a sibling artifact, and a
prose section. The prose section wins on the framework's own terms:

- **Review is git-native** ([index.md](../index.md)): files are the review
  surface. Criteria are the part of a requirement that gets argued over line by
  line, and a markdown list produces a clean, commentable diff, where a YAML
  block scalar nested two levels inside frontmatter produces a re-indentation
  diff nobody can read.
- **Frontmatter is flat and predictable.** Every other frontmatter field is a
  scalar or a list of short tokens. Criteria are sentences, often with nested
  Given/When/Then and code — putting them there would make the one structure an
  author reads first the largest and least scannable block in the file.
- **No third format.** A sibling `acceptance.yaml` would introduce an artifact
  for something that is fundamentally a sentence, and would split the
  requirement's substance across two files for no machine-readable gain.
- **The section is machine-readable anyway.** A pinned heading plus a pinned
  list shape is a parse target: the portal reads the items under
  `## Acceptance criteria` and renders them as a checklist, with nested content
  as expandable detail. Markdown is the human form and the machine form at
  once, which is exactly the "human + AI readable" principle.

The heading is enforced rather than conventional for the same reason the
portal renders it as a component: an unenforced heading is one the renderer
cannot rely on, and a requirement whose criteria cannot be found is a
requirement nobody can verify.

### Checkboxes are forbidden, deliberately

`- [ ]` / `- [x]` are rejected because **completion is not catalog data**. The
catalog describes obligations, not progress; whether an obligation is claimed
is expressed by the `implements` edges pointing at it, which the portal derives
and which cannot drift from reality the way a hand-ticked box does. The portal
renders the criteria *as* a checklist — the checkbox is a rendering, never a
source.

## Satisfaction — the `implements` edge

Satisfaction is authored **on the component side only**, using the common edge
([frontmatter.md](../frontmatter.md)):

```yaml
# solutions/acme/product/shop/component/checkout/index.md
relations:
  implements:
    - requirement/idem-cap                  # this component's own bucket
    - /requirement/gdpr-erasure             # a solution-level obligation
```

The requirement never authors the inverse. `implemented-by` is **derived** by
the portal, exactly like every other inverse edge; authoring both directions is
double bookkeeping that drifts.

```yaml
# solutions/acme/product/shop/component/checkout/requirement/idem-cap/index.md
relations:
  implemented-by:                           # E_FM_SCHEMA — inverse edges are
    - /product/shop/component/checkout      # derived, never authored
```

Two catalog-level consistency checks fall out of the graph:

- A requirement with `priority: must` and **no** incoming `implements` edge is
  `W_REQ_UNIMPLEMENTED`. It is a warning, not an error: a `must` written before
  anything implements it is the normal order of work. It is the number the
  solution dashboard leads with.
- A requirement with `priority: wont` that **has** an incoming `implements`
  edge is `W_REQ_WONT_IMPLEMENTED` — the catalog is claiming to satisfy
  something it declared out of scope. Either the priority is stale or the edge
  is wrong; both are worth a human look.

### What a requirement may reference

| Edge         | From a requirement                                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uses`       | Legal toward a **datamodel**, **protocol**, **environment**, or **component**. Non-functional requirements SHOULD point at the environment they are measured in. |
| `supersedes` | Legal, toward another requirement — the successor of a statement that could not be extended.                                                                     |
| `implements` | Not available from a requirement: its legal source kinds are component/product ([frontmatter.md](../frontmatter.md)).                                            |

```yaml
# a non-functional requirement names its measurement context
requirement-type: non-functional
relations:
  uses:
    - /environment/production
```

**v1 limitation, stated rather than worked around:** there is no
requirement→requirement edge for decomposition. `uses` does not accept a
requirement target and `depends-on` is component/product only, so a parent/child
requirement tree cannot be expressed in v1. Write one requirement per statement,
group related ones with `tags`, and link them in prose. Adding a `refines` edge
would be an additive change to the closed edge set in
[frontmatter.md](../frontmatter.md) and is out of scope here.

## Body template

Only `## Acceptance criteria` is enforced. The rest is conventional, save the
one rule every body shares: sections start at `##`, because the page already
renders `title` as its h1
([structure.md](../structure.md#the-document-body)).

```markdown
<The statement: one or two paragraphs saying what must hold and for whom.>

## Acceptance criteria

- …

## Rationale          <!-- conventional -->
## Out of scope       <!-- conventional -->
```

The asymmetry with [adr.md](adr.md) — where four headings are enforced — is
intentional. An ADR must say four separate things or it is not a decision
record. A requirement says one thing, and that statement is the lead paragraph;
only its criteria need a pinned address, because only the criteria are rendered
as structure.

## Sibling artifacts

**The requirement kind defines no sibling artifacts.** A requirement is
`index.md`.

Its statement and criteria are prose by design (above), and everything
structured it touches already has an SRN — the datamodel it constrains, the
protocol it governs, the environment it is measured in. Supporting material (a
load-test report, a legal citation) MAY sit next to `index.md`; the portal
links it but does not interpret it.

## Evolution

The requirement's contract surface is **the statement, the acceptance criteria,
and `requirement-type`**. `priority`, `tags`, `status`, and relations are
metadata: they still bump `version`, but they are not bound by the
non-reduction rule ([evolution.md](../evolution.md)).

- Legal at `version: N+1` — clarify the statement's wording, sharpen a
  criterion without changing what it demands, add a `Rationale` section, change
  `priority`, add relations.
- **Adding a criterion** is additive under [evolution.md](../evolution.md), but
  it can invalidate existing `implements` claims — the components claiming
  satisfaction have not been asked. An added criterion on an `approved`
  requirement SHOULD therefore reset `status` to `review` and be raised with
  every implementer the portal lists under `implemented-by`. If the new
  criterion changes what the requirement *means* rather than sharpening it, it
  is a new requirement.
- **ILLEGAL in place** — removing or weakening a criterion, or reversing the
  statement. That is a narrowing, forbidden by
  [evolution.md](../evolution.md), and it is handled by the swap:

  ```yaml
  # solutions/acme/product/shop/component/checkout/requirement/
  #   exactly-once-capture/index.md
  version: 1
  status: draft
  relations:
    supersedes:
      - ../idem-cap             # sibling requirement in the same bucket
  ```

  Migrate each implementing component's `implements` edge one at a time, then
  set the old requirement to `status: deprecated`. It is never deleted.
- Demoting to `priority: wont` is **not** a narrowing and needs no swap: the
  obligation is unchanged, the owner's intent is what moved.

## Worked example

`solutions/acme/product/shop/component/checkout/requirement/idem-cap/index.md`:

```markdown
---
name: idem-cap
kind: requirement
version: 2
title: Idempotent payment capture
summary: A payment capture replayed with the same idempotency key must charge the customer exactly once.
status: approved
owner: team-payments
requirement-type: functional
priority: must
relations:
  uses:
    - srn://acme/product/shop/protocol/order-events
    - /product/shop/component/checkout/component/payment/datamodel/capture-request@1
tags:
  - payments
  - reliability
---

A client that cannot tell whether its capture request arrived must be able to
retry it safely. Checkout accepts an idempotency key on every capture and
guarantees that a replay of the same key produces the same outcome and no
additional charge — including when the original request failed after the
gateway had already authorized it.

The obligation is the customer's, not the client's: a duplicate charge is a
refund, a support contact, and a chargeback risk, in that order.

## Acceptance criteria

- **AC-1** A capture repeated with the same idempotency key charges the card once.
  - **Given** a capture for order `o-1` with key `k-1` that reached the gateway
  - **When** the same request is replayed within the retention window
  - **Then** no second authorization reaches the gateway
- **AC-2** A replay returns the original capture result, byte-identical.
- **AC-3** An idempotency key is honoured for at least 24 hours after first use.
- **AC-4** A capture reusing a key with a different amount or order is rejected
  with a distinguishable error, not silently accepted.
- **AC-5** The guarantee holds across a checkout restart — key state is not
  in-process memory.

## Rationale

Incident 2026-02-14: a gateway timeout caused 41 duplicate authorizations over
nine minutes. AC-5 exists because the first attempted fix kept keys in memory
and the next deploy re-opened the hole.

## Out of scope

Idempotency of refunds — see
[refund-idem](srn://acme/product/shop/component/checkout/requirement/refund-idem).
```

A non-functional requirement,
`solutions/acme/product/shop/component/checkout/requirement/p99-checkout-latency/index.md`:

```markdown
---
name: p99-checkout-latency
kind: requirement
version: 1
title: Checkout p99 latency under peak
summary: The checkout submit path responds within 400 ms at p99 during peak traffic in production.
status: review
owner: team-commerce
requirement-type: non-functional
priority: should
relations:
  uses:
    - /environment/production
tags:
  - performance
  - checkout-path
---

The submit-order path must stay responsive at the traffic peaks the shop sees
in the last week of the quarter. Measured in production, at the edge of the
storefront, not inside the service.

## Acceptance criteria

- p99 latency of the submit-order request is ≤ 400 ms, measured over any
  rolling 5-minute window during a peak day.
- p50 latency is ≤ 120 ms over the same window.
- The measurement is taken at the public edge, including TLS termination.
- The objective holds at 3× the median hourly order rate of the last 90 days.
```

Both examples show the pattern the portal relies on: no `implemented-by` edge,
criteria as a list under the pinned heading, and — for the non-functional one —
a `uses` edge naming the environment the numbers are measured in
([environment.md](environment.md)).

## Validation rules

| #    | Rule                                                                                                | Class                    |
| ---- | --------------------------------------------------------------------------------------------------- | ------------------------ |
| REQ1 | `requirement-type` present and a member of the closed enum.                                         | `E_FM_SCHEMA`            |
| REQ2 | `priority` present and a member of the MoSCoW enum (`wont`, no apostrophe).                         | `E_FM_SCHEMA`            |
| REQ3 | `requirement-type` / `priority` appear only on `kind: requirement` entities.                        | `E_FM_UNKNOWN_FIELD`     |
| REQ4 | Exactly one `## Acceptance criteria` heading, level 2, exact casing.                                | `E_REQ_CRITERIA`         |
| REQ5 | The section opens with an unordered list of ≥ 1 item, no task-list syntax, first lines ≤ 200 chars. | `E_REQ_CRITERIA`         |
| REQ6 | No authored inverse edge (`implemented-by`).                                                        | `E_FM_SCHEMA`            |
| REQ7 | A `priority: must` requirement has at least one incoming `implements` edge.                         | `W_REQ_UNIMPLEMENTED`    |
| REQ8 | A `priority: wont` requirement has no incoming `implements` edge.                                   | `W_REQ_WONT_IMPLEMENTED` |

REQ1–REQ6 are checkable from the entity alone; REQ7–REQ8 need the resolved
catalog.

## What the portal derives

- **Requirement page** — type and priority badges, the statement, the criteria
  rendered as a checklist (read-only: the ticks come from nothing, they are
  presentation), and the derived `implemented-by` list.
- **Coverage table** per container — requirements × implementing components,
  grouped by `requirement-type`, faceted by `priority` and `tags`. This is the
  traceability view the kind exists for.
- **Unmet-`must` panel** on the solution dashboard — every `W_REQ_UNIMPLEMENTED`
  in one place, which is the single most useful number the catalog produces.
- **"Implements" section on component pages** — the same edges read forward,
  so a component page states the obligations it has taken on.
- **Environment cross-reference** — non-functional requirements that `uses` an
  environment appear on that environment's page as the objectives it must meet
  ([environment.md](environment.md)).
- **Supersession chain** — `superseded-by` derived from successors'
  `supersedes` edges; deprecated requirements render greyed with a pointer
  forward.

## Requirement error classes

| Code                     | Meaning                                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E_REQ_CRITERIA`         | The `## Acceptance criteria` section is missing, duplicated, at the wrong level, not opened by an unordered list, empty, or written with task-list checkboxes. |
| `W_REQ_UNIMPLEMENTED`    | A `priority: must` requirement that no component `implements`.                                                                                                 |
| `W_REQ_WONT_IMPLEMENTED` | A `priority: wont` requirement that some component claims to implement.                                                                                        |

Frontmatter shape and edge errors reuse `E_FM_SCHEMA`, `E_FM_UNKNOWN_FIELD`,
and `E_FM_EDGE_TARGET` ([frontmatter.md](../frontmatter.md)); placement follows
the common owner-scope rules in [structure.md](../structure.md).
