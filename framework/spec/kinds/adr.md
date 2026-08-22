---
kind: spec
name: adr
version: 4
status: review
title: Kind — ADR
summary: Contract for architecture decision records — owner-scoped placement, decision-status versus the common status field, date and deciders, the enforced body template, the one bucket that may author a measured number, supersession, and derived views.
---

# Kind: adr

An **ADR** (architecture decision record) is one decision, with the context
that forced it, the consequences it buys, and the alternatives it rejected. It
is written once and never rewritten: decisions are superseded, never edited
into their opposite, and never deleted.

This document adds to the common contract in
[frontmatter.md](../frontmatter.md); it does not restate or relax it.

## Purpose

The catalog describes *what* a solution is. An ADR is the only place that
records *why* it is that and not something else — which is precisely the
knowledge that evaporates first and that an AI agent reading the repository has
no other way to recover. Everything else in the catalog is a current-state
description; the ADR bucket is the only append-only, chronological record in
the framework.

## Placement

ADRs are **owner-scoped**: the bucket `adr/` may sit under any container —
solution, product, or component ([structure.md](../structure.md)):

```text
solutions/acme/adr/0003-single-currency/                    # binds the solution
solutions/acme/product/shop/adr/0001-event-sourcing/        # binds the product
solutions/acme/product/shop/component/checkout/adr/0002-idempotency-keys/
                                                            # binds one component
```

Those three positions are exactly what the grammar allows: an `adr` pair may be
the first pair after the solution, or follow a `product` or `component` pair, and
nothing else may own one. `solutions/acme/datamodel/money/adr/0001-decimal/` is
`E_SRN_PLACEMENT` ([srn.md](../srn.md)) — a datamodel owns no entities.

Choose the container the decision **binds**, not the one that happens to have
implemented it first. A decision that constrains two sibling components belongs
in their nearest common ancestor's bucket:

```text
# binds srn://acme/product/shop/component/checkout
#   and srn://acme/product/shop/component/inventory
solutions/acme/product/shop/adr/0004-outbox-per-service/    # correct

solutions/acme/product/shop/component/checkout/adr/0004-outbox-per-service/
#   too low: inventory is bound by a decision filed inside a component it does
#   not own
```

This is a SHOULD, not a build check: an ADR has no participant list from which
a nearest common ancestor could be computed, so the placement is a review
judgement.

### Naming and ordinals

An ADR directory name SHOULD be a zero-padded four-digit ordinal, a hyphen, and
a slug of the decision: `0001-event-sourcing`. The ordinal gives a stable sort
and a human shorthand ("ADR-0001 of the shop"), and the slug keeps the SRN
readable.

Ordinals are **per bucket**, not per solution — the SRN already disambiguates:

```text
srn://acme/adr/0001-single-currency          # solution bucket, ordinal 1
srn://acme/product/shop/adr/0001-event-sourcing   # shop bucket, ordinal 1 —
                                                  # no clash with the above
```

Ordinals are never reused, even after an ADR is rejected or superseded; a
duplicate ordinal inside one bucket is `W_ADR_ORDINAL`.

## Frontmatter additions

On top of the common fields ([frontmatter.md](../frontmatter.md)), an entity
with `kind: adr` declares:

| Field             | Type                                             | Required    | Rule                                                                                          |
| ----------------- | ------------------------------------------------ | ----------- | --------------------------------------------------------------------------------------------- |
| `decision-status` | `proposed \| accepted \| rejected \| superseded` | yes         | The decision's standing. Closed enum; any other value is `E_FM_SCHEMA`.                       |
| `date`            | ISO-8601 calendar date, `YYYY-MM-DD`             | yes         | The date the decision reached its current `decision-status` (`E_ADR_DATE`).                   |
| `deciders`        | list of strings                                  | conditional | REQUIRED and non-empty when `decision-status` is `accepted` or `rejected` (`E_ADR_DECIDERS`). |

All three are normative for `kind: adr` only; using `decision-status` on any
other kind is `E_FM_UNKNOWN_FIELD`.

```yaml
decision-status: accepted
date: 2026-03-11
deciders:
  - team-commerce
  - sergio
```

```yaml
decision-status: agreed          # E_FM_SCHEMA — not a member of the enum
date: 11/03/2026                 # E_ADR_DATE — not ISO-8601
date: 2026-03-11T09:00:00Z       # E_ADR_DATE — time of day is not a decision date
decision-status: accepted
deciders: []                     # E_ADR_DECIDERS — an accepted decision has deciders
```

`date` MUST be a calendar date with no time and no timezone. YAML 1.2 parses an
unquoted `2026-03-11` as a timestamp; both the native form and the quoted
string `"2026-03-11"` are accepted, and the portal normalizes to `YYYY-MM-DD`.

`deciders` are the people or teams who **made the call**, in the same free-form
handle shape as the common `owner` field. `owner` and `deciders` answer
different questions and both are worth having: `owner` is who maintains the
record today, `deciders` is who is accountable for the decision forever. They
are frequently different people two years later.

## Two status fields, and why

This is the known confusion in the kind, so it is stated flatly:

| Field             | Answers                                               | Values                                           |
| ----------------- | ----------------------------------------------------- | ------------------------------------------------ |
| `status` (common) | *Is this document written and reviewed?*              | `draft`, `review`, `approved`, `deprecated`      |
| `decision-status` | *Where does this decision stand in the architecture?* | `proposed`, `accepted`, `rejected`, `superseded` |

They are orthogonal, and two examples prove it rather than assert it:

1. **An approved record of a rejected decision.** The team evaluated
   multi-currency pricing and said no. The document is complete, reviewed, and
   binding as a record — `status: approved` — while the decision itself was
   turned down — `decision-status: rejected`. Folding the fields would make
   this state unwriteable, and it is one of the most valuable records a catalog
   holds: it stops the same proposal coming back every six months.

2. **A superseded decision that is still a good document.** ADR-0001 was
   accepted in 2024 and replaced in 2026. Its text is unchanged and still
   approved; only its standing moved to `superseded`.

The second example also shows why folding them would actively break the
framework. If supersession were expressed by setting `status: deprecated`, then
every reference to the superseded ADR — and referencing old decisions is the
*normal, correct* use of an ADR archive — would raise `W_REF_DEPRECATED`
([evolution.md](../evolution.md)). Deprecation means "stop pointing here";
superseded means "this is history, and history is the point".

Legal combinations, with the ones that actually occur:

| `status`   | `decision-status` | Reading                                                     |
| ---------- | ----------------- | ----------------------------------------------------------- |
| `draft`    | `proposed`        | Being written up for discussion. The common starting state. |
| `review`   | `proposed`        | The proposal is in front of its deciders.                   |
| `approved` | `accepted`        | The normal terminal state of a decision that was taken.     |
| `approved` | `rejected`        | A reviewed record of a road not taken.                      |
| `approved` | `superseded`      | Historical decision, still a valid document.                |

`status: deprecated` on an ADR does **not** mean the decision was reversed. It
is reserved for a record retracted as a *document* — filed against the wrong
scope, or duplicating another ADR. Retiring a decision is `decision-status`
work, never `status` work.

**Where the portal shows each:** `decision-status` is the ADR's primary badge —
on the entity page header and in every ADR list, coloured by value. `status` is
the same small review chip every entity carries, and it is what gates
"reviewed" filters across the catalog. An ADR list is sorted by `date` and
filtered by `decision-status`; it is never filtered by `status`.

## Body template

The ADR body uses four level-2 headings, with exactly this text and casing —
and nothing above them, since every body starts at `##`
([structure.md](../structure.md#the-document-body)):

```markdown
## Context
## Decision
## Consequences
## Alternatives considered
```

**Enforcement: the four headings are REQUIRED.** A missing heading, a wrong
level, or altered text is `E_ADR_SECTIONS`. They are enforced rather than
merely conventional for two reasons: the portal renders and diffs them as named
slots (an ADR page is not free prose), and an ADR without `Consequences` or
without `Alternatives considered` is the failure mode the format exists to
prevent — a decision with no stated cost and no stated competitors is an
announcement, not a record.

What is *not* enforced:

- The **order** of the four headings. The portal renders them in the canonical
  order above regardless of file order; authors SHOULD nonetheless write them
  in that order.
- **Additional** level-2 sections. Any number MAY follow the four
  (`## References`, `## Migration notes`, `## Review notes`).
- The **content**. A `draft` ADR may legitimately hold `_TBD_` under a heading;
  the check is structural.

```markdown
## Context
## Decision
## Consequences
### Alternatives considered      <!-- E_ADR_SECTIONS — level 3, not level 2 -->

## Context
## Decision
## Consequences
## Alternatives Considered       <!-- E_ADR_SECTIONS — capital C -->
```

Section meanings, for authors:

- **Context** — the forces: constraints, deadlines, existing commitments. What
  was true when the decision was needed. Written in past or present tense, never
  as justification.
- **Decision** — one paragraph, active voice, stated as a fact: "We use X." This
  paragraph is the ADR's contract surface.
- **Consequences** — what follows, good and bad. The bad ones are mandatory:
  an ADR with only positive consequences has not been reviewed.
- **Alternatives considered** — each rejected option and the specific reason it
  lost. "Not considered" is an acceptable, honest entry when it is true.

## Measured numbers name their commit

**Rule (ADR8):** an ADR MAY state a **measured fact** — a number obtained by
running a command against a repository — and when it does it MUST say when the
measurement was taken. Violation is `W_ADR_MEASUREMENT`
([below](#adr-error-classes)).

This is the one bucket that may carry such a number at all. Every other kind is a
current-state description, and a measurement inside one is
`W_PROSE_MEASUREMENT` ([structure.md](../structure.md#measured-facts-in-the-prose)).
The exemption is grammatical rather than editorial: an ADR is a **dated snapshot
by construction** — it records evidence for a decision taken on a day — so a
number in one is not a claim about now and never becomes wrong by ageing.

It becomes wrong by having been taken over a **working tree**. That is the whole
of what this rule asks:

> A measurement of a commit cannot drift; a measurement of a working tree always
> does.

So the strongest form, and the one an author should reach for first, names the
commit:

```markdown
## Context

brass landed as commit `ec0f4be` — 148 files, 10,768 insertions, 98 entities.
```

Every digit there is verifiable by one `git show --stat ec0f4be` in 2030, and
none of them was ever a claim about how many entities brass has *today*. Written
without the commit — "brass is 98 entities" — the same sentence is false within a
week and there is nothing on the page to tell a reader whether it is off by two
or by two hundred.

A calendar date is the weaker form and is accepted:

```markdown
Measured 2026-08-21: the reference bundle is 5,072 lines.
```

The **anchor scopes the section, not the sentence**. A heading, or any line under
it, that names a commit or an ISO date covers every measurement down to the next
heading of any level — so a census states its commit once and its table rows then
carry bare digits, which is how the ADRs that get this right actually read.
Restating the date in every cell is both unreadable and a fresh way for one
document to disagree with itself.

```markdown
### The census, counted at commit `8e7a16c`     <!-- anchors everything below -->

| Population                    | Entities |
| ----------------------------- | -------- |
| carry a file measurement      | 95       |
| carry a catalog-graph count   | 108      |

## Consequences                                 <!-- a new section: the anchor stops here -->

`src/lib/history/git.ts` is 1,178 lines.        <!-- W_ADR_MEASUREMENT -->
```

The frontmatter `date` does **not** anchor anything. It is the date the decision
reached its current `decision-status` and it *moves* when the standing does — so
reading it as the measurement date would silently re-date every number in the
body on the day the ADR is accepted. The anchor is in the prose, where the
measurement is.

Being an ADR is not a licence. Two shapes are still wrong in this bucket, and
neither is caught by any check:

- A measurement taken over the working tree and dated honestly is still a number
  that was only ever true for one afternoon. Prefer the commit.
- Quoting a stale ADR number into a current-state entity moves it back into the
  population this rule exists to empty. Cite the decision, not its arithmetic.

## Sibling artifacts

**The ADR kind defines no sibling artifacts.** An ADR is `index.md`.

An ADR's substance is argument, and argument does not have a machine-readable
form. Everything structured that an ADR touches already lives somewhere with an
SRN — the schema it changed, the protocol it introduced, the requirement it
satisfies — and the ADR points at those by reference rather than copying them.
Supporting material (a benchmark dump, a hand-drawn diagram) MAY sit next to
`index.md`; the portal links it but does not interpret it.

## Supersession

Supersession uses the common `supersedes` edge and is **additive-only**: the
old ADR stays on the filesystem forever.

The procedure, which is the general swap of [evolution.md](../evolution.md)
specialized to ADRs:

1. Write the successor ADR with its own ordinal, `version: 1`,
   `decision-status: proposed`, and the edge:

   ```yaml
   # solutions/acme/product/shop/adr/0009-change-data-capture/index.md
   name: 0009-change-data-capture
   kind: adr
   version: 1
   decision-status: proposed
   date: 2026-07-02
   relations:
     supersedes:
       - ../0001-event-sourcing     # sibling ADR in the same bucket — a relative
                                    # ref is resolved from this entity's own
                                    # directory, so a sibling needs the `../`
   ```

2. When the successor is accepted, set its `decision-status: accepted` and its
   `date`, and set the predecessor to `decision-status: superseded` with the
   same date, bumping the predecessor's `version`.
3. **Never delete, never edit the predecessor's `## Decision`.** Its text is a
   true statement about what was decided in 2024, and it stays true.
4. The inverse edge `superseded-by` is **derived**. Do not author it on the old
   ADR ([frontmatter.md](../frontmatter.md)).

Chains are ordinary: `0009` supersedes `0001`, and a later `0014` supersedes
`0009`. The portal walks the derived inverse to render the whole lineage on
every ADR in it.

Consistency checks, both reported as `W_ADR_SUPERSESSION`:

- An ADR with `decision-status: superseded` that no other ADR supersedes.
- An ADR that is the target of a `supersedes` edge but whose `decision-status`
  is not `superseded` (usually the step-2 bump was forgotten).

## Evolution

The ADR's contract surface is the **`## Decision` paragraph**. Per
[evolution.md](../evolution.md):

- Legal at `version: N+1` — clarify wording, append a consequence that turned
  out to be real, add references and relations, correct a typo in `deciders`.
- ILLEGAL in place — reversing or narrowing the decision. That is a new ADR
  plus a `supersedes` edge, never an edit.
- Moving `decision-status` (`proposed → accepted`, `accepted → superseded`) is
  a **content change and MUST bump `version`**, and `date` moves with it. This
  is the one place where the ADR kind differs visibly from the common rule:
  [evolution.md](../evolution.md) exempts a change to `status` alone from the
  bump, because `status` is workflow state; `decision-status` is not `status`,
  it is a fact about the architecture, and it is versioned like any other fact.
- Recording a supersession is **not** a violation of the additive rule. The
  decision text is untouched; only its standing is recorded. The reversal lives
  in the successor entity, which is exactly what the swap procedure requires.

## Worked example

`solutions/acme/product/shop/adr/0001-event-sourcing/index.md`:

```markdown
---
name: 0001-event-sourcing
kind: adr
version: 3
title: Event-source the order lifecycle
summary: Order state is derived from an append-only event log rather than stored as mutable rows.
status: approved
owner: team-commerce
decision-status: superseded
date: 2026-07-02
deciders:
  - team-commerce
  - team-platform
  - sergio
relations:
  uses:
    - ../../protocol/order-events            # this product's own protocol:
                                             # pop the name, pop the adr/ bucket
    - /product/shop/datamodel/order-placed@1
tags:
  - persistence
  - orders
---

## Context

Order state was mutated in place by four components, and reconstructing "what
did this order look like on Tuesday" required log archaeology. Two incidents in
Q4 came down to a lost intermediate state. Regulatory review requires a
five-year audit trail of price and status changes.

## Decision

We event-source the order lifecycle. `checkout` appends immutable events to the
order log; current order state is a projection rebuilt from that log. The
[order-events](srn://acme/product/shop/protocol/order-events) protocol is the only
write path.

## Consequences

- Audit and time-travel queries become trivial; the five-year requirement is
  satisfied by retention alone.
- Every reader must tolerate eventual consistency of projections; the
  storefront shows a "pending" state it did not previously need.
- Rebuild cost grows with log size; a snapshot mechanism will be needed before
  the log passes roughly ten million events.
- The team pays a permanent modelling tax: schema evolution is now governed by
  the additive rule at the event level, with no migrations available.

## Alternatives considered

- **Audit columns on mutable rows.** Cheapest to build, but it records that a
  field changed, not why, and it cannot reconstruct intermediate states. Fails
  the regulatory requirement.
- **Change-data-capture from the database log.** Rejected in 2024 because the
  managed database in use offered no stable CDC guarantee. This is what
  eventually superseded the decision — see
  [0009-change-data-capture](srn://acme/product/shop/adr/0009-change-data-capture) —
  once that guarantee arrived.
- **Do nothing and improve logging.** Rejected: it addresses the incidents but
  not the audit obligation.
```

Note what this example carries: `status: approved` with
`decision-status: superseded`, a `date` that moved when the standing changed,
and no `superseded-by` edge — that one is derived from ADR-0009's `supersedes`.

## Validation rules

| #    | Rule                                                                                  | Class                |
| ---- | ------------------------------------------------------------------------------------- | -------------------- |
| ADR1 | `decision-status` present and a member of the closed enum.                            | `E_FM_SCHEMA`        |
| ADR2 | `date` present and a bare ISO-8601 calendar date (no time, no timezone).              | `E_ADR_DATE`         |
| ADR3 | `deciders` present and non-empty when `decision-status` is `accepted` or `rejected`.  | `E_ADR_DECIDERS`     |
| ADR4 | The four canonical level-2 headings are present with exact text and casing.           | `E_ADR_SECTIONS`     |
| ADR5 | `decision-status` / `date` / `deciders` appear only on `kind: adr` entities.          | `E_FM_UNKNOWN_FIELD` |
| ADR6 | `decision-status: superseded` has a superseding ADR, and a superseded target says so. | `W_ADR_SUPERSESSION` |
| ADR7 | Ordinal prefixes are unique within one `adr/` bucket.                                 | `W_ADR_ORDINAL`      |
| ADR8 | Every measured number sits in a section that names the date or commit it was taken.   | `W_ADR_MEASUREMENT`  |

ADR1–ADR5 and ADR8 are checkable from the entity alone; ADR6–ADR7 need the
resolved catalog.

## What the portal derives

- **ADR page** — `decision-status` badge, date, deciders, the four named
  sections rendered in canonical order, plus any extra sections after them.
- **Per-owner ADR list** — every ADR in a container's bucket, sorted by `date`
  descending, filterable by `decision-status`. Rendered on the container's page
  and on the solution dashboard.
- **Supersession lineage** — the chain through `supersedes` and its derived
  inverse `superseded-by`, shown on every ADR in the chain.
- **Decision back-links** — for any entity an ADR references, the derived
  `used-by` inverse surfaces "decisions that mention this" on that entity's
  page; a datamodel or protocol page therefore carries its own rationale.
- **Previous-version button** — the git-backed history of the ADR, which for an
  ADR is a record of how its standing moved over time
  ([evolution.md](../evolution.md)).

A cross-catalog ADR timeline is explicitly **deferred** in the founding
decision record and is not part of v1.

## ADR error classes

| Code                 | Meaning                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `E_ADR_DATE`         | `date` missing, or not a bare `YYYY-MM-DD` calendar date.                                |
| `E_ADR_DECIDERS`     | `decision-status` is `accepted` or `rejected` with an absent or empty `deciders` list.   |
| `E_ADR_SECTIONS`     | A canonical body section is missing, at the wrong heading level, or spelled differently. |
| `W_ADR_SUPERSESSION` | `superseded` with no superseding ADR, or a `supersedes` target not marked `superseded`.  |
| `W_ADR_ORDINAL`      | Two ADRs in the same bucket share an ordinal prefix.                                     |
| `W_ADR_MEASUREMENT`  | A measured number in a section that names no date and no commit.                         |

Frontmatter shape errors reuse `E_FM_SCHEMA` and `E_FM_UNKNOWN_FIELD`
([frontmatter.md](../frontmatter.md)); placement is unconstrained beyond the
common container rules in [structure.md](../structure.md).

`W_PROSE_MEASUREMENT` is the same subject read from the other side and is
defined in [structure.md](../structure.md#measured-facts-in-the-prose), because
it is a rule about every kind that is *not* this one. An ADR never raises it.
