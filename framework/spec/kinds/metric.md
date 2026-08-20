---
kind: spec
name: metric
version: 2
status: draft
title: Kind — Metric
summary: Contract for metric entities — owner-scoped placement, metric-type and the typed target literal, window and direction, the required measures edge, and derived coverage.
---

# Kind: metric

A **metric** is one number the solution observes about itself, stated precisely
enough that two people reading it would compute the same value. One number, one
metric — a dashboard with nine tiles is nine metrics.

This document adds to the common contract in
[frontmatter.md](../frontmatter.md); it does not restate or relax it.

## Purpose

A metric exists to make a claim about the running system **checkable**. The
catalog is otherwise made of descriptions and obligations: a component says what
it is, a requirement says what must hold. Neither says how anyone would know.
The metric supplies the observation, and the `measures` edge binds it to the
thing observed, so the portal can answer a question no other kind can:
*this obligation — what number would tell you it is being met?*

The kind is deliberately thin. Four scalars and one edge. It is not a
monitoring system, and everything it deliberately refuses is listed below,
because a metric kind that starts collecting fields ends up as a second, worse
dashboard tool checked into git.

## What a metric is NOT

- **Not a requirement.** A requirement is a *commitment*; a metric is an
  *observation*. "Checkout responds within 400 ms at p99" is something the team
  has promised — it can be unmet, and an unmet `must` is a defect
  ([requirement.md](requirement.md)). "p99 latency of the submit-order request,
  measured at the public edge over a rolling 5 minutes" is something that is
  true or false of the world at every instant, and it is nobody's fault. The
  `target` on a metric is the line the observation is compared against, not a
  promise anyone made; the promise lives in the requirement the metric
  `measures`. A requirement with a metric is a commitment you can actually
  check, and that pairing is the pattern the kind exists to enable.
- **Not a monitor.** There is no query, no data source, no scrape interval, no
  alert threshold, no routing, no on-call. Those belong to the tool that
  computes the number and page whoever it pages; they change on a different
  clock from the catalog and would rot inside it. The catalog states *what* is
  observed and *what good looks like*; how it is collected is one paragraph of
  prose under `## Definition`.
- **Not a value.** No observed value is ever recorded in a metric entity — not a
  current reading, not a history, not a sparkline. Values change continuously,
  and storing them would turn every commit into a time series and every
  `version` bump into noise ([evolution.md](../evolution.md)). The catalog
  describes the system; it does not sample it.
- **Not a capability.** A capability is what the business can *do*
  ([capability.md](capability.md)); a metric is how well it is being done. They
  are one-to-many in the useful direction: one capability, several metrics.
- **Not an OKR.** There is no quarter, no owner-goal, no confidence, no
  check-in. `window` is the period the observation is taken over, not a planning
  cycle, and `target` is not a commitment for a cycle. Planning artifacts belong
  to the planning tool.
- **Not a datamodel field.** A metric names a number the *system* is measured
  by. A number the system *stores* — an order total, a stock level — is a field
  in a schema ([datamodel.md](datamodel.md)).

## Placement

Metrics are **owner-scoped**: the bucket `metric/` may sit under any container
— solution, product, or component ([structure.md](../structure.md)), exactly as
`requirement/` may:

```text
solutions/acme/metric/order-conversion                          # binds the solution
solutions/acme/product/shop/metric/checkout-conversion          # binds the product
solutions/acme/product/shop/component/checkout/metric/
    duplicate-capture-rate                                      # binds one component
solutions/acme/product/shop/component/checkout/component/payment/metric/
    authorization-success                                       # at any depth
```

Those positions are what the grammar allows: a `metric` pair may be the first
pair after the solution, or follow a `product` or `component` pair, and nothing
else may own one. A `metric/` bucket inside a `capability/` entity is
`E_SRN_PLACEMENT` — a capability owns nothing ([srn.md](../srn.md)). No
placement rule was added for the kind; an owner-scoped kind is precisely a kind
that no rule after "only containers own things" mentions
([decision-record.md](../../../docs/decision-record.md), amendment
2026-08-20-a).

**A metric lives under what it measures, up to and including the solution.**
Placement is the answer to *whose number is this?* — the container accountable
for it, which is the subject itself or something above the subject. Reading the
number is not restricted by placement: any entity may reference any metric in
the solution, and the portal shows a metric on its subject's page wherever it
was filed. A metric filed outside the ownership line of a subject that *has*
one is `W_MET_SUBJECT_SCOPE` ([below](#subject-scope)).

Metric names are short kebab-case slugs of the thing observed —
`order-conversion`, `duplicate-capture-rate`, `submit-latency-p99`. They carry
**no ordinal prefix** and no unit suffix: the unit is in `target`, and a name
like `latency-ms` goes stale the moment the target moves to seconds.

## Frontmatter additions

On top of the common fields ([frontmatter.md](../frontmatter.md)), an entity
with `kind: metric` declares:

| Field         | Type                                   | Required | Rule                                                                            |
| ------------- | -------------------------------------- | -------- | ------------------------------------------------------------------------------- |
| `metric-type` | `ratio \| duration \| count \| amount` | yes      | Closed enum; any other value is `E_FM_SCHEMA`. Selects the grammar of `target`. |
| `target`      | string                                 | yes      | A literal of the grammar `metric-type` selects, else `E_MET_TARGET`.            |
| `window`      | string                                 | yes      | `instant` or a rolling duration literal, else `E_MET_WINDOW`.                   |
| `direction`   | `higher-is-better \| lower-is-better`  | yes      | Closed enum; says whether `target` is a floor or a ceiling.                     |

All four are normative for `kind: metric` only; using `direction` on any other
kind is `E_FM_UNKNOWN_FIELD`.

```yaml
metric-type: duration
target: "400ms"
window: "5m"
direction: lower-is-better
```

```yaml
metric-type: percentage    # E_FM_SCHEMA — not a member of the enum
target: 1200               # E_FM_SCHEMA — a YAML integer, not a string (quote it)
target: "99.9"             # E_MET_TARGET — a ratio literal needs its `%`
window: "1 month"          # E_MET_WINDOW — months are not a fixed duration
direction: higher          # E_FM_SCHEMA — the value states the comparison, see below
```

**All four are required, and that is the additive-safe order.** A field
introduced as optional can never be made required later — that is a narrowing,
which [evolution.md](../evolution.md) forbids outright — while a required field
can always be relaxed. Requiring them now leaves both moves available; guessing
optional now closes one of them permanently. And a metric missing any of the
four is not under-specified, it is unusable: without `target` and `direction`
the portal cannot render a met/unmet state, which is the entire derived value of
the kind, and without `window` two readers of "conversion is 3.4%" are quoting
different numbers.

### `metric-type` — four literal grammars, not a taxonomy

The enum is not a classification of *what* is measured. Subject matter —
performance, adoption, reliability, cost — is an open facet and belongs in
`tags`, with no semantics attached, for the same reason
[requirement.md](requirement.md) keeps `requirement-type` to two values: a
subject-matter enum needs extending every time a new concern matters and no
portal behaviour depends on the extra values.

`metric-type` classifies the **shape of the observation**, because that is what
fixes the grammar of `target` and the unit the portal renders:

| Value      | The observation is                                                        | `target` literal | Example       |
| ---------- | ------------------------------------------------------------------------- | ---------------- | ------------- |
| `ratio`    | A proportion, written as a percentage.                                    | `decimal "%"`    | `"99.9%"`     |
| `duration` | Elapsed time.                                                             | `decimal unit`   | `"400ms"`     |
| `count`    | A dimensionless quantity — a tally over the window, or an average of one. | `decimal`        | `"1200"`      |
| `amount`   | Money.                                                                    | `decimal SP ccy` | `"12.50 EUR"` |

```abnf
target          = ratio-target / duration-target / count-target / amount-target

ratio-target    = decimal "%"                  ; metric-type: ratio
duration-target = decimal duration-unit        ; metric-type: duration
count-target    = ["-"] decimal                ; metric-type: count
amount-target   = decimal SP currency          ; metric-type: amount

duration-unit   = "ms" / "s" / "m" / "h" / "d"
currency        = 3(%x41-5A)                   ; ISO 4217 alphabetic code, uppercase
decimal         = 1*DIGIT ["." 1*DIGIT]
```

- **There is no `rate` value, and none is needed.** A rate is a count over a
  period, and the period already has a field: "1200 orders per hour" is
  `metric-type: count`, `target: "1200"`, `window: "1h"`. Adding `rate` would
  give every rate metric two places to put its period and let them disagree.
- **A ratio carries its `%`.** Without it, `0.999` is unreadable — 99.9% or
  0.999%? A ratio target MUST be non-negative; it MAY exceed 100, because not
  every ratio is a part of a whole, though a target above 100% is usually a sign
  the metric is a `count` in disguise.
- **Durations stop at days.** There is no `w`, `mo` or `y` unit, because a month
  is not a fixed duration and a year is not twelve of anything constant. Seven
  days is `"7d"`.
- **Money names its currency, always, as a code.** `"12.50 EUR"`, never `€12.50`
  — symbols are ambiguous across locales ($ is at least four currencies), and a
  three-letter code separated by a space greps cleanly.
- **`count` is the only signed literal.** A negative duration, ratio or amount
  is `E_MET_TARGET`; a negative count is legal, because bounded indices that go
  below zero (NPS is the standing example) are counts.

A metric whose observation is none of these four shapes is the signal that the
enum needs an additive extension — bump this document's `version` and add a
fifth value with its grammar. A team-local nuance goes in an `x-` field, never
in a fifth value smuggled past the enum.

### `target` and `window` are strings — quote them

Both are quoted strings, and they are written quoted **always**, not only when
YAML would otherwise coerce them. Quoting is invisible to the parser for
`"400ms"` and `"30d"`; it is load-bearing for exactly one case — a `count`
target of `1200`, which YAML turns into an integer before validation ever sees
it, producing `E_FM_SCHEMA` for what looks to the author like the right value.
"Targets and windows are quoted" is a rule an author can follow without first
working out which of their values is number-shaped.

The unit lives inside the literal rather than in a separate `unit:` field so
that the two can never disagree. One scalar, one truth, and the same flat
frontmatter shape every other kind has.

### `window` — rolling, or `instant`

```abnf
window = "instant" / decimal duration-unit     ; same units as a duration target
```

`window` is the period the observation is taken over, always read as a **rolling
window ending now**: `"30d"` is the last thirty days, at any moment you look.
`"instant"` is the honest form for a gauge — a queue depth, a number of open
incidents — read at a point in time rather than aggregated. A gauge written as
`"1m"` would be a lie about how it is computed.

**Calendar windows are deliberately absent.** There is no `calendar-month`,
because a calendar period is an alignment the *reporting tool* applies, and two
teams computing "this month" — timezone, first day, partial current month —
would disagree while both claiming to satisfy the field. The catalog states the
observation period; the report states its cadence. If a metric is only
meaningful on calendar boundaries, say so in prose under `## Definition` and
pick the rolling window closest to it. Adding a calendar token later is an
additive change to this grammar; adding it now would be a field authors fill in
by habit.

### `direction` — is `target` a floor or a ceiling?

| Value              | Means                                                                             |
| ------------------ | --------------------------------------------------------------------------------- |
| `higher-is-better` | `target` is a **floor**. The metric is met at or above it. Conversion, uptime.    |
| `lower-is-better`  | `target` is a **ceiling**. The metric is met at or below it. Latency, error rate. |

The value spells out the comparison because the short form does not survive
being read alone: `direction: higher` in a diff answers "higher than what?" with
nothing. It is not derivable from `metric-type` — a duration is usually
lower-is-better and a ratio usually higher, and "usually" is exactly the word
that makes a derived field wrong twice a year.

A metric whose good region is a **band** — neither a floor nor a ceiling, but a
range you want to stay inside — cannot be expressed in v1. Write the side that
actually matters, and say so in prose. A third enum value with a second target
is an additive change to this document if the case turns out to be common; it is
speculation today.

## The subject — the `measures` edge

Every metric names what it is a number **about**, with the forward edge added to
the closed edge set in [frontmatter.md](../frontmatter.md):

| Edge       | Legal source kinds | Legal target kinds                           | Meaning                                     |
| ---------- | ------------------ | -------------------------------------------- | ------------------------------------------- |
| `measures` | metric             | capability, component, protocol, requirement | The source is an observation of the target. |

```yaml
# solutions/acme/product/shop/component/checkout/metric/duplicate-capture-rate/index.md
relations:
  measures:
    - /product/shop/component/checkout/requirement/idem-cap   # the commitment
                                                              # this number checks
```

**A metric with no `measures` edge is `E_MET_NO_SUBJECT`.** A number with no
subject is not an observation, it is a figure — and the whole derived value of
the kind comes from reading the edge backwards, from the thing measured to the
numbers that measure it. It is the only relation edge any kind requires, and it
is required for the same reason a protocol needs two participants: the entity is
meaningless without it.

The edge takes a list and at least one entry. Prefer **one** subject: if two
things are measured, that is usually two metrics with two definitions. More than
one entry is legal only when the *same observation, computed the same way*, is
the measure of each — the standing case being a metric that measures both the
requirement committing to it and the capability it belongs to.

Write the reference **solution-absolute**, as above. A metric and its subject
are typically two buckets under one container, so the relative form pops two
segments before it descends (`../../requirement/idem-cap`) — exactly the
arithmetic [frontmatter.md](../frontmatter.md) says the absolute form removes.
The `..` chain is legal and resolves to the same entity; it is simply the harder
of two spellings to read in a diff.

The metric never authors the inverse. `measured-by` is **derived** by the
portal, exactly like every other inverse edge ([frontmatter.md](../frontmatter.md));
authoring both directions is double bookkeeping that drifts.

```yaml
# solutions/acme/capability/order-fulfilment/index.md
relations:
  measured-by:                            # E_FM_SCHEMA — inverse edges are
    - /metric/order-conversion            # derived, never authored
```

**`product` is not a legal subject in v1.** A product is a portfolio position,
and its numbers are the numbers of the capabilities it realizes and the
components it owns. A product-scoped metric is expressed by *placing* the metric
in the product's `metric/` bucket and pointing it at one of those — placement
says whose number it is, `measures` says what it is about, and the two are
different questions. Admitting `product` to the target set later is an additive
change to the edge table.

### Subject scope

The **owner** of a metric is the container whose bucket it sits in — the
solution, a product, or a component. Placement says *whose number this is*;
`measures` says *what it is about*. The two are different questions, and they
only have to agree when the subject sits in the containment tree at all:

| Subject kind              | The subject's owner is                         | Scope rule                                            |
| ------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| `component`               | itself                                         | the metric's owner SHOULD be it, or an ancestor of it |
| `protocol`, `requirement` | the container whose bucket the subject sits in | the same rule, applied to that container              |
| `capability`              | — it has none                                  | **no constraint**; see below                          |

Where the rule applies and is broken, the metric is `W_MET_SUBJECT_SCOPE`:

```text
# fine — the metric sits exactly on its subject
…/component/checkout/metric/submit-latency-p99  →  …/component/checkout

# fine — filed above the subject; the product owns the number
…/product/shop/metric/checkout-conversion       →  …/product/shop/component/checkout

# W_MET_SUBJECT_SCOPE — checkout is filing a number about a sibling it does
# not own. Either move it up to product/shop, or the subject is wrong.
…/component/checkout/metric/stock-accuracy      →  …/product/shop/component/inventory
```

It is a warning and not an error for the reason
[requirement.md](requirement.md) gives about owner scope: responsibility
placement is a judgement, and a team genuinely tracking someone else's number
should be visible rather than blocked. Placement that the *grammar* forbids is
still `E_SRN_PLACEMENT`, raised before the file is read.

**A capability subject constrains nothing**, and that is deliberate. A
capability is solution-level and is realized by containers at any depth
([capability.md](capability.md)) — so "at or above the subject" would resolve to
"the solution", and a component five levels down measuring the capability it
contributes to is exactly the case the kind is for. The containment tree has no
opinion about who is accountable for that number; the bucket the author chose
is the whole answer.

### What else a metric may reference

| Edge                                              | From a metric                                                                                                                          |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `uses`                                            | Legal toward a **datamodel**, **protocol**, **environment**, or **component**. A metric observed in one environment SHOULD name it.    |
| `supersedes`                                      | Legal, toward another metric — the successor of a number whose definition could not be extended.                                       |
| `implements`, `exposes`, `depends-on`, `realizes` | Not available from a metric: their legal source kinds are component/product ([frontmatter.md](../frontmatter.md)). `E_FM_EDGE_SOURCE`. |

```yaml
# a metric states where it is observed, as a non-functional requirement does
relations:
  measures:
    - /product/shop/component/checkout/requirement/p99-checkout-latency
  uses:
    - /environment/production
```

Naming the environment is what makes two same-named metrics distinguishable —
staging latency and production latency are different observations, and the
portal cross-references them onto the environment's page
([environment.md](environment.md)).

## Body template

**No heading is enforced**, beyond the one rule every body shares: sections
start at `##`, because the page already renders `title` as its h1
([structure.md](../structure.md#the-document-body)). The whole structure of a
metric is its frontmatter; the prose is one explanation, and the rest is
conventional:

```markdown
<What is observed, and why this number and not a neighbouring one.>

## Definition          <!-- conventional, and the one section worth writing -->
## Rationale           <!-- conventional -->
## Known distortions   <!-- conventional -->
```

The asymmetry with [requirement.md](requirement.md), where
`## Acceptance criteria` is enforced, is intentional and follows the same test:
a heading is pinned only when the portal renders that section **as structure**.
A requirement's criteria are a list the portal turns into a checklist, so their
address must be reliable. A metric's structure is already machine-readable —
four scalars and an edge — and its definition is a paragraph. Pinning a heading
for a paragraph buys the renderer nothing and costs every author a lint error.

`## Definition` is nonetheless the section that decides whether the metric is
real. It says which events are counted, which are excluded, where the
measurement is taken, and what happens to the edge cases — the same content that
would otherwise live in a query nobody can read. `## Known distortions` is the
place to write down how the number can be made to look good without the world
getting better; every metric can be gamed, and its own page is the honest place
to say how.

## Sibling artifacts

**The metric kind defines no sibling artifacts.** A metric is `index.md`.

The three formats one might reach for are all worse than nothing here. A
`metric.yaml` would restate the four frontmatter scalars in a second file. A
`values.csv` would put observations in the catalog, which
[above](#what-a-metric-is-not) rules out — the catalog describes the system, and
a time series in git is a monitoring database with the worst possible query
engine. A `query.sql` would bind the description to one collection tool and
would go stale silently, because nothing in the repository can execute it to
find out.

Supporting material (a screenshot of the dashboard, an exported panel
definition, a measurement methodology PDF) MAY sit next to `index.md`; the
portal links it but does not interpret it.

## Evolution

The metric's contract surface is **what the number is**: its subject, its
`metric-type`, its `window`, its `direction`, and the definition in prose.
`target`, `tags`, `status`, and other relations are metadata: they still bump
`version`, but they are not bound by the non-reduction rule
([evolution.md](../evolution.md)).

- **`target` is the only field expected to move.** Tightening a target — `"1%"`
  to `"0.5%"` — is legal in place and is **not** a narrowing, because the target
  is not a promise. Nothing referring to the metric depended on the old line;
  what the number *is* has not changed, only what counts as good. Where the
  promise exists, it is the requirement the metric measures, and moving *that*
  follows [requirement.md](requirement.md)'s rules, not these.
- Legal at `version: N+1` — retarget, clarify the definition without changing
  what is counted, add `## Known distortions`, add relations, add a second
  subject that the same observation genuinely measures.
- **ILLEGAL in place** — changing `metric-type`, `window`, `direction`, or the
  subject, or redefining which events are counted. Each of those changes what
  the number *is*, so the series before the change and the series after are not
  comparable, and every reader who compares them is misled by a document that
  claims to be one metric. That is the repurposing
  [evolution.md](../evolution.md) forbids, and it is handled by the swap:

  ```yaml
  # solutions/acme/product/shop/component/checkout/metric/
  #   submit-latency-p99-edge/index.md
  version: 1
  status: draft
  relations:
    supersedes:
      - ../submit-latency-p99        # sibling metric in the same bucket
    measures:
      - /product/shop/component/checkout/requirement/p99-checkout-latency
  ```

  Repoint the subject's readers, then set the old metric to
  `status: deprecated`. It is never deleted — a retired metric is the record of
  how the number used to be computed, which is the only thing that makes an old
  chart readable.

## Worked examples

A metric that checks a requirement — the pattern the kind exists for.
`solutions/acme/product/shop/component/checkout/metric/duplicate-capture-rate/index.md`:

```markdown
---
name: duplicate-capture-rate
kind: metric
version: 1
title: Duplicate capture rate
summary: Share of captures that reach the gateway twice for one idempotency key, measured over a rolling 30 days in production.
status: draft
owner: team-payments
metric-type: ratio
target: "0.01%"
window: "30d"
direction: lower-is-better
relations:
  measures:
    - /product/shop/component/checkout/requirement/idem-cap
  uses:
    - /environment/production
tags:
  - payments
  - reliability
---

`idem-cap` promises that a capture replayed with the same idempotency key
charges the card once. This is the number that says whether it holds: the share
of authorizations the gateway accepted for a key that had already produced one.

## Definition

Numerator: gateway authorizations whose idempotency key matches an earlier
authorization within the retention window, counted at the gateway adapter, after
retries. Denominator: all authorizations attempted in the same window.
Cancelled-then-recaptured orders are excluded — those are two intended charges
and are identified by a distinct key.

## Rationale

The target is not zero. A single duplicate is a refund and a support contact,
and the honest engineering position is that the rate is driven to the noise
floor rather than to an absolute. Zero as a target makes the metric unactionable
— every reading is a failure and nobody looks twice.

## Known distortions

Counting at the gateway adapter misses duplicates created *by* the gateway on
its own retries; those show up in reconciliation, not here.
```

A metric that observes a component, filed on the component itself.
`solutions/acme/product/shop/component/checkout/metric/submit-latency-p99/index.md`:

```markdown
---
name: submit-latency-p99
kind: metric
version: 1
title: Submit-order p99 latency
summary: p99 wall-clock latency of the submit-order request at the public edge, over a rolling five minutes.
status: draft
owner: team-commerce
metric-type: duration
target: "400ms"
window: "5m"
direction: lower-is-better
relations:
  measures:
    - /product/shop/component/checkout/requirement/p99-checkout-latency
  uses:
    - /environment/production
tags:
  - performance
  - checkout-path
---

The 99th percentile of the submit-order request as the customer experiences it:
at the public edge, TLS termination included, not inside the service.

## Definition

Measured at the edge terminator, first byte in to last byte out, over a rolling
five-minute window. Requests rejected by rate limiting before reaching checkout
are excluded; requests that fail inside checkout are included, because a slow
failure is a slow checkout.
```

A solution-level metric on a capability:
`solutions/acme/metric/order-conversion/index.md`:

```markdown
---
name: order-conversion
kind: metric
version: 1
title: Order conversion
summary: Share of shopping sessions that end in a placed order, over a rolling 30 days.
status: draft
owner: team-commerce
metric-type: ratio
target: "3.5%"
window: "30d"
direction: higher-is-better
relations:
  measures:
    - /capability/order-fulfilment
tags:
  - commerce
---

Whether the business can actually take orders, expressed as the share of
sessions that produce one.

## Definition

Numerator: sessions containing at least one `order-placed` event. Denominator:
sessions containing at least one product-page view. Bot sessions are excluded by
the edge classifier.

## Known distortions

Raising the price of everything raises conversion of the sessions that remain.
Read next to revenue, never alone.
```

All three show the pattern the portal relies on: no `measured-by` edge, exactly
one subject, a quoted target in the grammar its `metric-type` selects, and — for
the two observed in a running system — a `uses` edge naming the environment the
numbers come from.

## Validation rules

| #     | Rule                                                                                                                                               | Class                                         |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| MET1  | `metric-type` present and a member of the closed enum.                                                                                             | `E_FM_SCHEMA`                                 |
| MET2  | `target` present and a string; and a literal of the grammar `metric-type` selects.                                                                 | `E_FM_SCHEMA` (not a string) / `E_MET_TARGET` |
| MET3  | `window` present and a string; and either `instant` or a duration literal.                                                                         | `E_FM_SCHEMA` (not a string) / `E_MET_WINDOW` |
| MET4  | `direction` present and a member of the closed enum.                                                                                               | `E_FM_SCHEMA`                                 |
| MET5  | `metric-type` / `target` / `window` / `direction` appear only on `kind: metric` entities.                                                          | `E_FM_UNKNOWN_FIELD`                          |
| MET6  | `relations.measures` present with at least one entry.                                                                                              | `E_MET_NO_SUBJECT`                            |
| MET7  | Every `measures` target resolves to a capability, component, protocol, or requirement.                                                             | `E_FM_EDGE_TARGET`                            |
| MET8  | `measures` is authored only by a `kind: metric` entity.                                                                                            | `E_FM_EDGE_SOURCE`                            |
| MET9  | No authored inverse edge (`measured-by`).                                                                                                          | `E_FM_SCHEMA`                                 |
| MET10 | For a component, protocol, or requirement subject, the metric's owner is the subject's owner or an ancestor of it. A capability subject is exempt. | `W_MET_SUBJECT_SCOPE`                         |

MET1–MET6, MET8 and MET9 are checkable from the entity alone; MET7 and MET10
need the resolved catalog.

## What the portal derives

- **Metric page** — type and direction badges, the target rendered in the unit
  its `metric-type` implies with the comparison spelled out (*at most 400 ms*,
  *at least 3.5%*), the window, and a link to the subject.
- **"Measured by" section** on capability, component, protocol, and requirement
  pages — the same edges read backwards, so the thing measured lists its
  numbers. This is the view the kind exists for.
- **Checkable-requirement panel** — `must` requirements with at least one
  incoming `measures` edge render as checkable, and the ones with none are the
  natural counterpart to the unmet-`must` panel
  ([requirement.md](requirement.md)). Whether an unmeasured `must` deserves a
  warning code is that document's call, not this one's.
- **Capability scorecard** — a capability's metrics gathered on its own page;
  the shape of that view belongs to [capability.md](capability.md).
- **Environment cross-reference** — metrics that `uses` an environment appear on
  that environment's page as the numbers observed there
  ([environment.md](environment.md)), next to the non-functional requirements
  measured in it.
- **Supersession chain** — `superseded-by` derived from successors'
  `supersedes` edges; deprecated metrics render greyed with a pointer forward,
  which is what keeps an old chart interpretable.

## Metric error classes

| Code                  | Meaning                                                                                                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E_MET_TARGET`        | `target` is not a literal of the grammar its `metric-type` selects — wrong or missing unit, unknown duration unit, lowercase or missing currency code, or a negative value on a non-`count` metric. |
| `E_MET_WINDOW`        | `window` is neither `instant` nor a rolling duration literal — a calendar period, an unknown unit, or free text.                                                                                    |
| `E_MET_NO_SUBJECT`    | A metric with no `measures` edge, or with an empty one. A number with no subject.                                                                                                                   |
| `W_MET_SUBJECT_SCOPE` | The metric is filed outside its subject's ownership line — neither on the subject's owner nor above it. Capability subjects have no owner and never raise it.                                       |

Frontmatter shape and edge errors reuse `E_FM_SCHEMA`, `E_FM_UNKNOWN_FIELD`,
`E_FM_EDGE_TARGET`, and `E_FM_EDGE_SOURCE` ([frontmatter.md](../frontmatter.md));
placement of the bucket itself follows the common owner-scope rules in
[structure.md](../structure.md) and fails as `E_SRN_PLACEMENT` while the path is
parsed.
